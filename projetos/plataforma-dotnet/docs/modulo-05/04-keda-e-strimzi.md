# 5.4 Escalar pela fila com KEDA, e o Kafka no cluster

## Por que o HPA não serve para o worker

O HPA da API escala pela CPU: mais requisições, mais CPU, mais pods. Para um consumidor de fila, essa lógica falha.

::: previsao
O worker está com 1 pod. Chegam 10 mil eventos em um minuto, e cada gravação leva 20 ms esperando o banco responder. Qual é a CPU do pod do worker durante esse minuto? O HPA escalaria?
???
A CPU fica **baixa**: o worker passa a maior parte do tempo **esperando** o banco responder, não calculando. O HPA olha a CPU, vê que está tranquila, e **não escala**. Enquanto isso, o atraso (lag) só cresce: 1 pod processa cerca de 50 eventos por segundo (1 a cada 20 ms), e chegam mais de 160 por segundo.

E no outro extremo: sem eventos, o pod fica parado com CPU zero, mas o HPA não desce abaixo de 1 réplica. O sinal certo para um consumidor não é a CPU, é **o tamanho da fila**.
:::

::: conceito KEDA
*Kubernetes Event-Driven Autoscaling*: um componente que escala Deployments pelo tamanho de filas e tópicos (Kafka, Service Bus, RabbitMQ, Redis e dezenas de outros). Por baixo, ele cria e alimenta um HPA comum com essa métrica, e cuida sozinho de ir de 0 a 1 réplica e de volta a 0.
:::

## O `ScaledObject` do worker

