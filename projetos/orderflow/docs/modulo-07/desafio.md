# Módulo 7: Desafio sem roteiro

::: desafio Medir o tempo que um pedido espera na fila, provar que o trace não parte, e ensaiar um incidente
Três entregas, cada uma um PR, sem passo a passo. Tudo que você precisa está nas lições 7.1 a 7.7;
o resto é decisão sua, e as decisões entram na descrição do PR.

**1. Tempo de fila como métrica.** O trace mostra o vão entre produzir e consumir (lição 7.4), mas
trace é amostrado e não gera alerta. Crie uma métrica `orderflow.kafka.queue_time` (histograma, em
segundos) medida nos **dois** consumidores (.NET e Java): o tempo entre o timestamp da mensagem
e o início do processamento. Com tag do tópico, e nada mais.

**2. Um teste que falha se o trace partir.** Um teste automatizado, no CI, que falha se a
mensagem publicada pelo Orders não tiver um `traceparent` válido nos headers, e outro que falha se
o consumidor do Orders não criar o span como filho do contexto recebido. Sem Kafka de verdade no
teste de unidade (pense em `Headers` e em `ActivityListener`); com Kafka (Testcontainers) se o
Módulo 2 já tiver a infraestrutura.

**3. Game day.** No AKS de estudo, com o painel aberto e o loop de carga da lição 7.7 rodando:
pare o consumer do Payments (`kubectl scale ... --replicas=0`) por 10 minutos e volte. Siga o
runbook de lag **como se não soubesse a causa**. Depois, um deploy com uma versão que falha na
readiness e confira que o pipeline faz o rollback sozinho.
:::

## Critérios de aceite

- [ ] `orderflow_kafka_queue_time_seconds_bucket` existe no Prometheus para os dois serviços, com
      baldes que façam sentido para filas (de milissegundos a dezenas de minutos), e um painel novo
      no `orderflow.json` com o p95 por tópico.
- [ ] A descrição do PR 1 responde: qual timestamp você usou (`CreateTime` do produtor ou
      `LogAppendTime` do broker), o que acontece com a métrica se os relógios dos nós divergirem, e por que a tag não inclui partição.
- [ ] O teste do PR 2 falha quando você comenta o `Propagator.Inject` do `KafkaTracing` (mostre isso no PR: rode com e sem).
- [ ] O CI continua verde nas duas stacks, e o tempo total do `ci.yml` não subiu mais de 2 minutos.
- [ ] O PR 3 é só documentação: um postmortem sem culpados do game day (linha do tempo com horários,
      o que o painel mostrou, quanto tempo levou para achar a causa) e **as correções no runbook**
      que o ensaio revelou. Se o runbook estava perfeito, explique por que desconfia disso.
- [ ] Durante o deploy com falha de readiness, o loop de carga não registrou nenhuma resposta diferente de 201.

::: dica
Para o PR 1: no .NET, `ConsumeResult.Message.Timestamp` tem o tipo do timestamp (`TimestampType`);
no Java, `ConsumerRecord.timestamp()` e `timestampType()`. Para o PR 2, um `ActivityListener`
registrado no teste escuta a fonte `OrderFlow.Orders` sem precisar do SDK do OpenTelemetry.
:::
