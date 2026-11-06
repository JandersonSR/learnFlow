# 12.2 SLOs da simulação e do desembolso, e o error budget

"O sistema tem que estar sempre no ar" não é um objetivo: é um desejo, e um desejo impossível (100% custa infinito). Um **SLO** transforma o desejo num número que o time consegue medir, defender e usar para decidir.

::: conceito SLI, SLO e error budget
- **SLI** (indicador): uma razão de eventos bons sobre eventos válidos, medida do lado do usuário. "Fração das requisições a `/v1/simulacoes` respondidas sem 5xx."
- **SLO** (objetivo): o valor-alvo do SLI numa janela. "99,5% em 30 dias."
- **Error budget**: o que o SLO **permite** errar. 0,5% das requisições de 30 dias. É um orçamento: pode ser gasto em deploys arriscados, experimentos, manutenção. Acabou, o time desacelera mudanças e investe em confiabilidade.
:::

## Os SLOs do CreditFlow

| Jornada | SLI | SLO (30 dias) | Por quê este número |
|---|---|---|---|
| Simulação: disponibilidade | requisições a `/v1/simulacoes*` sem 5xx ÷ todas | **99,5%** | É a porta de entrada pública. Uma simulação que falha é um cliente que vai para o concorrente, mas ele tenta de novo: não é dinheiro perdido na hora |
| Simulação: latência | requisições abaixo de **250 ms** ÷ todas | **99%** | É cálculo puro; acima disso o usuário percebe. O limite é 250 ms (e não 300) por um motivo técnico, abaixo |
| Desembolso | desembolsos **concluídos** em até **5 min** do `ContratoAssinado` ÷ todos os desembolsos finalizados | **99%** | O contrato foi assinado: a promessa é dinheiro na conta "em minutos". Falha conta como ruim |

::: armadilha O limite de latência precisa ser um bucket
O Prometheus não guarda cada requisição: guarda **contadores por faixa** de um histograma (`le="0.1"`, `le="0.25"`, `le="0.5"`...). O SLI "fração abaixo de X" só é exato se X for um desses limites: `bucket{le="0.25"} / count`. Os limites padrão do `http.server.request.duration` no .NET são 5, 10, 25, 50, 75, 100, 250, 500, 750 ms, 1, 2,5, 5, 7,5 e 10 s. **Não há 300 ms.** Um SLO "abaixo de 300 ms" teria que ser interpolado (impreciso) ou exigiria uma `View` mudando os limites. O CreditFlow ajustou o SLO ao bucket (250 ms); para o desembolso, fez o contrário: definiu os limites do histograma próprio (`MetricasDeCredito.LimitesDesembolsoSegundos`) incluindo 300.
:::

## Quanto é o budget, em coisas que se entende

| SLO | Budget em 30 dias | Se o tráfego for constante |
|---|---|---|
| 99,5% | 0,5% | ~3 h 36 min de indisponibilidade total, ou 1 erro a cada 200 requisições o mês inteiro |
| 99% | 1% | ~7 h 12 min |
| 99,9% | 0,1% | ~43 min |

::: previsao
O time quer subir o SLO de disponibilidade da simulação para 99,99% "porque é o padrão das big techs". O que muda no dia a dia, além do número?
???
O budget cai para ~4 minutos por mês. Um único deploy que derruba a API por 5 minutos estoura o mês. Consequências práticas: deploys canário obrigatórios com rollback automático, várias regiões (uma única região Azure tem incidentes que passam disso), Kafka/Keycloak/Postgres com a mesma disponibilidade ou degradação graciosa sem eles, plantão 24 h com resposta em minutos. O custo de cada "9" a mais cresce muito mais rápido que o benefício. O SLO certo é o **menor** que mantém os usuários satisfeitos, e o primeiro passo é medir o que se tem hoje.
:::

## As regras de gravação

Calcular a razão de 30 dias a cada avaliação de alerta seria caro. O [`regras-slo.yaml`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/observabilidade/templates/regras-slo.yaml) grava as razões por janela como séries novas:

