# Lag de consumidor Kafka alto e crescendo

**Alerta:** `KafkaLagCrescendo`  ·  **Severidade:** página  ·  **Dono:** time do consumer group do alerta

## Impacto

Os eventos estão sendo aceitos (o produtor grava no Kafka), mas processados com atraso. Se o
grupo é `payments`: pedidos criados demoram a ser cobrados. Se é `orders`: pedidos pagos continuam
aparecendo como pendentes para o cliente. Nada se perde enquanto o atraso for menor que a
retenção do tópico; passou da retenção, as mensagens mais antigas são apagadas sem terem sido lidas.

## Primeiros 5 minutos

1. Painel **OrderFlow**, linha *Kafka*: qual grupo, qual tópico, desde quando. O lag cresce em
   todas as partições ou numa só?
2. Confira o grupo direto no broker:
   ```bash
   kubectl -n kafka exec -it <pod-do-broker> -- bin/kafka-consumer-groups.sh \
     --bootstrap-server localhost:9092 --describe --group payments
   ```
   Leia as colunas `CURRENT-OFFSET` (onde o grupo está), `LOG-END-OFFSET` (fim do tópico),
   `LAG` (a diferença) e `CONSUMER-ID` (quem está com a partição; vazio = ninguém).

## Diagnóstico: as quatro causas, e como diferenciar

| O que você vê | Causa provável | Confirme com |
|---|---|---|
| `CONSUMER-ID` vazio em todas as partições | consumidor parado (pods fora, CrashLoop) | `kubectl -n orderflow get pods` |
| Lag em **uma** partição, as outras em zero, `CURRENT-OFFSET` parado | **mensagem envenenada**: o consumidor falha sempre na mesma mensagem e não avança | logs do consumidor com o mesmo offset se repetindo |
| Lag em todas, `CURRENT-OFFSET` andando devagar | consumidor lento (dependência lenta) ou produção acima da capacidade | traces do span `process <tópico>`: o tempo está no banco? no gateway? |
| Lag em todas, rebalanceamentos frequentes nos logs | pods reiniciando, ou processamento passando do `max.poll.interval.ms` | eventos do pod, logs com "rebalance" |

Uma partição só com lag e as outras zeradas também acontece com **chave quente**: um `orderId`
(ou cliente) com volume muito maior. Como a chave define a partição, todo o volume cai num
consumidor só. Mais réplicas não ajudam: o paralelismo máximo é uma réplica por partição.

## Mitigação

| Causa | Ação |
|---|---|
| Consumidor parado | resolver o motivo do pod; se foi deploy, [rollback](deploy-e-rollback.md) |
| Mensagem envenenada | ela deveria ir para o DLT (Módulo 3). Se o código não está mandando, corrija e reimplante; em último caso, avance o offset do grupo **uma** mensagem (abaixo), com segunda pessoa conferindo, e registre o offset pulado para reprocessar depois |
| Consumidor lento, todas as partições | escalar até o número de partições (`kubectl scale` ou o mínimo do KEDA). Acima disso, as réplicas extras ficam ociosas |
| Produção acima da capacidade por tempo longo | aumentar partições é decisão de design: muda a distribuição das chaves (a ordem por `orderId` só vale dentro da partição). Não faça no meio do incidente |

Pular uma mensagem (só com o consumidor PARADO; com ele rodando, o comando falha):

```bash
# o grupo precisa estar sem membros ativos
kubectl -n orderflow scale deployment/payments --replicas=0
kubectl -n kafka exec -it <pod-do-broker> -- bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --group payments \
  --topic orders.events:<partição> --reset-offsets --shift-by 1 --dry-run
# confira a saída; troque --dry-run por --execute
kubectl -n orderflow scale deployment/payments --replicas=<N>
```

## Quando escalar

Lag subindo há mais de 30 minutos sem causa identificada, ou se o atraso projetado vai passar da
retenção do tópico: acione o time de plataforma (Kafka).

## Depois

Mensagem envenenada que travou o consumidor é bug de classificação de erro (falha permanente tratada como
transitória, Módulo 3): o postmortem deve terminar com um teste que reproduz a mensagem.
