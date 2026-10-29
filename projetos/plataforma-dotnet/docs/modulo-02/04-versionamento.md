# 2.4 Versionar e evoluir sem quebrar ninguém

Uma API usada por parceiros não pode mudar no ritmo do seu código. Cada parceiro tem o próprio calendário de deploy, e alguns vão levar meses para atualizar. A pergunta de todo PR que mexe na API é: **isto quebra quem já integra?**

## A regra do projeto

O comentário no [`Program.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.Cep.Api/Program.cs) resume a política:

```csharp
// Versão na URL: mudança incompatível vira /v2, campos novos são só aditivos.
app.MapGroup("/v1").MapModulos(modulos);
```

E o evento do Kafka segue a mesma regra (veja o [`CepConsultado.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.Cep.Contratos/CepConsultado.cs)): campo novo é opcional, quem consome ignora o que não conhece, mudança incompatível vira outro tópico.

## O que quebra e o que não quebra

| Mudança | Quebra? | Por quê |
|---|---|---|
| Acrescentar campo na resposta | Não* | Clientes bem escritos ignoram o que não conhecem |
| Acrescentar parâmetro **opcional** na requisição | Não | Quem não manda continua funcionando |
| Acrescentar endpoint novo | Não | Ninguém dependia dele |
| Remover ou renomear campo da resposta | **Sim** | Quem lia o campo passa a receber nada |
| Mudar o tipo de um campo (`string` → `number`) | **Sim** | O desserializador do cliente falha |
| Campo que podia vir `null` passa a nunca vir (ou o contrário) | Depende / **Sim** | Tornar obrigatório na requisição quebra; passar a mandar `null` onde não mandava quebra quem não tratava |
| Novo status de erro numa operação existente | **Sim**, na prática | O cliente não tem tratamento para ele |
| Mudar o significado de um `codigo` de erro | **Sim** | Por isso os códigos nunca mudam de significado |
| Tornar obrigatório um parâmetro que era opcional | **Sim** | Quem não mandava passa a receber 400 |

\* "Não quebra" depende de o cliente ser **leitor tolerante**: ignorar campos desconhecidos. A maioria dos serializadores faz isso por padrão, mas alguns clientes em Java configuram para falhar com campo desconhecido. Vale escrever no contrato que campos novos podem aparecer.

::: previsao
O cabeçalho `X-Cache` hoje vale `HIT`, `MISS` ou `STALE`. Um colega quer acrescentar o valor `PARTIAL`. É uma mudança compatível? Escreva seu raciocínio antes de abrir.
???
**Depende do que o contrato prometeu**, e por isso é a pergunta favorita de entrevistas.

Acrescentar um valor numa lista fechada (enum, conjunto de valores de cabeçalho) **quebra** quem tratou os valores de forma exaustiva: um `switch` sem caso padrão no cliente, ou um enum gerado a partir da especificação que falha ao desserializar um valor desconhecido.

Não quebra se o contrato disse desde o início que **a lista pode crescer** e que valores desconhecidos devem ser tratados como um caso genérico.

Na prática: trate como incompatível, a menos que o contrato documente a extensibilidade. É mais um motivo para escrever isso na descrição desde a primeira versão.
:::

## Onde colocar a versão

| Estratégia | Exemplo | A favor | Contra |
|---|---|---|---|
| **Na URL** | `/v1/cep/...` | Visível, fácil de rotear no Ingress, de testar com `curl` e de ver nos logs | "A mesma coisa" ganha duas URLs |
| No cabeçalho | `Api-Version: 2` | URL estável | Invisível em logs e no navegador; fácil de esquecer |
| No tipo de mídia | `Accept: application/vnd.agx.v2+json` | Purista em REST | Difícil para quem integra; ferramentas lidam mal |
| Na query | `?api-version=2` | Simples | Mistura versão com filtros; caches tratam mal |

::: porque Por que URL no projeto
Para uma API B2B, o que mais pesa é **operação**: o suporte vê `/v1` ou `/v2` no log e sabe na hora qual contrato o parceiro usa; o Ingress pode mandar cada versão para um lugar; o teste com `curl` não exige cabeçalho. A pureza de REST pesa menos que isso.

Note também o teste `RotaSemVersao_Retorna404`: chamar `/cep/...` sem versão dá 404. Não existe "versão padrão" implícita, que mudaria de significado no dia em que a v2 nascesse.
:::

## Quando a mudança incompatível é inevitável

O caminho, em ordem:

1. **Criar a v2 ao lado da v1.** No projeto, um `app.MapGroup("/v2")` com os endpoints novos. A v1 continua igual.
2. **Avisar que a v1 vai acabar.** Na resposta da v1, os cabeçalhos `Deprecation` (RFC 9745) e `Sunset` (RFC 8594, com a data de desligamento), além do aviso direto aos parceiros.
3. **Medir quem ainda usa a v1.** Por rota e por parceiro, nas métricas ou nos logs. Desligar sem medir é desligar no escuro.
4. **Desligar** só quando o uso for zero ou quando o prazo acordado vencer.