```yaml
- record: creditflow:slo_simulacao_erros:razao1h
  expr: |
    sum(rate(http_server_request_duration_seconds_count{service_name="creditflow-api-simulacao",http_route=~"/v1/simulacoes.*",http_response_status_code=~"5.."}[1h]))
    /
    sum(rate(http_server_request_duration_seconds_count{service_name="creditflow-api-simulacao",http_route=~"/v1/simulacoes.*"}[1h]))
- record: creditflow:slo_desembolso_ruins:razao1h
  expr: |
    1 - (
      sum(rate(creditflow_desembolso_duracao_seconds_bucket{creditflow_resultado="concluido",le="300"}[1h]))
      /
      sum(rate(creditflow_desembolso_duracao_seconds_count[1h]))
    )
- record: creditflow:slo_simulacao_erros:budget_restante
  expr: 1 - (creditflow:slo_simulacao_erros:razao30d / 0.0050)
```

| Detalhe | Por quê |
|---|---|
| `service_name`, `http_route` como rótulos | O Collector converte atributos de recurso em rótulos (`resource_to_telemetry_conversion`), e o ASP.NET Core grava a **rota** (o template, `/v1/simulacoes/{id}`), não a URL (que teria cardinalidade infinita) |
| Nomes `_seconds_count`, `_bucket` | O exportador Prometheus do Collector troca `.` por `_` e acrescenta unidade e sufixo |
| `creditflow_resultado="concluido"` no numerador e não no denominador | Desembolso que falhou é evento **válido e ruim**. Se o denominador fosse só os concluídos, um gateway que recusa tudo daria SLI de 100% |
| `budget_restante` | 1 = intacto; 0 = gasto; negativo = estourado. É o número do topo do dashboard |

::: armadilha Janela maior que a retenção
O kube-prometheus-stack do CreditFlow guarda 15 dias. A série `razao30d` na prática cobre 15 dias, e o budget de "30 dias" é uma aproximação. Em produção: retenção de pelo menos 31 dias ou armazenamento de longo prazo (Thanos, Mimir, Azure Monitor). Está anotado no [`kube-prometheus-stack.yaml`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/observabilidade/valores/kube-prometheus-stack.yaml).
:::

## Pouco tráfego: o SLO do desembolso

Em dev (e no começo de qualquer produto), há poucos desembolsos por hora. Com 3 desembolsos numa hora e 1 lento, a razão de 1 h é 33%: o alerta de queima dispararia por um único evento. Três saídas, em ordem de preferência:

1. Exigir volume mínimo na regra de alerta (`and sum(increase(..._count[1h])) > 20`).
2. Janelas maiores para SLOs de baixo volume.
3. Tráfego sintético: um job que faz uma jornada completa a cada poucos minutos (o desafio do módulo).

## Usar o budget para decidir

| Budget restante | Decisão do time |
|---|---|
| > 50% | Ritmo normal. Pode arriscar (migração grande, mudança de configuração do Kafka) |
| 10% a 50% | Mudanças arriscadas passam por janela de manutenção e plano de volta |
| < 10% | Só correções. O próximo item da fila é o que mais queimou o budget |
| Estourado | Congelamento de funcionalidades até a causa principal estar resolvida (acordado com produto **antes**) |

O acordo é o que faz o SLO funcionar: escrito com o produto, revisado a cada trimestre, e aplicado mesmo quando dói.

## Perguntas para responder sem olhar

::: pergunta
Por que o SLO de latência da simulação é 250 ms e não 300 ms?
???
Porque o SLI é calculado com os buckets do histograma, e 250 ms é um limite padrão do `http.server.request.duration` no .NET; 300 ms não é, e exigiria interpolação ou mudar os limites com uma View.
:::

::: pergunta
No SLI do desembolso, por que as falhas entram no denominador?
???
Porque são eventos válidos e ruins. Se o denominador fosse só os concluídos, um sistema que falha tudo teria SLI perfeito.
:::

::: pergunta
O que é error budget e para que ele serve além do alerta?
???
É o quanto o SLO permite errar na janela. Serve para decidir o ritmo de mudanças: com budget sobrando, o time arrisca; com pouco ou estourado, prioriza confiabilidade, conforme um acordo feito com produto.
:::

**Próxima:** [12.3 Alertas e runbooks](03-alertas-e-runbooks.md).
