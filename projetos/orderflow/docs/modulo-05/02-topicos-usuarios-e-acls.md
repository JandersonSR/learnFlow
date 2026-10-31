# 5.2 Tópicos, usuários e ACLs como código

Arquivos: [`deploy/k8s/strimzi/topics.yaml`](../../deploy/k8s/strimzi/topics.yaml), [`users.yaml`](../../deploy/k8s/strimzi/users.yaml), `values-dev.yaml e values-prod.yaml` dos charts

## KafkaTopic: o tópico como contrato revisado

```yaml
apiVersion: kafka.strimzi.io/v1
kind: KafkaTopic
metadata:
  name: orders.events
  namespace: kafka
  labels:
    strimzi.io/cluster: orderflow
spec:
  partitions: 6
  replicas: 1          # 3 no AKS
  config:
    retention.ms: 604800000
    cleanup.policy: delete
```

O Topic Operator sincroniza **nos dois sentidos**: cria o tópico a partir do recurso e reflete no `status` o que existe no Kafka. Alguém mudou a retenção pelo `kafka-configs.sh`? O operador volta ao valor declarado.

::: porque Por que 6 partições, e por que pensar nisso agora
Partição é a unidade de paralelismo: num consumer group, cada partição é lida por **um** consumidor. Com 6 partições, até 6 pods do Payments consomem em paralelo; o sétimo fica ocioso. Por isso o `keda.maxReplicas` do chart é 6 (lição 6.6): os dois números moram em arquivos diferentes e precisam concordar.

E partições **só aumentam**. Aumentar muda o resultado de `hash(chave) % partições`: os eventos novos do pedido X podem ir para outra partição enquanto os antigos ainda estão na primeira, e a ordem por pedido (a garantia que o Módulo 2 construiu com o `orderId` como chave) se perde durante a transição. Escolha com folga no começo: partição a mais custa pouco (arquivos e memória no broker); partição a menos custa uma migração.
:::

::: armadilha Nomes com ponto
`orders.events` é um nome de recurso válido no Kubernetes (pontos são permitidos). Já `orders_events` não seria (underscore não é). Quando o nome do tópico não serve como nome de recurso, use `metadata.name` válido e `spec.topicName` com o nome real. E nunca misture `.` e `_` em nomes de tópicos do mesmo cluster: nas métricas do Kafka os dois viram o mesmo caractere e colidem.
:::

## KafkaUser: uma identidade por aplicação

```yaml
apiVersion: kafka.strimzi.io/v1
kind: KafkaUser
metadata:
  name: payments
  namespace: orderflow
  labels:
    strimzi.io/cluster: orderflow
spec:
  authentication:
    type: scram-sha-512
  authorization:
    type: simple
    acls:
      - resource: { type: topic, name: payments., patternType: prefix }
        operations: [Describe, Write]
      - resource: { type: topic, name: orders.events, patternType: literal }
        operations: [Describe, Read]
      - resource: { type: group, name: payments, patternType: literal }
        operations: [Read]
```

O User Operator cria o usuário SCRAM no Kafka, aplica as ACLs e gera um **Secret** de mesmo nome:

```bash
kubectl -n orderflow get secret payments -o jsonpath='{.data}' | jq 'keys'
# ["password", "sasl.jaas.config"]
```

::: porque Por que os KafkaUser ficam no namespace `orderflow`
Um pod só consegue referenciar Secrets do **próprio namespace**. Se o User Operator gerasse o Secret no namespace `kafka`, o Payments não teria como usá-lo sem alguém copiar a senha (à mão ou por uma ferramenta), e cópia de senha é o que a gente quer eliminar. Por isso o recurso `Kafka` tem `entityOperator.userOperator.watchedNamespace: orderflow`: o User Operator observa os KafkaUser **no namespace das aplicações**. O custo: o time que tem permissão de criar KafkaUser em `orderflow` pode se dar ACLs. Em empresa grande, isso é controlado por revisão de PR ou por política de admissão (Kyverno, Azure Policy).
:::

### O mínimo de permissão, operação por operação

| ACL | Para quê | Sem ela |
|---|---|---|
| `Write` + `Describe` em `payments.*` (prefixo) | publicar `payments.events` (e uma DLT `payments.events.dlt` do Módulo 3) | `TopicAuthorizationException` ao publicar |
| `Read` + `Describe` em `orders.events` | consumir | o consumidor não recebe partições |
| `Read` no **group** `payments` | entrar no consumer group e confirmar offsets | `GroupAuthorizationException` (o erro que todo mundo esquece) |