::: armadilha
Manter duas versões custa: dois conjuntos de testes, dois caminhos de código, correções feitas em dobro. Por isso a primeira defesa é **evitar a mudança incompatível**: acrescentar um campo novo e deixar o velho, aceitar os dois formatos na entrada por um tempo. A v2 é para quando não tem jeito.
:::

## Desafio: um teste que protege o contrato

::: desafio
No `tests/Agx.Cep.Api.Tests`, crie um teste que baixa `/openapi/v1.json` da API em memória (com o `WebApplicationFactory<Program>` que os testes já usam) e compara com um arquivo aprovado, versionado no repositório. Se forem diferentes, o teste falha, grava a versão recebida ao lado e diz o que fazer.

**Critérios de aceite:**
- Na primeira execução, sem arquivo aprovado, o teste falha e grava a especificação recebida; você revisa e a promove a aprovada
- Mudar o `WithSummary` de um endpoint faz o teste falhar
- A comparação é de **JSON**, não de texto: espaços e ordem de formatação não importam
- O teste roda sem banco, como os de `ApiTests`
:::

::: dica Dica 1
O `WebApplicationFactory` sobe a aplicação no ambiente `Development` por padrão, então o `appsettings.Development.json` liga a documentação e `/openapi/v1.json` existe nos testes.
:::

::: dica Dica 2
`System.Text.Json.Nodes.JsonNode.DeepEquals` compara dois JSONs por estrutura. Para gravar o arquivo ao lado do teste (e não na pasta `bin`), use `[CallerFilePath]` para descobrir onde está o arquivo-fonte do teste.
:::

::: solucao
```csharp
using System.Runtime.CompilerServices;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Agx.Cep.Api.Tests.Integracao;

/// <summary>Mudou a especificação? O teste mostra a diferença e alguém decide se é compatível.</summary>
public class ContratoOpenApiTests(WebApplicationFactory<Program> fabrica) : IClassFixture<WebApplicationFactory<Program>>
{
    private static string Pasta([CallerFilePath] string arquivo = "") =>
        Path.Combine(Path.GetDirectoryName(arquivo)!, "Contrato");

    [Fact]
    public async Task Especificacao_v1_e_a_aprovada()
    {
        var aprovado = Path.Combine(Pasta(), "openapi-v1.json");
        var recebido = Path.Combine(Pasta(), "openapi-v1.recebido.json");

        var atual = await fabrica.CreateClient().GetStringAsync(new Uri("/openapi/v1.json", UriKind.Relative));
        var noRepositorio = File.Exists(aprovado) ? await File.ReadAllTextAsync(aprovado) : "{}";

        if (JsonNode.DeepEquals(JsonNode.Parse(atual), JsonNode.Parse(noRepositorio)))
        {
            File.Delete(recebido);
            return;
        }

        Directory.CreateDirectory(Pasta());
        await File.WriteAllTextAsync(recebido, atual);
        Assert.Fail($"""
            A especificação OpenAPI mudou.
            Compare {recebido} com {aprovado}.
            Se a mudança é intencional e compatível (lição 2.4), copie o recebido por cima do aprovado e explique no PR.
            """);
    }
}
```

Acrescente `*.recebido.json` ao `.gitignore`. O arquivo aprovado vai para o Git, e qualquer PR que mude a API mostra a diferença no próprio diff do JSON: o revisor vê exatamente o que mudou no contrato.

Para ir além: ferramentas como `oasdiff` comparam duas especificações e dizem **quais mudanças são incompatíveis**, e dá para rodá-las no pipeline para bloquear o PR.
:::

## Perguntas para responder sem olhar

::: pergunta
Cite três mudanças compatíveis e três incompatíveis numa API.
???
Compatíveis: campo novo na resposta, parâmetro novo opcional, endpoint novo. Incompatíveis: remover ou renomear campo, mudar o tipo de um campo, tornar obrigatório um parâmetro opcional (também: novo status de erro numa operação, mudar o significado de um código de erro).
:::

::: pergunta
Por que o projeto versiona pela URL?
???
Porque é visível em logs, fácil de rotear no Ingress e de testar com `curl`, e não existe versão implícita que mude de significado. Para uma API B2B, a facilidade de operação pesa mais que a pureza de REST.
:::

::: pergunta
Como desligar uma versão antiga da API sem surpreender ninguém?
???
Criar a nova ao lado, avisar com os cabeçalhos `Deprecation` e `Sunset` e diretamente aos parceiros, medir quem ainda usa a versão antiga, e desligar só quando o uso zerar ou o prazo acordado vencer.
:::

**Próxima:** [Perguntas de entrevista do módulo](perguntas-de-entrevista.md).
