# 1.6 Primeiro endpoint, OpenAPI + Scalar e ProblemDetails

O primeiro endpoint do CreditFlow é o mais simples possível de propósito, para o foco ficar no caminho que toda requisição faz: `GET /v1/simulacoes/taxas`, público, lista as faixas de score e a taxa de cada uma.

## O endpoint

Em [`SimulacaoEndpoints.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Api/SimulacaoEndpoints.cs):

```csharp
var grupo = endpoints.MapGroup("/v1/simulacoes")
    .WithTags("Simulações")
    .AllowAnonymous()
    .RequireRateLimiting(PoliticaDeLimite);

grupo.MapGet("/taxas", async (ITabelaDeTaxas tabela, CancellationToken ct) =>
    {
        var faixas = await tabela.ObterFaixasAsync(ct);
        return TypedResults.Ok(faixas
            .OrderByDescending(f => f.ScoreMinimo)
            .Select(f => new FaixaResponse(f.Nome, f.ScoreMinimo, f.TaxaMensal.PontosArredondados(2)))
            .ToList());
    })
    .WithName("ListarTaxas")
    .WithSummary("Faixas de score e taxa de juros mensal de cada uma");
```

| Peça | O que faz |
|---|---|
| `MapGroup` | Prefixo e configuração comuns: tag do OpenAPI, autorização, rate limit, num lugar só |
| Parâmetros do lambda | O ASP.NET decide de onde vem cada um: `ITabelaDeTaxas` do DI (porque está registrado), `CancellationToken` da requisição (cancela se o cliente desconectar) |
| `TypedResults.Ok(...)` | Retorno tipado: o gerador de OpenAPI sabe que a resposta é 200 com `List<FaixaResponse>` sem você declarar |
| `WithName` | O `operationId` no OpenAPI: é o nome do método nos clientes gerados |

::: porque `TypedResults` e não `Results`
`Results.Ok(x)` devolve `IResult`, e o gerador do OpenAPI não sabe o tipo do corpo. `TypedResults.Ok(x)` devolve `Ok<T>`, que carrega o tipo. Nos endpoints que podem devolver erro, o CreditFlow devolve `IResult` e declara as respostas com `.Produces<T>(201)` e `.ProducesProblem(404)`. Visto a fundo em [Plataforma, lição 2.2](../../../plataforma-dotnet/docs/modulo-02/02-descrevendo-endpoints.md).
:::

## OpenAPI nativo + Scalar

```csharp
builder.Services.AddOpenApi(o => o.AddDocumentTransformer((documento, _, _) =>
{
    documento.Info ??= new();
    documento.Info.Title = "CreditFlow API";
    documento.Info.Description = $"Perfil deste processo: {perfil}";
    return Task.CompletedTask;
}));
// ...
if (perfil.EhApi)
{
    app.MapOpenApi();                                       // /openapi/v1.json
    app.MapScalarApiReference(o => o.WithTitle("CreditFlow")); // /scalar
}
```

::: conceito OpenAPI, e quem desenha a tela
OpenAPI é o **documento** (JSON) que descreve rotas, parâmetros, corpos e respostas. Desde o .NET 9, o próprio ASP.NET gera esse documento (`Microsoft.AspNetCore.OpenApi`), sem o Swashbuckle. A **tela** que lê o documento é outra peça: aqui o Scalar. Separar as duas permite trocar a tela sem mexer no contrato, e gerar clientes (TypeScript, por exemplo) direto do JSON.
:::

::: porque O perfil na descrição
Com quatro deployments da mesma imagem, "qual pod respondeu isso?" é uma pergunta frequente. O documento OpenAPI de cada pod diz o perfil dele, e o pod api-simulacao mostra só os endpoints de Simulação. Um olhar no `/scalar` responde.
:::

::: video 4 Options to Replace Swagger in .NET 9 APIs (IAmTimCorey, em inglês)
https://www.youtube.com/watch?v=Tx49o-5tkis
O que mudou desde o .NET 9 e as opções de tela: Swagger UI, Scalar, ReDoc.
:::

## ProblemDetails: um formato de erro para tudo

```csharp
builder.Services.AddProblemDetails(o => o.CustomizeProblemDetails = ctx =>
    ctx.ProblemDetails.Extensions["traceId"] = Activity.Current?.TraceId.ToString() ?? ctx.HttpContext.TraceIdentifier);

app.UseExceptionHandler();
app.UseStatusCodePages();
```

E a tradução do `Erro` do domínio, num lugar só ([`ResultadoHttp.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Api/ResultadoHttp.cs)):

