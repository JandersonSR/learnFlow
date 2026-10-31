# 6.6 KEDA: escalar pelo lag do Kafka

Arquivos: template [`scaledobject.yaml`](../../deploy/helm/payments/templates/scaledobject.yaml), bloco `keda:` de [`deploy/helm/payments/values-prod.yaml`](../../deploy/helm/payments/values-prod.yaml)

O Orders escala por CPU (HPA): mais requisições, mais CPU. O Payments é **também** consumidor de `orders.events`, e para consumidor a CPU mente.

::: previsao
Chegam 20.000 pedidos em 5 minutos (uma promoção). Cada pagamento leva 150 ms, quase todo esperando o gateway de pagamento responder. Com 2 pods do Payments e HPA por CPU a 70%, o que acontece com a CPU e com o atraso?
???
A CPU fica **baixa**: os pods passam o tempo esperando I/O (threads virtuais, lição 1J.7, tornam a espera ainda mais barata). O HPA não escala. Cada partição é consumida em série por um pod; com 2 pods e 6 partições, cada pod lê 3 partições. O **lag** cresce, e pedidos pagos levam minutos para ser confirmados. O sinal certo é o lag do consumer group, não a CPU.
:::

::: conceito KEDA
*Kubernetes Event-Driven Autoscaling*: um operador que lê métricas de fontes externas (lag do Kafka, tamanho de fila do Service Bus, linhas num banco...) e alimenta um **HPA comum** com elas. Você declara um `ScaledObject`; o KEDA cria e mantém o HPA `keda-hpa-<nome>` e cuida de ir de 0 a 1 réplica (o HPA sozinho não desce a zero). No AKS, vem como add-on (`workloadAutoScalerProfile.keda`), com a versão gerenciada pela Microsoft.
:::

## O ScaledObject do Payments

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
spec:
  scaleTargetRef:
    name: payments
  minReplicaCount: 2
  maxReplicaCount: 6
  pollingInterval: 15
  cooldownPeriod: 300
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: orderflow-kafka-bootstrap.kafka.svc.cluster.local:9092
        consumerGroup: payments
        topic: orders.events
        lagThreshold: "50"
        offsetResetPolicy: earliest
      authenticationRef:
        name: payments-kafka
    - type: cpu
      metricType: Utilization
      metadata:
        value: "70"
```

| Campo | Valor | Raciocínio |
|---|---|---|
| `minReplicaCount` | 2 | o Payments também é **API HTTP**: a zero, ninguém responderia `GET /payments` |
| `maxReplicaCount` | 6 | = partições de `orders.events` (lição 5.2); um 7º pod ficaria sem partição (o KEDA já limita a isso por padrão) |
| `lagThreshold` | 50 | alvo de lag **por réplica**: lag total de 240 → 5 réplicas |
| `consumerGroup` | `payments` | **o mesmo** `group.id` do código e da ACL do KafkaUser |
| segundo gatilho `cpu` | 70% | picos de HTTP; o HPA usa o **maior** número pedido entre os gatilhos |
| `behavior.scaleDown` | 1 pod/min, janela de 300 s | cada mudança de réplicas causa **rebalanceamento** do grupo |

::: porque Por que descer devagar
Toda vez que um consumidor entra ou sai do grupo, as partições são redistribuídas (*rebalance*). Com o protocolo clássico, o grupo inteiro pausa o consumo durante a redistribuição. Um autoscaler que sobe e desce a cada minuto transforma o consumo num pisca-pisca de pausas. A janela de estabilização de 5 minutos e "no máximo 1 pod por minuto" na descida trocam um pouco de custo por estabilidade. (O protocolo de rebalanceamento novo do Kafka, KIP-848, reduz esse custo; confira se o cliente do Módulo 2 o usa.)
:::

## A autenticação do KEDA no Kafka

O operador do KEDA é outro cliente do Kafka: ele precisa **ler offsets** do grupo e o fim das partições. O chart gera um `TriggerAuthentication` que reaproveita o KafkaUser do Payments:

```yaml
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
spec:
  secretTargetRef:
    - { parameter: sasl,     name: payments-keda-kafka, key: sasl }       # scram_sha512
    - { parameter: username, name: payments-keda-kafka, key: username }   # payments
    - { parameter: password, name: payments,            key: password }   # Secret do Strimzi
```

A senha vem direto do Secret que o User Operator gerou; o Secret auxiliar `payments-keda-kafka` só tem o modo SASL e o nome do usuário, que não são segredo.

::: armadilha Reaproveitar o usuário da aplicação
É prático e funciona: o usuário `payments` tem `Describe` no tópico e `Read` no grupo, o suficiente para o KEDA medir lag. O ideal em produção é um KafkaUser `keda` com **só** `Describe` em tópicos e grupos: se a credencial do KEDA vazar, ninguém consome nem produz com ela. É o Exercício 4.
:::

## O que o KEDA não resolve

::: previsao
O Postgres do Payments fica lento (consultas de 5 s) por 10 minutos. O lag cresce. O que o KEDA faz, e isso ajuda?
???
O KEDA vê o lag e sobe o Payments até 6 réplicas. **Piora**: são 6 pods abrindo conexões e fazendo consultas num banco que já está sofrendo, cada um com seu pool do Hikari. O pool total de conexões triplica. Quando o banco melhora, as 6 réplicas drenam o lag rápido, e só aí a escala ajuda.

Lições: escalar pela fila trata **falta de consumidor**, não **dependência lenta**. Proteções: limite de conexões por pod que, multiplicado pelo `maxReplicaCount`, caiba no banco; *circuit breaker* na dependência; e um **alerta de lag crescente** por mais de N minutos (Módulo 7), que chama uma pessoa. O Kafka Exporter do Strimzi (ligado no Módulo 5) é a fonte desse alerta.
:::

```bash
kubectl -n orderflow get scaledobject payments
kubectl -n orderflow get hpa keda-hpa-payments
kubectl -n orderflow describe scaledobject payments | sed -n '/Conditions/,$p'
```

::: dica
Para ver o lag pelo próprio Kafka (`kafka-consumer-groups.sh --describe --group payments`), lembre que o listener exige SCRAM até para as ferramentas: crie dentro do pod do broker um arquivo de propriedades com `security.protocol`, `sasl.mechanism` e `sasl.jaas.config` (do Secret de um usuário com permissão) e passe em `--command-config`. Ou leia `kafka_consumergroup_lag` no Kafka Exporter (porta 9404).
:::

::: video Autoscale Apache Kafka with KEDA on Kubernetes (em inglês)
https://www.youtube.com/watch?v=UGCyGBYXivE
O scaler de Kafka do KEDA na prática: lag, ScaledObject e o HPA que ele cria por baixo.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que o máximo de réplicas de um consumidor é o número de partições?
???
Num consumer group, cada partição é atribuída a um único consumidor. Com mais consumidores que partições, os excedentes ficam ociosos. O KEDA, por padrão, nem escala além disso.
:::

::: pergunta
Seu serviço é API e consumidor. Como você configura o autoscaling?
???
Um ScaledObject com dois gatilhos: lag do consumer group (o sinal do consumidor) e CPU (o sinal do HTTP); o HPA usa o maior. Mínimo maior que zero, porque a API precisa responder. Máximo igual às partições. Descida lenta para evitar rebalanceamentos em sequência. E alerta de lag, porque escalar não resolve dependência lenta.
:::

**Próximo:** [Exercícios do módulo](exercicios.md) e [perguntas de entrevista](perguntas-de-entrevista.md)
