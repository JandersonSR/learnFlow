# Taxa de aprovação de pagamentos caiu

**Alerta:** `PagamentosTaxaDeAprovacaoCaiu`  ·  **Severidade:** ticket (horário comercial)  ·  **Dono:** time de pagamentos

## Impacto

Mais clientes com pagamento recusado do que o normal. Pode ser perda direta de receita, ou pode
ser o sistema funcionando bem (uma tentativa de fraude em massa sendo barrada). Este alerta não
acorda ninguém justamente porque precisa de julgamento de negócio.

## Primeiros 5 minutos

1. Painel **OrderFlow**, linha *Negócio*: a queda é brusca (minutos) ou gradual (horas)?
2. Painel *Gateway: p95 por resultado* e a métrica por motivo:
   ```promql
   sum by (reason) (rate(orderflow_payments_gateway_seconds_count{outcome="declined"}[15m]))
   ```
   Qual `reason` cresceu? `limit_exceeded`, `card_declined`, ou `outcome="error"`?

## Diagnóstico

| Motivo que cresceu | Leitura |
|---|---|
| `outcome="error"` | não é recusa, é falha técnica no adquirente: veja os traces do span `gateway authorize` com erro |
| `limit_exceeded` | mudou o perfil de valor dos pedidos, ou alguém mudou `payments.approval-limit` (confira o histórico do Helm e o ConfigMap) |
| `card_declined` concentrado em poucos clientes | provável teste de cartões roubados: avise o time antifraude |
| `card_declined` espalhado | o adquirente está recusando mais: contate o adquirente |

## Mitigação

Não há ação técnica automática: a decisão é de negócio (trocar de adquirente, ajustar limite,
bloquear clientes). O papel do plantão é entregar o diagnóstico com os números acima.

## Depois

Se a causa foi configuração (`approval-limit`), a mudança deveria ter passado por PR e deploy: o
postmortem discute por que não passou.
