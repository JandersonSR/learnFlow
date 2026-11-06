# 12.3 Alertas que acordam a pessoa certa, e runbooks

Um alerta tem um único trabalho: fazer uma pessoa agir **agora** sobre algo que importa. Alerta que dispara e ninguém precisa fazer nada é ruído, e ruído ensina o plantão a ignorar o pager. A pergunta de projeto para cada alerta: "se isto tocar às 3 da manhã, a pessoa vai agradecer ou xingar?".

## Por que "taxa de erro > 1%" é um alerta ruim

| Problema | Exemplo |
|---|---|
| Dispara para incidentes irrelevantes | 3 erros em 200 requisições de madrugada = 1,5% por 5 minutos. Ninguém foi afetado de forma relevante |
| Demora para incidentes lentos | 0,8% de erro constante por uma semana **nunca** dispara, e consome 1,6x o budget do mês |
| O limiar não tem relação com nada | Por que 1%? Por que 5 minutos? |

## Alerta pela queima do budget, em duas janelas

A **taxa de queima** é quantas vezes mais rápido que o sustentável o budget está sendo gasto. Queima 1 = o budget acaba exatamente no fim dos 30 dias. Queima 14,4 = acaba em ~2 dias.

| Alerta | Condição | Gasta do budget mensal | Ação |
|---|---|---|---|
| `...QueimaRapida` (página) | queima > 14,4 na janela de **1 h** **e** na de **5 min** | 2% em 1 hora | Acordar alguém |
| `...QueimaLenta` (ticket) | queima > 6 na janela de **6 h** **e** na de **30 min** | 5% em 6 horas | Chamado para o horário comercial |

```yaml
- alert: SimulacaoErrosQueimaRapida
  expr: |
    creditflow:slo_simulacao_erros:razao1h > (14.4 * 0.0050)
    and
    creditflow:slo_simulacao_erros:razao5m > (14.4 * 0.0050)
  for: 2m
  labels: { severity: critical, slo: slo_simulacao_erros }
  annotations:
    runbook_url: https://github.com/JandersonSR/lending-plataform/blob/main/docs/runbooks/slo-simulacao.md
```

::: previsao
Por que exigir as **duas** janelas? O que aconteceria com só a de 1 hora? E com só a de 5 minutos?
???
**Só 1 h:** o alerta demora para disparar (a média de 1 h sobe devagar) e, pior, continua disparado até **uma hora depois** de o problema acabar, porque a janela ainda contém os erros. O plantão corrige às 3h10 e o alerta segue tocando até 4h10.
**Só 5 min:** sensível demais: um pico de 2 minutos dispara a página.
**As duas:** a de 1 h garante que o problema é significativo; a de 5 min garante que ele **ainda está acontecendo**. Quando você corrige, a de 5 min cai em minutos e o alerta resolve. É a recomendação do livro de SRE do Google (*The Site Reliability Workbook*, capítulo de alertas sobre SLOs), que o CreditFlow segue.
:::

## Sintoma x causa

Os alertas de SLO dizem **que** o usuário está sofrendo. Não dizem onde olhar. O [`regras-operacao.yaml`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/observabilidade/templates/regras-operacao.yaml) tem alertas de **causa**, com severidade menor, que aparecem junto e apontam o caminho:

| Alerta de causa | Sinal | Runbook |
|---|---|---|
| `KafkaLagPagamentosAlto` / `...Crescendo` | `kafka_consumergroup_lag` do Kafka Exporter do Strimzi | [`kafka-lag.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/runbooks/kafka-lag.md) |
| `MensagensNaDlt` | `creditflow_mensageria_consumidor_dlt_total` | `kafka-lag.md` |
| `KeycloakSemInstanciaPronta`, `ApiRespondendo401Demais` | kube-state-metrics; razão de 401 | [`keycloak-fora.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/runbooks/keycloak-fora.md) |
| `DragonflySemPrimario` | kube-state-metrics do StatefulSet do operador | [`dragonfly-fora.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/runbooks/dragonfly-fora.md) |
| `MigracaoDemorando`, `MigracaoFalhou` | `kube_job_status_active/failed` do Job de migrações | [`migracao-travada.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/runbooks/migracao-travada.md) |
| `PodsReiniciando` | restarts em 15 min | [`deploy-e-rollback.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/runbooks/deploy-e-rollback.md) |

::: porque Por que o Dragonfly fora é só "warning"
A arquitetura de cache (módulo 5) foi feita para degradar: o HybridCache tem a camada em memória em cada pod e cai para a fonte quando o Dragonfly falha. O usuário sente latência maior, não erro. Se a latência passar do SLO, quem acorda alguém é o alerta de **SLO**. Um alerta de causa com severidade de página para algo que a arquitetura tolera é exatamente o ruído que treina o plantão a ignorar o pager.
:::

## O que um runbook precisa ter

Abra o [`kafka-lag.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/runbooks/kafka-lag.md) e repare na estrutura:

1. **Alertas que trazem aqui** e o **impacto** em uma frase ("nada se perde, mas o SLO de 5 minutos queima").
2. **Confirmar e medir** com um comando copiável, e a **leitura** da saída ("lag em uma partição só = mensagem envenenada").
3. Ramos por hipótese, cada um com o comando que confirma ou descarta.
4. **Estancar** antes de consertar, e o que **não** fazer ("não pule offset sem registrar").
5. Critério de **encerramento**.

Runbook que diz "verificar o Kafka" não é runbook. A régua: alguém que nunca viu o sistema, às 3 da manhã, consegue seguir sem ligar para ninguém?

::: dica O `runbook_url` na anotação
O Alertmanager leva a anotação até a notificação (Slack, Teams, e-mail). O link na mensagem economiza o minuto mais caro do incidente: o de procurar o que fazer.
:::

## Perguntas para responder sem olhar

::: pergunta
O que é a taxa de queima de um error budget, e o que significa queima 14,4?
???
Quantas vezes mais rápido que o sustentável o budget está sendo gasto. Queima 1 esgota o budget exatamente no fim da janela; 14,4 esgota o de 30 dias em cerca de 2 dias (2% por hora).
:::

::: pergunta
Por que o alerta de queima usa uma janela longa e uma curta ao mesmo tempo?
???
A longa garante relevância (não dispara por picos); a curta garante que o problema ainda está acontecendo, para o alerta resolver logo depois da correção.
:::

::: pergunta
Qual a diferença entre alerta de sintoma e de causa, e qual acorda alguém?
???
Sintoma é o que o usuário sente (o SLO queimando); causa é um componente com problema (lag, Keycloak fora). Página para sintomas; causas com severidade menor, como pista, a não ser que a causa seja certamente sentida pelo usuário.
:::

**Próxima:** [12.4 Game day: quatro incidentes](04-game-day.md).
