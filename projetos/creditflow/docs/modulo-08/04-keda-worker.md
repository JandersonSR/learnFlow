# 8.4 KEDA do worker: lag, partições e réplicas

O que é o KEDA e como ele alimenta um HPA por baixo está na [lição 5.4 da Plataforma](../../../plataforma-dotnet/docs/modulo-05/04-keda-e-strimzi.md). Aqui, as contas do worker-pagamentos e as decisões que mudam quando o que está na fila é **dinheiro**.

## O ScaledObject

De [`deploy/k8s/escala/keda-worker-pagamentos.yaml`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/escala/keda-worker-pagamentos.yaml) (o chart gera o equivalente):

```yaml
spec:
  scaleTargetRef: { name: creditflow-worker-pagamentos }
  minReplicaCount: 1
  maxReplicaCount: 6
  pollingInterval: 15
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: creditflow-kafka-bootstrap.creditflow-dados.svc:9093
        consumerGroup: creditflow-pagamentos
        topic: creditflow.propostas.v1
        lagThreshold: "50"
        offsetResetPolicy: earliest
        allowIdleConsumers: "false"
        ensureEvenDistributionOfPartitions: "true"
      authenticationRef: { name: creditflow-worker-pagamentos-kafka }
```

Os parâmetros foram conferidos na documentação do scaler Apache Kafka do KEDA (versão 2.22).

## A conta

::: conceito
O scaler soma o lag de todas as partições do tópico para o grupo e entrega isso como métrica `AverageValue` com alvo `lagThreshold`. O HPA por baixo faz:
```
desejadas = ceil( lagTotal / lagThreshold )
```
e o KEDA limita a `min(partições, maxReplicaCount)` (a não ser que `allowIdleConsumers` seja `true`).
:::

| Lag total | ceil(lag / 50) | Limite (6 partições) | Com `ensureEven...` | Réplicas |
|---|---|---|---|---|
| 0 | 0 | — | — | **1** (mínimo) |
| 40 | 1 | 1 | 1 | **1** |
| 130 | 3 | 3 | 3 (divide 6) | **3** |
| 230 | 5 | 5 | **6** (5 não divide 6) | **6** |
| 900 | 18 | 6 | 6 | **6** |

::: porque Por que o teto é o número de partições
O Kafka entrega cada partição de um grupo a **um** membro. Com 6 partições, a sétima réplica entra no grupo e não recebe nada: consome memória, conexões com o Postgres e participa de rebalanceamentos sem processar uma mensagem. Para passar de 6 réplicas, é preciso mais partições, e aumentar partições muda `hash(chave) % N` para mensagens **novas**: durante a transição, eventos de uma proposta podem ficar em partições diferentes e perder a ordem (o mesmo raciocínio da previsão da lição 6.1). Partições são decisão de capacidade feita com antecedência, não botão de emergência.
:::

::: porque `ensureEvenDistributionOfPartitions`
Com 5 réplicas e 6 partições, uma réplica fica com 2 partições e as outras com 1. A réplica com 2 vira gargalo: a vazão total é limitada por ela, e o lag dessas duas partições cai mais devagar. Com a opção ligada, o KEDA só escolhe divisores do número de partições (1, 2, 3, 6), e cada réplica tem a mesma carga. É um dos motivos para escolher 6 partições em vez de 5 ou 7: 6 tem muitos divisores.
:::

## Mínimo 1, e não 0

O KEDA pode desligar o worker sem lag (`minReplicaCount: 0`) e ligá-lo quando chega mensagem. Para estatística, ótimo. Para desembolso:

::: previsao
Com `minReplicaCount: 0`, `pollingInterval: 15` e um worker que leva ~20 s para subir e entrar no grupo, quanto tempo o primeiro `ContratoAssinado` da manhã espera antes de começar a ser processado? E por que isso é pior do que parece?
???
Até 15 s para o KEDA perceber o lag (polling), mais ~20 s de subida do pod e entrada no grupo (rebalanceamento): até **~35 s**. Pior do que parece porque é exatamente o primeiro cliente do dia, olhando o app esperando o dinheiro, e porque o tempo é invisível nas métricas de latência HTTP (o `POST /contratar` respondeu em 50 ms). O ganho é um pod de 100m de CPU. O CreditFlow escolheu pagar o pod. Está no ADR 0007.
:::

## Cada mudança de réplica é um rebalanceamento

