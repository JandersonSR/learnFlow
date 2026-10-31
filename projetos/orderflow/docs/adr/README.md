# Registros de decisão de arquitetura (ADRs)

Cada arquivo registra **uma** decisão que seria cara de desfazer: o contexto em que foi tomada, as
alternativas consideradas, o que se ganhou e o que se pagou. Como escrever e revisar um ADR está
na [lição 8.1](../modulo-08/01-adrs.md).

| # | Decisão | Status | Módulo |
|---|---|---|---|
| [0001](0001-servicos-poliglotas-dotnet-e-java.md) | Dois serviços em stacks diferentes (.NET e Java) | Aceito | 1, 1-J |
| [0002](0002-integracao-assincrona-por-kafka.md) | Integração só por eventos no Kafka, chave = `orderId` | Aceito | 2 |
| [0003](0003-outbox-transacional.md) | Outbox transacional com relay por polling, e não CDC | Aceito | 3 |
| [0004](0004-idempotencia-na-borda-e-no-consumidor.md) | Idempotência em duas camadas: `Idempotency-Key` na API e consumidor idempotente | Aceito | 1, 3 |
| [0005](0005-contratos-de-eventos-versionados.md) | Contratos de evento em Avro no Schema Registry, compatibilidade FULL_TRANSITIVE | Aceito | 3 |
| [0006](0006-aks-helm-e-strimzi.md) | AKS + Helm, com Kafka no cluster via Strimzi | Aceito | 4 a 6 |
| [0007](0007-opentelemetry-e-grafana-lgtm.md) | OpenTelemetry nas duas stacks (Micrometer no Java), Collector e Grafana LGTM | Aceito | 7 |
| [0008](0008-deploy-por-pipeline-com-oidc.md) | Deploy por pipeline (push) com OIDC, rolling update e Helm `--rollback-on-failure` | Aceito | 7 |

## Regras deste repositório

- Um ADR **aceito não se edita** (exceto erro de digitação). Mudou a decisão? Escreva um novo que
  o **substitui** e mude o status do antigo para `Substituído por NNNN`. O histórico de por que se
  mudou de ideia vale tanto quanto a decisão atual.
- Um ADR nasce num PR, como `Proposto`, e é revisado como código. Vira `Aceito` no merge.
- Curto: se passa de uma página e meia, provavelmente são duas decisões.

## Modelo

```markdown
# NNNN. <Decisão, no imperativo ou como afirmação>

- **Status:** Proposto | Aceito | Substituído por NNNN | Descontinuado
- **Data:** AAAA-MM-DD
- **Decisores:** <quem>

## Contexto
As forças em jogo: requisitos, restrições, o que dói hoje. Fatos, não a solução.

## Decisão
O que vamos fazer, em uma ou duas frases afirmativas. Depois, os detalhes que importam.

## Alternativas consideradas
Cada uma com o motivo de não ter sido escolhida. "Não pensamos em outra" é sinal de ADR fraco.

## Consequências
O que fica melhor, o que fica pior, o que passa a ser obrigatório. As negativas são obrigatórias.

## Revisitar quando
O gatilho concreto que faria a decisão mudar (volume, custo, time, um produto novo).
```