| `TipoErro` | Status |
|---|---|
| `Validacao` | 400 (com `errors` por campo) |
| `NaoEncontrado` | 404 |
| `Conflito` | 409 |
| `Regra` | 422 |
| `Indisponivel` | 503 |

```json
{
  "type": "urn:creditflow:erro:simulacao.prazo_fora_da_faixa",
  "title": "Requisição inválida",
  "status": 400,
  "detail": "Um ou mais campos são inválidos.",
  "errors": { "valor": ["O valor deve estar entre..."], "prazoMeses": ["O prazo deve estar entre 6 e 48 meses."] },
  "code": "validacao",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

::: conceito ProblemDetails (RFC 9457)
Um formato padrão de corpo de erro HTTP, `application/problem+json`: `type` (URI que identifica o tipo do problema), `title`, `status`, `detail`, `instance` e extensões livres. Padronizar significa que o front escreve **um** tratador de erro, e não um por endpoint.
:::

::: porque O `code` e o `traceId`
A mensagem muda (alguém corrige a gramática, traduz para inglês); o `code` não. O front e os testes comparam o `code`. O `traceId` é o mesmo id do rastreamento distribuído (módulo 12): o suporte cola o id e encontra o trace e os logs daquela requisição.
:::

::: previsao
Três requisições. Qual status e qual corpo cada uma recebe?

1. `GET /v1/simulacoes/taxa` (sem o "s")
2. `GET /v1/clientes/00000000-0000-0000-0000-000000000001` sem token
3. Um bug: o `ObterFaixasAsync` lança `NullReferenceException`
???
1. **404 com ProblemDetails** (`title: "Not Found"`, com `traceId`). Nenhuma rota casou, a resposta sairia vazia, e o `UseStatusCodePages` escreve o corpo padrão.
2. **401 com ProblemDetails**: Clientes exige autenticação (`RequireAuthorization`). O desafio do autenticador deixa a resposta sem corpo, e de novo o `UseStatusCodePages` completa.
3. **500 com ProblemDetails**, **sem** a pilha da exceção no corpo (em produção). O `UseExceptionHandler` captura, registra o erro no log com a pilha, e responde o formato padrão. Vazar pilha é dar o mapa do código para quem está atacando.
:::

::: quebra Lab: tire o `UseExceptionHandler`
Comente `app.UseExceptionHandler();`, rode com `ASPNETCORE_ENVIRONMENT=Production` e force um erro (por exemplo, `throw new InvalidOperationException("teste")` no endpoint de taxas). Qual o corpo e o `Content-Type` da resposta?
:::

::: solucao
Um 500 **sem corpo**. O front recebe algo que não é JSON e o tratador genérico dele quebra também. Em `Development`, você veria a página de exceção do desenvolvedor (HTML com a pilha), o que esconde o problema localmente e faz parecer que "funciona". Por isso vale testar o comportamento de erro com `ASPNETCORE_ENVIRONMENT=Production` pelo menos uma vez.
:::

::: checkpoint
```bash
curl -s localhost:8080/v1/simulacoes/taxas
# [{"nome":"A","scoreMinimo":800,"taxaMensalPercentual":1.49}, ...]
curl -s localhost:8080/openapi/v1.json | head -c 300
curl -si localhost:8080/v1/simulacoes/taxa | head -n 1     # 404
```
Abra http://localhost:8080/scalar e faça a chamada pela tela.
:::

## Perguntas para responder sem olhar

::: pergunta
Qual a diferença entre o pacote `Microsoft.AspNetCore.OpenApi` e o Scalar?
???
O primeiro gera o documento OpenAPI (JSON) a partir dos endpoints; o Scalar é uma interface que lê esse documento e o apresenta. Uma é o contrato, a outra é a tela.
:::

::: pergunta
Por que o corpo de erro tem um `code` se já tem `status` e `title`?
???
Status é grosso demais (vários erros diferentes são 400) e título/mensagem mudam. O `code` é estável e é o que o front e os testes usam para decidir o que fazer.
:::

**Próximo:** [Desafio do módulo](desafio.md).