Toda vez que o KEDA sobe ou desce uma réplica, o grupo `creditflow-pagamentos` rebalanceia. O consumidor do CreditFlow usa `PartitionAssignmentStrategy.CooperativeSticky` ([`FabricaDeClientesKafka.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/Producao/FabricaDeClientesKafka.cs)):

| Estratégia | No rebalanceamento | Efeito ao escalar |
|---|---|---|
| Eager (padrão antigo: range, roundrobin) | **Todos** os membros devolvem **todas** as partições e esperam a nova distribuição | Cada subida de réplica para o consumo inteiro por alguns segundos |
| **Cooperative sticky** | Só as partições que mudam de dono são revogadas; o resto continua | Subir de 3 para 6 move 3 partições; as outras 3 nem piscam |

E antes de entregar uma partição, o consumidor confirma o que já processou (`Comitar` no `SetPartitionsRevokedHandler`), reduzindo reentregas. As que ainda acontecerem, a inbox descarta.

::: armadilha Oscilação de réplicas
Lag que sobe e desce a cada 15 s (rajadas curtas) faz o KEDA subir e descer réplicas o tempo todo, e cada mudança é um rebalanceamento. O ScaledObject do CreditFlow põe uma janela de estabilização de 120 s na descida:
```yaml
advanced:
  horizontalPodAutoscalerConfig:
    behavior:
      scaleDown: { stabilizationWindowSeconds: 120 }
```
O `cooldownPeriod` (120 s) só vale para ir **a zero**; com mínimo 1, quem segura a descida é esse `behavior`.
:::

## A conta que ninguém faz: conexões

O worker no máximo: 6 réplicas × `Maximum Pool Size=40` (da connection string do chart) = **240** conexões possíveis com o Postgres, só dele. Somando `api-geral` (6 × 40), `api-pagamentos` (2 × 40) e o Job de migrações, passa de 560. O `max_connections` do Azure Database for PostgreSQL Flexible Server depende do SKU (confira a tabela atual na documentação da Azure: SKUs pequenos de laboratório ficam na casa de dezenas a poucas centenas).

Na prática, o worker usa poucas conexões ao mesmo tempo: processa uma mensagem por vez, e o gateway é chamado **fora** de transação (lição 6.5). Mas o pool máximo é o que acontece num dia ruim. Três saídas, da mais simples à mais robusta:

1. Pool menor por perfil (`Maximum Pool Size=10` no worker, que tem pouca concorrência interna).
2. Máximos de réplicas que respeitem `soma(réplicas × pool) < max_connections × 0,8`.
3. PgBouncer (o Flexible Server tem um integrado) em modo transação na frente do Postgres.

## Labs

::: quebra Escalar sem cluster: a conta no papel e no kind
Com o worker rodando no kind e o KEDA instalado:

```bash
kubectl scale deploy/creditflow-worker-pagamentos -n creditflow --replicas=0   # simula o worker fora
k6 run -e TAXA=5 -e DURACAO=1m -e ESPERA_MAXIMA_S=1 load/fluxo-completo.js   # enche a fila
kubectl get scaledobject,hpa -n creditflow
kubectl get hpa keda-hpa-creditflow-worker-pagamentos -n creditflow -o yaml | grep -A5 currentMetrics
kubectl get pods -n creditflow -l app.kubernetes.io/component=worker-pagamentos -w
```

Antes de rodar: com ~300 contratos na fila, quantas réplicas o KEDA vai pedir? Ele vai respeitar o seu `scale --replicas=0`?
???
**Dica:** o HPA que o KEDA cria é o dono do campo `replicas`. Quem ganha a briga com o seu `kubectl scale`?
:::

::: solucao
O `kubectl scale` dura até a próxima reconciliação: o HPA criado pelo KEDA (nome `keda-hpa-<scaledobject>`) volta a ajustar `replicas` para o mínimo de 1 e, com ~300 de lag, para ceil(300/50) = 6. Em `currentMetrics` aparece o lag como `averageValue` por réplica. Para parar o worker de verdade (manutenção), use a anotação de pausa do KEDA (`autoscaling.keda.sh/paused-replicas: "0"`) no ScaledObject, não o `kubectl scale`.

Os pods sobem, o grupo rebalanceia (veja no log "Partições recebidas: ..."), o lag cai e, 120 s depois de zerar, as réplicas descem em degraus.
:::

## Perguntas para responder sem olhar

::: pergunta
Lag total 260, `lagThreshold` 50, 6 partições, `ensureEvenDistributionOfPartitions` ligado. Quantas réplicas?
???
ceil(260/50) = 6, dentro do limite de 6 partições, e 6 divide 6: seis réplicas. (Com lag 230, a conta daria 5, que não divide 6, e o KEDA escolheria 6.)
:::

::: pergunta
Por que não pôr `maxReplicaCount: 20` no worker "para garantir"?
???
Porque o tópico tem 6 partições: as réplicas além de 6 ficam sem partição, ociosas, abrindo conexões e causando rebalanceamentos. Para mais vazão, mais partições (decisão planejada, que afeta a ordem por chave na transição) ou mais vazão por réplica.
:::

::: pergunta
Por que o worker de Pagamentos não escala a zero?
???
Porque o primeiro evento depois do ocioso esperaria o polling do KEDA e a subida do pod (dezenas de segundos), e isso é tempo de um cliente esperando dinheiro. O custo de um pod mínimo é pequeno perto disso.
:::

**Próxima:** [8.5 Teste de carga com k6](05-k6-lendo-os-numeros.md).
