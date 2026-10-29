# 2.2 Descrevendo bem cada endpoint

O gerador de OpenAPI só sabe o que você conta para ele. Um `MapGet` sem nada além da rota vira uma especificação pobre: sem descrição, sem os erros possíveis, às vezes sem nem o tipo da resposta. O parceiro olha a documentação e não sabe o que esperar.

## Anatomia de um endpoint bem descrito

Abra o [`ConsultarCepEndpoint.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/Features/ConsultarCep/ConsultarCepEndpoint.cs):

```csharp
group.MapGet("/{cep}", Consultar)
    .WithName("ConsultarCep")
    .WithSummary("Consulta um endereço pelo CEP")
    .WithDescription("Responde da memória ou do cache persistente quando válido. X-Cache diz a origem ...")
    .ComValidacao<ConsultarCepRequest>()
    .Produces<ConsultarCepResponse>()
    .ProducesProblem(StatusCodes.Status404NotFound)
    .ProducesProblem(StatusCodes.Status429TooManyRequests)
    .ProducesProblem(StatusCodes.Status503ServiceUnavailable);
```

| Linha | O que vira na especificação | Por que importa |
|---|---|---|
| `WithName` | `operationId: ConsultarCep` | Geradores de cliente usam como nome do método (`client.ConsultarCepAsync(...)`). Sem ele, o nome sai inventado |
| `WithSummary` / `WithDescription` | Título e texto da operação | É o que o parceiro lê. Repare que a descrição explica os cabeçalhos `X-Cache`: comportamento que não aparece no tipo |
| `ComValidacao<T>()` | Resposta 400 com `ValidationProblem` (veja o `ProducesValidationProblem` dentro dela) | O 400 com `errors` por campo entra no contrato |
| `Produces<T>()` | Resposta 200 com o esquema de `ConsultarCepResponse` | O formato do sucesso |
| `ProducesProblem(404)`... | Respostas de erro em `application/problem+json` | Sem isso, o parceiro não sabe que 404, 429 e 503 existem e não trata |

O módulo também agrupa as rotas com `.WithTags("CEP")` no [`CepModulo`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/CepModulo.cs), o que organiza a documentação por área.

::: porque Por que `TypedResults` e não `Results`
O handler devolve `TypedResults.Ok(endereco)`. Com `TypedResults`, o tipo de retorno carrega o tipo do corpo, e o ASP.NET consegue inferir parte dos metadados de resposta sozinho. Também facilita os testes de unidade do handler: dá para verificar que o resultado é um `Ok<ConsultarCepResponse>` sem fazer requisição.

Aqui o handler devolve `IResult` em dois caminhos (sucesso e problema), então os `Produces` explícitos continuam necessários. Em handlers com um retorno só, `TypedResults` dispensa boa parte deles.
:::

::: previsao
Apague a linha `.ProducesProblem(StatusCodes.Status503ServiceUnavailable)`, rode a API e abra `/openapi/v1.json`. A especificação muda? A API muda de comportamento quando o ViaCEP está fora e não há cache?
???
A **especificação** perde a resposta 503 da operação `ConsultarCep`. O **comportamento** não muda nada: com a fonte fora e sem cache, o handler continua devolvendo `CepErros.FonteIndisponivel`, que vira 503.

É o pior cenário de contrato: a API faz uma coisa e a documentação diz outra. O cliente gerado a partir da especificação não terá um caminho para o 503, e o parceiro vai tratá-lo como erro desconhecido.

Os `Produces` são declarações, não comportamento. Nada no compilador garante que eles batem com o que o handler devolve. Quem garante é teste (lição 2.4) e revisão de código.
:::

::: armadilha
Documentar só o caminho feliz. Na prática, quem integra passa mais tempo tratando erro do que sucesso. Uma regra útil para revisão: **para cada `Erro` que o handler pode devolver, existe um `ProducesProblem` com o status correspondente?** Com o catálogo de erros num lugar só (`CepErros`), essa conferência leva um minuto.
:::

## Descrever os campos

O esquema da resposta sai do `record`:

```csharp
internal sealed record ConsultarCepResponse(
    string Cep,
    string? Logradouro,
    // ...
    DateTimeOffset ConsultadoEm);
```

Repare em três coisas que viram contrato sem você escrever nada:

- **`string?`** vira campo opcional/anulável na especificação. Mudar de `string?` para `string` depois é um compromisso novo com quem consome.
- **Os nomes** saem em camelCase no JSON (`consultadoEm`), pela configuração padrão do `System.Text.Json`.
- **`DateTimeOffset`** sai como data e hora com fuso (`2026-10-28T21:00:00+00:00`). Com `DateTime`, o fuso fica ambíguo, e alguém do outro lado vai interpretar errado.

Para descrever um campo com texto, use comentários XML (`/// <summary>`) com a geração de documentação ligada no projeto, ou o atributo `[Description]` no parâmetro.

## Exercício: descrever o ranking

::: desafio
O endpoint [`MaisConsultadosEndpoint`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/Features/Estatisticas/MaisConsultadosEndpoint.cs) recebe `quantidade` (de 1 a 50, padrão 10). Abra `/docs` e veja como ele aparece.

**Critérios de aceite:**
- A documentação diz que `quantidade` vai de 1 a 50 e que o padrão é 10
- A resposta 429 (rate limiting) aparece na operação, como no `ConsultarCep`
- Nenhuma mudança de comportamento: os testes existentes continuam passando
:::

::: dica Dica
O rate limiting é aplicado ao grupo inteiro (`RequireRateLimiting` no `CepModulo`), então o 429 pode acontecer também no ranking. Para o parâmetro, procure por `[Description]` e `[Range]` em parâmetros de Minimal API, ou descreva os limites no `WithDescription`.
:::

::: solucao
```csharp
group.MapGet("/mais-consultados", Listar)
    .WithName("CepsMaisConsultados")
    .WithSummary("Ranking dos CEPs mais consultados")
    .WithDescription("Calculado pelo worker a partir dos eventos do Kafka: pode atrasar alguns segundos. " +
                     "`quantidade` vai de 1 a 50; o padrão é 10, e valores fora da faixa são ajustados para o limite.")
    .Produces<CepMaisConsultado[]>()
    .ProducesProblem(StatusCodes.Status429TooManyRequests);

private static async Task<IResult> Listar(
    CepDbContext db,
    [Description("Quantos CEPs devolver, de 1 a 50. Padrão: 10.")] int? quantidade,
    CancellationToken ct)
```

(`using System.ComponentModel;` para o `[Description]`.)

Repare na decisão escondida no código original: `Math.Clamp` **ajusta** valores fora da faixa em vez de devolver 400. É um comportamento de contrato. Documentá-lo evita que o parceiro peça 1.000 e ache que recebeu tudo.
:::

## Perguntas para responder sem olhar

::: pergunta
Para que serve o `WithName` num endpoint, além de nomear a rota?
???
Vira o `operationId` da especificação, que os geradores de cliente usam como nome do método. Sem ele, o cliente gerado ganha nomes inventados e instáveis.
:::

::: pergunta
O compilador garante que os `ProducesProblem` batem com o que o handler devolve?
???
Não. Eles são declarações para a especificação. A garantia vem de revisão (cada `Erro` possível tem um `ProducesProblem`) e de testes de contrato.
:::

::: pergunta
Por que `DateTimeOffset` e não `DateTime` num contrato de API?
???
Porque `DateTimeOffset` carrega o fuso no valor serializado. Com `DateTime`, o mesmo texto pode ser lido como horário local ou UTC, e cada cliente interpreta de um jeito.
:::

**Próxima:** [2.3 Erros, cabeçalhos e correlação](03-erros-e-cabecalhos.md).
