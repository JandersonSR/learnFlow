# Módulo 5: Exercícios

Cada exercício é um commit, com as observações no `NOTAS.md`.

## Exercício 1: Strimzi no kind e o payments-streams compilando

1. `cd java/payments-streams && mvn -N wrapper:wrapper && ./mvnw verify`. **O projeto não foi
   compilado no ambiente onde o curso foi escrito**: corrija o que quebrar e anote a causa.
2. Remova o Kafka do namespace `infra` e suba o Strimzi seguindo `deploy/k8s/strimzi/README.md`.
3. Aponte o Orders e o Payments para `orderflow-kafka-bootstrap.kafka.svc.cluster.local:9092`
   com SCRAM (lição 5.2) e faça um pedido de ponta a ponta.

**Aceite:** `Kafka orderflow` com `Ready=True`; os três KafkaUser com Secret gerado; um pedido
pago de ponta a ponta; `./mvnw verify` verde.

## Exercício 2: O Orders (.NET) autenticado

Ligue o `Confluent.Kafka` do Orders ao SCRAM do Strimzi **sem** escrever a senha em lugar
nenhum: as propriedades `security.protocol`, `sasl.mechanism`, `sasl.username` vêm do ConfigMap;
`sasl.password` vem do Secret `orders` (chave `password`) por `secretKeyRef` no `env` do chart.

**Aceite:** o Orders produz e consome com o KafkaUser `orders`; apagar a ACL de group do
`users.yaml` gera `GroupAuthorizationException` no log (e você explica no `NOTAS.md` o que o
KEDA faria nessa situação).

## Exercício 3: Contrato de entrada do payments-streams

Alinhe o `PaymentEventMessage` com o formato **real** que o Payments publica depois do Módulo 3
(campo ou header de tipo, JSON ou Avro). Escreva um teste que use um evento **gerado pelo código
do Payments** (serializado pelo mesmo serializer) como entrada do `TopologyTestDriver`.

**Aceite:** o teste falha se alguém renomear `occurredAt` ou o tipo no Payments.

## Exercício 4: Tolerância a falha medida

Com 2 instâncias do payments-streams e `num.standby.replicas: 1`, gere pagamentos continuamente e
mate uma instância (`kubectl delete pod`). Meça quanto tempo a outra leva para assumir (logs de
transição de estado). Repita com `num.standby.replicas: 0`.

**Aceite:** os dois tempos e a explicação; o resultado de `payments.stats.1m` continua correto
(nenhuma janela com contagem dobrada, graças ao `exactly_once_v2`). Explique como você verificou.

## Exercício 5: Upgrade do Kafka sem parar

No kind, com tráfego contínuo, faça o procedimento de upgrade em duas etapas da lição 5.1 (mude
`version` para a próxima versão suportada pelo seu Strimzi; depois `metadataVersion`).

**Aceite:** zero erros de produção no Orders durante o upgrade (com `kafka-kind.yaml` de 1 nó,
explique por que isso é **impossível**, e repita com 3 nós e RF 3).

---

## 🧩 Desafio sem roteiro: taxa de aprovação com alerta

Hoje o payments-streams publica contagens separadas por resultado. O negócio quer a **taxa de
aprovação por minuto** e um evento de alerta quando ela cair abaixo de 80% por 3 janelas seguidas.

**Critérios de aceite:**

- Um tópico novo `payments.approval-rate.1m` com, por janela: aprovados, recusados, taxa.
- Um tópico `payments.alerts` com um evento quando a taxa ficar < 80% em 3 janelas consecutivas
  (e **um** evento por episódio, não um por janela).
- A solução não pode concentrar todo o tráfego numa única tarefa sem justificativa escrita (lição
  5.4, chave de baixa cardinalidade).
- Testes com `TopologyTestDriver` cobrindo: episódio de queda, recuperação, evento atrasado dentro
  da carência que muda a taxa de uma janela.
- `KafkaTopic` e ACLs atualizados; nada de `auto.create`.
- No `NOTAS.md`: por que você escolheu a abordagem (DSL com `aggregate` + estado próprio, ou
  Processor API), e o que acontece com o alerta num reprocessamento a partir do início do tópico.
