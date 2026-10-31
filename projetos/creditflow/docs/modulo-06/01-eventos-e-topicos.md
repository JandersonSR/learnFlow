# 6.1 Eventos de integração, tópicos, chaves e versões

Antes de escrever uma linha de outbox, é preciso decidir **o que** trafega. Um tópico mal desenhado no começo vira dívida que ninguém consegue pagar depois: consumidores de outros times passam a depender dele, e mudar a chave ou o formato vira um projeto.

## Dois tipos de evento, duas vidas diferentes

Abra [`Domain/EventosDeDominio.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Propostas/CreditFlow.Modules.Propostas/Domain/EventosDeDominio.cs) em Propostas e depois [`Contracts/Eventos/EventosDePropostas.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Propostas/CreditFlow.Modules.Propostas.Contracts/Eventos/EventosDePropostas.cs). Os dois têm um `ContratoAssinado`. Não é duplicação.

::: conceito Evento de domínio × evento de integração
**Evento de domínio** é um fato *dentro* do módulo, para o próprio módulo reagir: o agregado `Proposta` registra `ContratoAssinado` na lista `EventosDeDominio` quando `Contratar` dá certo. Ele usa tipos internos (`ParcelaContratada`), pode ser renomeado num refactor e nunca sai do processo.

**Evento de integração** é um fato *publicado* para outros módulos, pelo Kafka. Mora em `*.Contracts`, tem nome e versão estáveis (`[EventoIntegracao("ContratoAssinado", 1, Topicos.Propostas)]`), usa só tipos primitivos e é tratado como uma API pública: muda com o mesmo cuidado de um endpoint HTTP.

Quem traduz um no outro é a infraestrutura de Propostas, na hora de gravar a outbox (lição 6.2).
:::

::: analogia
Pense no seu trabalho de inspetor de qualidade numa linha de máquinas agrícolas. A anotação no seu caderno ("parafuso da tampa com torque baixo, refiz") é evento de domínio: serve para você, no seu vocabulário. O **laudo** que vai para o cliente é evento de integração: tem formato fixo, número de revisão, e mudar um campo exige avisar quem lê. Você não manda o caderno para o cliente.
:::

::: porque Por que não publicar o evento de domínio direto
Porque aí qualquer refactor interno quebra os outros módulos sem aviso. O evento de domínio de Propostas usa `SolicitanteId`; o de integração chama o mesmo dado de `UsuarioId`, porque é assim que Pagamentos e Notificações pensam. Renomear o campo interno amanhã não muda nada lá fora. É a mesma ideia do DTO na API HTTP: o contrato é uma camada de proteção.
:::

## Os tópicos: um por módulo que publica

```csharp
public static class Topicos
{
    public const string Propostas = "creditflow.propostas.v1";
    public const string Pagamentos = "creditflow.pagamentos.v1";
    public const string Simulacoes = "creditflow.simulacoes.v1";
}
```

Por que não um tópico por tipo de evento (`proposta-aprovada`, `contrato-assinado`...)? Porque **a ordem só existe dentro de uma partição de um tópico**. Se `PropostaAprovada` e `ContratoAssinado` da mesma proposta fossem para tópicos diferentes, um consumidor poderia ver o contrato antes da aprovação. Com um tópico por módulo e a chave certa, os fatos de uma proposta chegam na ordem em que aconteceram.

| Decisão | Escolha | Custo aceito |
|---|---|---|
| Granularidade | Um tópico por módulo publicador | O consumidor recebe tipos que não quer e **ignora** pelo cabeçalho `cf-tipo`, sem desserializar |
| Sufixo `.v1` | Versão do **tópico** (chave, envelope, cabeçalhos) | Trocar a chave exige um tópico `.v2` e migração dos consumidores |
| Partições | 6 | Teto de 6 consumidores por grupo (lição 8.5) |
| Retenção | 7 dias | Reprocessar mais antigo que isso exige outra fonte |

## A chave: o id da proposta, também em Pagamentos

A chave decide a partição: `partição = hash(chave) % 6`. Mesma chave, mesma partição, mesma ordem.

- `creditflow.propostas.v1`: chave = `PropostaId`. Óbvio.
- `creditflow.pagamentos.v1`: chave = **`PropostaId`**, e não `DesembolsoId` nem `ParcelaId`.

::: porque Por que a proposta, e não o id do agregado de Pagamentos
A SPEC diz "chave = id do agregado". Em Pagamentos, seguir isso ao pé da letra espalharia os fatos de um contrato por partições diferentes: `DesembolsoConcluido` com a chave do desembolso, cada `ParcelaPaga` com a chave da sua parcela. Um consumidor que monta o extrato do contrato poderia ver a parcela 3 paga antes do desembolso concluído.