Do [`worker.yaml`](https://github.com/JandersonSR/aks-step-by-step/blob/main/charts/cep-api/templates/worker.yaml):

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
spec:
  scaleTargetRef: { name: cep-worker }
  minReplicaCount: 0
  maxReplicaCount: 3
  pollingInterval: 15
  cooldownPeriod: 300
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: "cep-kafka-kafka-bootstrap.kafka.svc.cluster.local:9092"
        consumerGroup: cep-estatisticas
        topic: cep.consultado
        lagThreshold: "50"
        offsetResetPolicy: earliest
```

| Campo | Valor | Por quê |
|---|---|---|
| `minReplicaCount` | 0 | Sem eventos pendentes, nenhum pod: custo zero fora do horário |
| `maxReplicaCount` | 3 | O número de partições. Uma quarta réplica ficaria sem partição (lição 5.1) |
| `lagThreshold` | 50 | Uma réplica para cada 50 mensagens atrasadas: 120 de atraso → 3 réplicas |
| `pollingInterval` | 15 s | De quanto em quanto tempo o KEDA consulta o atraso no Kafka |
| `cooldownPeriod` | 300 s | Espera 5 minutos sem atraso antes de voltar a 0, para não ficar ligando e desligando |
| `consumerGroup` | `cep-estatisticas` | Tem de ser o mesmo `GroupId` do código, senão o KEDA mede o atraso de outro grupo |

::: porque Os 3 lugares que precisam concordar
O número de partições (no `KafkaTopic`), o `maxReplicaCount` (no `ScaledObject`) e o `GroupId` (no código e no `ScaledObject`) moram em arquivos diferentes. Se alguém aumentar as partições para 6 e esquecer o `max`, metade do paralelismo novo fica sem uso. Se mudar o `GroupId` no código e não no chart, o KEDA passa a medir um grupo que ninguém consome, e escala errado. É o tipo de acoplamento invisível que um comentário no `values.yaml` ajuda a lembrar.
:::

::: armadilha Escalar a partir do zero tem atraso
Com 0 réplicas, o primeiro evento espera: até 15 s para o KEDA perceber (`pollingInterval`), mais o tempo de o pod subir e entrar no grupo. Para estatística, irrelevante. Para algo que o usuário espera ver em segundos, `minReplicaCount: 1` é mais adequado, e custa um pod sempre ligado.
:::

::: previsao
O banco do worker cai por 10 minutos. Os eventos continuam chegando, e o worker fica repetindo o mesmo evento (lição 5.3). O que o KEDA faz com o atraso crescendo? Isso ajuda?
???
O KEDA vê o atraso subir e escala o worker até o máximo, **3 réplicas**. Não ajuda nada: as três tentam gravar no mesmo banco que está fora, e cada uma fica presa repetindo o primeiro evento da sua partição.

Lições:

- **Escalar pela fila trata "falta de consumidor", não "dependência fora".** Num incidente de banco, o KEDA aumenta o número de pods tentando, inclusive as conexões que o banco recebe quando volta (lição 3.4).
- Esse é o ponto em que um **alerta pelo atraso** (lag crescendo por mais de N minutos) é mais útil que a escala: ele avisa uma pessoa de que algo está errado no processamento.
- Quando o banco volta, as 3 réplicas drenam o atraso em paralelo. Aí a escala ajuda.
:::

::: video Scalers in Kubernetes Event-Driven Autoscaling (KEDA) explained (DoiT, em inglês)
https://www.youtube.com/watch?v=9FFuCT7J0eY
Como os *scalers* do KEDA funcionam e como ele se apoia no HPA por baixo.
:::

## O Kafka no cluster: Strimzi

O projeto não instala o Kafka à mão. Usa o **Strimzi**, um **operador**.

::: conceito Operador
Um programa que roda no cluster e sabe operar uma aplicação complexa. Você declara o que quer num recurso próprio (por exemplo, `kind: Kafka` com 3 nós e 10 GiB de disco), e o operador cria e mantém os StatefulSets, Services, certificados e configurações, e reage a mudanças. É o conhecimento de um administrador, empacotado em código.
:::

Do chart [`infra/20-plataforma/charts/kafka`](https://github.com/JandersonSR/aks-step-by-step/tree/main/infra/20-plataforma/charts/kafka):

```yaml
topicos:
  - nome: cep.consultado
    particoes: 3           # até 3 consumidores do mesmo grupo em paralelo
    retencaoHoras: 168     # 7 dias: dá para reprocessar uma semana de eventos
```

que vira um recurso `KafkaTopic`, e o operador cria o tópico no Kafka.

::: porque Tópico declarado, criação automática desligada
No `docker compose`, o tópico nasce sozinho na primeira publicação (`auto.create` ligado só ali). No cluster, ele é **declarado** num arquivo revisado em PR. Um tópico é um contrato: partições não podem diminuir depois de criadas, e a retenção define quanto tempo dá para reprocessar. Com criação automática, um erro de digitação no nome do tópico criaria um tópico novo, com configurações padrão, e os eventos iriam parar lá sem ninguém notar.
:::

::: armadilha O laboratório não é produção
O tópico do laboratório tem **`replicas: 1`**, e o Kafka tem um nó só. Se esse nó reinicia, o tópico fica indisponível até ele voltar: o produtor da API falha as entregas por alguns segundos (e, com `MessageTimeoutMs` de 5 s, perde eventos), e o worker para. Em produção: **3 nós** em zonas diferentes, `replicas: 3` nos tópicos e `min.insync.replicas: 2`, para que o `acks=all` signifique "gravado em pelo menos 2 nós".

O guia do nível 16 lista os próximos degraus: Kafka com 3 nós, TLS e usuários (`KafkaUser` do Strimzi), DLT e outbox.
:::

## Kafka gerenciado ou Strimzi?

| | Strimzi no AKS | Gerenciado (Confluent Cloud, Azure Event Hubs com API Kafka) |
|---|---|---|
| Custo | Os nós do cluster | Por uso; costuma ser mais caro em volume alto |
| Operação | Sua: upgrades, discos, réplicas, monitoramento | Do fornecedor |
| Controle e compatibilidade | Kafka completo | Event Hubs não implementa tudo (por exemplo, Kafka Streams tem limitações) |
| Bom para | Aprender, controle total, volume alto com time de plataforma | Times sem quem opere Kafka |

A trilha [Kafka e Event Hubs com .NET](trilha:kafka-e-event-hubs-com-net) compara as opções com mais detalhe.

## Perguntas para responder sem olhar

::: pergunta
Por que escalar um consumidor pela CPU não funciona bem?
???
Porque um consumidor costuma passar o tempo esperando I/O (banco, rede), com CPU baixa mesmo com a fila crescendo; e parado, não desce a zero. O sinal certo é o atraso (lag) do grupo, que é o que o KEDA usa.
:::

::: pergunta
Por que o `maxReplicaCount` do worker é 3?
???
Porque o tópico tem 3 partições, e cada partição é lida por um único consumidor do grupo. Uma quarta réplica ficaria sem partição.
:::

::: pergunta
O que um operador como o Strimzi faz, e por que declarar o tópico em vez de deixar criar sozinho?
???
O operador cria e mantém os recursos do Kafka (StatefulSets, Services, tópicos) a partir de recursos declarados, como um administrador automatizado. Declarar o tópico faz partições e retenção passarem por revisão, e evita que um nome errado crie um tópico novo com configuração padrão onde os eventos se perdem.
:::

**Próxima:** [Perguntas de entrevista do módulo](perguntas-de-entrevista.md).