::: armadilha O nome do group tem de bater com o código
A ACL de group usa o `group.id` que a aplicação configura no Módulo 2. Se o código usa `payments-service` e a ACL diz `payments`, o consumidor autentica, vê o tópico e falha ao entrar no grupo. O mesmo nome aparece em mais dois lugares: o `consumerGroup` do ScaledObject do KEDA (lição 6.6) e os painéis de lag do Módulo 7. Confira os três sempre que renomear.
:::

O payments-streams (lições 5.4 e 5.5) precisa de mais, e cada linha do `users.yaml` tem um motivo:

| ACL do `payments-streams` | Por quê |
|---|---|
| `All` em tópicos com prefixo `payments-streams-` | o Kafka Streams **cria** os tópicos internos (`-repartition`, `-changelog`) com o `application.id` como prefixo |
| `Read` em groups com prefixo `payments-streams` | o group.id do Streams é o `application.id` |
| `Write` + `Describe` em `transactionalId` com prefixo `payments-streams` | `exactly_once_v2` usa transações, com ids derivados do `application.id` |
| `Describe` em `cluster` | o cliente admin interno consulta metadados do cluster |

## Ligando as aplicações ao Kafka autenticado

No Spring, qualquer propriedade do cliente Kafka entra por `spring.kafka.properties.*`, e, por variável de ambiente, `SPRING_KAFKA_PROPERTIES_<NOME>` (pontos viram `_`). O `values-dev.yaml e values-prod.yaml` do Payments:

```yaml
config:
  SPRING_KAFKA_BOOTSTRAP_SERVERS: orderflow-kafka-bootstrap.kafka.svc.cluster.local:9092
  SPRING_KAFKA_PROPERTIES_SECURITY_PROTOCOL: SASL_PLAINTEXT
  SPRING_KAFKA_PROPERTIES_SASL_MECHANISM: SCRAM-SHA-512
env:
  - name: SPRING_KAFKA_PROPERTIES_SASL_JAAS_CONFIG
    valueFrom:
      secretKeyRef: { name: payments, key: sasl.jaas.config }
```

A senha nunca aparece em values, nem no Git, nem em lugar nenhum além do Secret que o operador gerou. Se o KafkaUser for recriado (nova senha), basta reiniciar os pods.

No .NET, o `Confluent.Kafka` usa as propriedades da librdkafka: `security.protocol=SASL_PLAINTEXT`, `sasl.mechanism=SCRAM-SHA-512`, `sasl.username`, `sasl.password`. Como elas chegam ao `ProducerConfig`/`ConsumerConfig` depende de como o Módulo 2 fez o binding da seção `Kafka`; o Exercício 2 deste módulo é ligá-las por variáveis (`Kafka__SaslUsername`, por exemplo) a partir do Secret `orders`, com a chave `password`.

::: previsao
O Payments está autenticado e consumindo. Alguém remove do `users.yaml` a ACL `Read` no group `payments` e aplica. O que acontece com o consumidor que já está rodando? E quando ele reiniciar?
???
O User Operator remove a ACL do Kafka em segundos. O consumidor em execução falha na próxima operação de grupo: o **commit de offset** (e o heartbeat/rejoin) passa a receber `GroupAuthorizationException`. Dependendo de como o Módulo 2 trata erros, o consumidor para ou fica em laço de erro; o lag cresce. Ao reiniciar, ele não consegue nem entrar no grupo. O KEDA vê o lag crescer e **sobe réplicas** que também falham (lição 6.6): escalar não resolve dependência quebrada. O sinal certo é um alerta de lag crescente combinado com erros de autorização no log.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que declarar tópicos como KafkaTopic em vez de deixar `auto.create.topics.enable`?
???
Tópico é contrato: partições (só aumentam e definem o paralelismo), replicação e retenção (quanto dá para reprocessar) precisam de revisão. Com criação automática, um erro de digitação cria um tópico novo com configuração padrão e os eventos somem nele em silêncio.
:::

::: pergunta
Que ACLs um consumidor precisa, além de Read no tópico?
???
Describe no tópico e Read no consumer group (para entrar no grupo e confirmar offsets). Esquecer a ACL de group é o erro mais comum: o cliente autentica, vê o tópico e falha ao entrar no grupo.
:::

::: pergunta
Como a aplicação recebe a senha do Kafka sem ninguém copiá-la?
???
O User Operator gera um Secret com a credencial no namespace da aplicação (watchedNamespace), e o Deployment lê a chave por `secretKeyRef`. A senha só existe nesse Secret; values e Git não a contêm.
:::

**Próxima:** [5.3 Strimzi, Confluent Cloud ou Event Hubs?](03-strimzi-confluent-eventhubs.md)
