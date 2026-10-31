# Runbooks do OrderFlow

Um runbook é o que a pessoa de plantão lê às 3h da manhã, com o alerta tocando e sem contexto.
Por isso todos seguem o mesmo formato e começam pelo que fazer, não pela teoria. A explicação de
como escrever (e testar) um runbook está na [lição 7.7](../modulo-07/07-deploy-sem-downtime-e-runbooks.md).

| Runbook | Alerta que aponta para ele | Severidade |
|---|---|---|
| [Erros 5xx no Orders](erros-5xx-orders.md) | `OrdersQueimaRapidaDoOrcamentoDeErro`, `OrdersQueimaLentaDoOrcamentoDeErro` | página |
| [Lag de consumidor Kafka](lag-de-consumidor.md) | `KafkaLagCrescendo` | página |
| [Taxa de aprovação de pagamentos caiu](aprovacao-de-pagamentos-caiu.md) | `PagamentosTaxaDeAprovacaoCaiu` | ticket |
| [Deploy e rollback](deploy-e-rollback.md) | (procedimento, sem alerta) | — |

As regras de alerta estão em [`deploy/observabilidade/alertas/orderflow-slo.rules.yaml`](../../deploy/observabilidade/alertas/orderflow-slo.rules.yaml).

## Modelo

```markdown
# <Sintoma, do jeito que o alerta descreve>

**Alerta:** <nome>  ·  **Severidade:** página | ticket  ·  **Dono:** <time>

## Impacto
O que o cliente sente enquanto isto dura.

## Primeiros 5 minutos
Passos numerados, com comandos e links prontos para copiar. O objetivo é ESTANCAR, não entender.

## Diagnóstico
Perguntas em ordem, cada uma com onde olhar e o que significa cada resposta.

## Mitigação
Ações reversíveis primeiro (rollback, escalar, desligar flag). Ações irreversíveis exigem segunda pessoa.

## Quando escalar
Prazo e para quem.

## Depois
Postmortem sem culpados se houve impacto; atualizar este runbook com o que faltou.
```

## Convenções usadas em todos

- Namespace dos serviços: `orderflow`. Releases Helm: `orders`, `payments`.
- Namespace do Kafka (Strimzi): `kafka`. Consumer groups: `payments` (lê `orders.events`) e
  `orders` (lê `payments.events`).
- Grafana: painel **OrderFlow** (`deploy/observabilidade/dashboards/orderflow.json`).
- Comando `kafka-consumer-groups.sh` roda dentro de um pod do broker:
  `kubectl -n kafka exec -it <pod-do-broker> -- bin/kafka-consumer-groups.sh ...`
