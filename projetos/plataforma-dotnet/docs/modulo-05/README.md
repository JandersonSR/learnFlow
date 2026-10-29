# Módulo 5: Kafka: eventos, partições, ordem, consumidor e escala pela fila

**Objetivo:** entender o Kafka pelo que ele é (um log durável e particionado), escrever produtor e consumidor sabendo o que cada configuração garante, decidir o que fazer quando algo falha no meio, e escalar o consumidor pelo tamanho da fila com KEDA.

## O que você vai conseguir fazer no fim

- Explicar tópico, partição, offset e grupo de consumidores com um desenho, e por que a chave da mensagem define a ordem
- Comparar Kafka com uma fila como o RabbitMQ e dizer quando usar cada um
- Ler o produtor do projeto e explicar `acks=all`, idempotência, `linger` e o timeout de mensagem
- Explicar "pelo menos uma vez", o que isso exige do consumidor e quando um evento pode se perder
- Implementar o padrão outbox para um evento que não pode se perder
- Explicar por que o worker escala com KEDA e não com HPA, e por que o máximo é 3

## Lições

| # | Lição | Tempo |
|---|---|---|
| 5.1 | [Kafka do zero: um log, não uma fila](01-kafka-do-zero.md) | 60 min |
| 5.2 | [O produtor: publicar sem travar a API](02-produtor.md) | 60 min |
| 5.3 | [O consumidor: ler, gravar, confirmar](03-consumidor.md) | 75 min |
| 5.4 | [Escalar pela fila com KEDA, e o Kafka no cluster](04-keda-e-strimzi.md) | 50 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Onde está a prática

Níveis [15](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/15-kafka.md) e [16](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/16-worker-keda.md) do aks-step-by-step. Os labs rodam no Kafka do `docker compose` (KRaft, um nó, 3 partições).

## Entregável do módulo

O outbox do evento `CotaEsgotada` do módulo Parceiros (desafio da lição 5.2), e uma apresentação de 20 minutos para o time: **"O que acontece com um evento, da API ao worker, quando cada peça cai"**.