A proposta é o **id de correlação da saga**. Desembolso é 1:1 com a proposta, então para ele dá no mesmo; para as parcelas, a chave da proposta garante a ordem que importa: desembolso → parcela 1 → ... → parcela N → quitação. O desvio da regra está escrito no comentário de [`EventosDePagamentos.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Pagamentos/CreditFlow.Modules.Pagamentos.Contracts/Eventos/EventosDePagamentos.cs) e no ADR 0006. Desvio de regra sem registro é bug esperando acontecer.
:::

::: previsao
Um time pede para mudar a chave de `creditflow.pagamentos.v1` de `PropostaId` para `ClienteId`, "para ver todos os pagamentos de um cliente em ordem". O tópico já tem eventos de três meses. O que acontece se você só trocar a chave no código e fizer deploy?
???
Eventos **novos** de uma proposta passam a cair na partição de `hash(ClienteId)`, enquanto os **antigos** da mesma proposta estão na partição de `hash(PropostaId)`. Na transição, um consumidor pode ler a `ParcelaPaga` nova (partição X) antes de terminar a fila da partição Y onde está o `DesembolsoConcluido` antigo, ainda com lag. A ordem por proposta quebra exatamente durante o deploy.

Por isso a chave faz parte da versão do **tópico**: mudar a chave é criar `creditflow.pagamentos.v2`, publicar nos dois por um tempo (ou migrar os consumidores com o v1 drenado) e aposentar o v1. E a pergunta de produto ("ver todos os pagamentos de um cliente") se resolve com uma consulta, não com a chave.
:::

## Cabeçalhos: o envelope fora do corpo

O corpo da mensagem é só o JSON do evento. Os metadados vão em cabeçalhos Kafka ([`Cabecalhos.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/Cabecalhos.cs)):

| Cabeçalho | Exemplo | Para quê |
|---|---|---|
| `cf-evento-id` | `0192f...` (Guid v7) | Chave da inbox: sem ele não há consumidor idempotente |
| `cf-tipo` | `ContratoAssinado` | O consumidor decide se quer a mensagem **sem desserializar** |
| `cf-versao` | `1` | Qual record .NET usar para desserializar |
| `cf-ocorrido-em` | `2026-10-30T12:00:00Z` | Quando o fato aconteceu (não quando foi publicado) |
| `traceparent` / `tracestate` | `00-4bf9...-01` | W3C Trace Context: um trace só da requisição HTTP ao consumo |

::: porque Cabeçalho e não envelope JSON
Com envelope (`{"tipo": "...", "dados": {...}}`), todo consumidor desserializa todas as mensagens só para descobrir que não quer a maioria. Com cabeçalho, o `ConsumidorKafka` lê `cf-tipo`, vê que o grupo não conhece esse tipo e confirma o offset sem tocar no corpo. No tópico de Propostas, Pagamentos só quer `ContratoAssinado`: as outras quatro em cada cinco mensagens custam quase nada.
:::

## Versões: o leitor tolerante

```csharp
[EventoIntegracao("ContratoAssinado", 1, Topicos.Propostas)]
public sealed record ContratoAssinado(Guid EventoId, DateTimeOffset OcorridoEm, Guid PropostaId, ...);
```

As regras (estão no comentário de [`EventoIntegracaoAttribute.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/EventoIntegracaoAttribute.cs)):

- **Acrescentar campo opcional**: mesma versão. O `System.Text.Json` ignora o que não conhece, então o consumidor antigo não quebra. É o teste `Leitor_tolerante_ignora_campo_novo_do_produtor`.
- **Renomear, remover, mudar tipo ou significado**: versão nova, record novo (`ContratoAssinadoV2` com `[EventoIntegracao("ContratoAssinado", 2, ...)]`).
- **Consumidor que conhece o tipo mas não a versão**: falha **permanente**, vai para a DLT. O produtor está à frente do consumidor, e alguém precisa decidir.

::: armadilha Dinheiro em `double` no contrato
Um consumidor em JavaScript lê `0.1 + 0.2` e grava `0.30000000000000004`. Todos os valores dos eventos do CreditFlow são `long` em **centavos** (`ValorLiquidoCentavos`), com o nome dizendo a unidade. Taxas são `decimal` com o significado no nome. Contrato público não é lugar para ambiguidade de unidade.
:::

::: dica
O `Guid.CreateVersion7()` do .NET 9+ gera ids ordenáveis pelo tempo. Para `EventoId` isso ajuda o índice da inbox (inserções no fim da árvore, não espalhadas) e facilita ler logs.
:::

## Perguntas para responder sem olhar

::: pergunta
Qual a diferença entre evento de domínio e evento de integração, e por que não publicar o de domínio direto?
???
Domínio: fato interno, tipos internos, muda em qualquer refactor, não sai do processo. Integração: contrato público em `*.Contracts`, nome e versão estáveis, tipos primitivos. Publicar o de domínio acopla os outros módulos à estrutura interna: um rename quebra todos sem aviso.
:::

::: pergunta
Por que um tópico por módulo e não um por tipo de evento?
???
Porque a ordem só existe dentro de uma partição de um tópico. Eventos da mesma proposta em tópicos diferentes podem ser lidos fora de ordem. Um tópico por módulo + chave = id da proposta garante a ordem por proposta.
:::

::: pergunta
O que muda a versão de um evento e o que não muda?
???
Acrescentar campo opcional não muda (leitor tolerante ignora o desconhecido). Renomear, remover, mudar tipo ou significado muda: novo record com versão nova. Mudar a chave muda a versão do **tópico**.
:::

**Próxima:** [6.2 Dual write e a outbox por dentro](02-dual-write-e-outbox.md).
