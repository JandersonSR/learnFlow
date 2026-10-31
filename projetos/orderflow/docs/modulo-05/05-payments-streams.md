# 5.5 O payments-streams por dentro

Arquivos: [`java/payments-streams/`](../../java/payments-streams/), [`deploy/docker/payments-streams.Dockerfile`](../../deploy/docker/payments-streams.Dockerfile), [`deploy/helm/payments-streams/`](../../deploy/helm/payments-streams/)

Um projeto Maven **novo**, separado do Payments. Ele lê `payments.events` e publica em `payments.stats.1m`, a cada minuto, quantos pagamentos foram aprovados, recusados e estornados, e o valor de cada grupo.

::: porque Por que um serviço separado, e não um `@Bean` a mais no Payments
Escalam de formas diferentes: o Payments escala pelo lag de `orders.events` (até 6 pods, KEDA); o Streams, pelas tarefas da topologia, com estado local e standby. Falham de formas diferentes: um bug na agregação não pode derrubar a API de pagamentos. Têm permissões diferentes no Kafka (lição 5.2). E o ciclo de deploy é outro: mudar a janela de 1 para 5 minutos muda o `application.id`? (Não, mas mudar o **nome do store** sim, e reprocessa tudo.) Juntar os dois acoplaria tudo isso.
:::

## Mapa do código

| Arquivo | Papel |
|---|---|
| `topology/PaymentStatsTopology.java` | a topologia, em Java puro, testável sem Spring |
| `topology/PaymentEventMessage.java` | a visão **do consumidor** sobre o contrato (só os campos usados) |
| `topology/Outcome.java` | tipo do evento → APPROVED/DECLINED/REFUNDED; desconhecido → ignorado |
| `topology/WindowStats.java` | o acumulador (contagem + soma), guardado no RocksDB |
| `topology/JsonSerde.java` | Serde JSON de 20 linhas com Jackson 3 |
| `topology/OccurredAtTimestampExtractor.java` | tempo de evento (lição 5.4) |
| `config/KafkaStreamsConfiguration.java` | liga a topologia ao Spring (`@EnableKafkaStreams`) e trata erros fatais |
| `config/KafkaStreamsHealthIndicator.java` | estado do Kafka Streams nas probes |
| `PaymentStatsTopologyTest.java` | testes com `TopologyTestDriver` |

## A topologia, operação por operação

```java
builder.stream(inputTopic, Consumed.with(Serdes.String(), eventSerde)
        .withTimestampExtractor(new OccurredAtTimestampExtractor()))
    .filter((orderId, event) -> event != null && Outcome.fromEventType(event.type()) != null)
    .groupBy((orderId, event) -> Outcome.fromEventType(event.type()).name(),
             Grouped.with("por-resultado", Serdes.String(), eventSerde))
    .windowedBy(TimeWindows.ofSizeAndGrace(windowSize, grace))
    .aggregate(WindowStats::empty, (outcome, event, stats) -> stats.add(event),
               Named.as("somar-janela"), Materialized.as(STORE_NAME) ...)
    .suppress(Suppressed.untilWindowCloses(Suppressed.BufferConfig.unbounded()))
    .toStream()
    .map((windowedOutcome, stats) -> KeyValue.pair(windowedOutcome.key(), new PaymentWindowSummary(...)))
    .to(outputTopic, Produced.with(Serdes.String(), summarySerde));
```

::: porque Por que dar nome a tudo (`Named`, `Grouped.with("por-resultado", ...)`, `Materialized.as(...)`)
Sem nome, o Kafka Streams gera nomes como `KSTREAM-AGGREGATE-STATE-STORE-0000000004`, numerados pela **posição** do operador na topologia. Acrescente um `filter` antes do `groupBy` numa versão nova e todos os números mudam: os tópicos internos (changelog, repartition) passam a ter **outros nomes**, o estado antigo fica órfão e a aplicação recomeça as agregações do zero. Com nomes explícitos, a topologia pode evoluir sem perder estado. O `STORE_NAME` tem um comentário: nunca mude depois de ir para produção.
:::

::: porque Por que `BufferConfig.unbounded()`
O `suppress` guarda os agregados até a janela fechar. `unbounded` = sem limite de memória: correto aqui (3 chaves × poucas janelas abertas). Com chaves de alta cardinalidade, um buffer ilimitado vira `OutOfMemoryError`; a alternativa `maxBytes(...).shutDownWhenFull()` falha de forma explícita em vez de emitir resultados parciais. Nunca use `emitEarlyWhenFull()` com `untilWindowCloses`: ele quebra a promessa de "um resultado final por janela".
:::

## O contrato de entrada

```java
@JsonIgnoreProperties(ignoreUnknown = true)
public record PaymentEventMessage(String type, UUID paymentId, UUID orderId, BigDecimal amount, Instant occurredAt) {}
```

Esta classe **não** é compartilhada com o Payments. É o *tolerant reader*: o consumidor declara só o que usa, ignora campos novos, e trata tipos desconhecidos (`Outcome.fromEventType` devolve `null` e o `filter` descarta). Um `PaymentChargeback` novo no Payments não derruba o Streams.

::: armadilha Confira o formato real do Módulo 2/3
Este serviço assume que o JSON de `payments.events` traz o tipo no campo `"type"` (`"PaymentApproved"`...) e o `occurredAt` em ISO 8601. Se o produtor do Módulo 2 colocar o tipo num **header** (`eventType`) ou usar Avro com Schema Registry (Módulo 3), a leitura muda: header pede a Processor API (`process(...)`) ou um `ValueTransformer` que lê o contexto do registro; Avro pede o `SpecificAvroSerde`. O Exercício 3 é alinhar com o contrato real e escrever um teste de contrato.
:::

## Mensagem que não desserializa

```yaml
deserialization.exception.handler: org.apache.kafka.streams.errors.LogAndContinueExceptionHandler
```

O padrão do Kafka Streams é `LogAndFail`: um JSON inválido **para a aplicação inteira** (a thread morre, o estado vai para ERROR). Com `LogAndContinue`, o registro é logado com tópico, partição e offset e pulado. É a mesma decisão "falha permanente: não adianta repetir" do Módulo 2. Em produção, o próximo passo é mandar o registro para uma DLT.

E erros **dentro** do processamento (um `NullPointerException` num caso que ninguém previu)? Vão para o `StreamsUncaughtExceptionHandler`:

```java
factoryBean.setStreamsUncaughtExceptionHandler(exception -> {
    log.error("Erro não tratado no Kafka Streams; encerrando o cliente", exception);
    return StreamThreadExceptionResponse.SHUTDOWN_CLIENT;
});
```

| Resposta | Efeito | Quando |
|---|---|---|
| `REPLACE_THREAD` | cria uma thread nova, que relê a **mesma** mensagem | erro transitório raro |
| `SHUTDOWN_CLIENT` | esta instância para (estado ERROR) | erro de dado/bug: o processo deve reiniciar e o erro aparecer |
| `SHUTDOWN_APPLICATION` | **todas** as instâncias param | o erro tornaria o resultado errado em qualquer instância |

Escolhemos `SHUTDOWN_CLIENT` porque um bug de dado com `REPLACE_THREAD` vira um laço silencioso: a thread nova pega a mesma mensagem, falha, é substituída...

## Health: o estado do Kafka Streams nas probes

O `KafkaStreamsHealthIndicator` traduz o estado do cliente:

| Estado | Health | Por quê |
|---|---|---|
| `CREATED`, `REBALANCING`, `RUNNING` | UP | rebalanceamento é normal (deploy, réplica nova) |
| `PENDING_SHUTDOWN`, `NOT_RUNNING`, `PENDING_ERROR`, `ERROR` | DOWN | as threads morreram; só um processo novo resolve |

E ele entra **na liveness**, o que parece contradizer a regra "nada externo na liveness". Não contradiz: o estado do Kafka Streams é **interno**. Kafka fora do ar não leva a `ERROR` (o cliente fica tentando e o estado continua RUNNING ou REBALANCING); só bug ou erro fatal levam. Então a liveness reinicia o pod exatamente quando reiniciar resolve. Essa distinção ("é uma dependência ou é o meu próprio estado?") é o que se espera de um sênior.

::: armadilha REBALANCING na liveness
Se o indicador marcasse `REBALANCING` como DOWN, um deploy causaria rebalanceamento, que derrubaria a liveness das outras instâncias, que reiniciariam, causando outro rebalanceamento... Uma tempestade de restarts provocada pelo health check.
:::

## Testando sem broker: `TopologyTestDriver`

```java
driver = new TopologyTestDriver(builder.build(), props);
input  = driver.createInputTopic("payments.events", Serdes.String().serializer(), ...);
output = driver.createOutputTopic("payments.stats.1m", Serdes.String().deserializer(), ...);

send("PaymentApproved", "100.00", T0.plusSeconds(5));
assertThat(output.isEmpty()).isTrue();          // janela aberta: o suppress segura
send("PaymentApproved", "1.00", T0.plusSeconds(91));   // stream time passa de fim + carência
```

O driver executa a topologia em memória, de forma **síncrona** e com tempo controlado pelos timestamps que você manda. Os três testes cobrem: soma por resultado com publicação só no fechamento; evento atrasado dentro e fora da carência (o exemplo da lição 5.4); tipo desconhecido ignorado. Rodam em milissegundos, sem Docker.

```bash
cd java/payments-streams
mvn -N wrapper:wrapper   # só na primeira vez
./mvnw test
```

::: quebra Lab: mude a topologia e perca o estado
Com o payments-streams rodando no kind contra o Strimzi e alguns pagamentos processados:

1. Liste os tópicos internos: `kubectl -n kafka get kafkatopics | grep payments-streams` (o Topic Operator também mostra os tópicos que ele não criou) ou use o `kafka-topics.sh --list` dentro do broker.
2. Tire o `Named.as("somar-janela")` e o `Materialized.as(STORE_NAME)` (deixe `Materialized.with(...)`), rebuilde e faça deploy.
3. Liste de novo.

O que mudou, e o que aconteceu com os agregados das janelas abertas?
:::

::: solucao
Aparecem tópicos internos novos com nomes gerados (`payments-streams-KSTREAM-AGGREGATE-STATE-STORE-00000000NN-changelog`), e os antigos ficam lá, órfãos, ocupando disco. A nova versão começa as agregações das janelas abertas **do zero**: a primeira janela publicada depois do deploy sai com contagem menor que a real. Nenhum erro, nenhum alerta: dado errado em silêncio. Por isso nomes explícitos e, para mudanças de topologia incompatíveis, um `application.id` novo com reprocessamento planejado (e o antigo desligado depois).
:::

## Rodando no cluster

```bash
docker build -f deploy/docker/payments-streams.Dockerfile -t orderflow/payments-streams:dev .
kind load docker-image orderflow/payments-streams:dev --name orderflow
helm upgrade --install payments-streams deploy/helm/payments-streams -n orderflow \
  --set image.tag=dev --wait --timeout 4m
kubectl -n orderflow logs deploy/payments-streams | grep 'Kafka Streams:'
```

A imagem usa `distroless/cc` (o RocksDB é C++ e precisa de libstdc++) e `MaxRAMPercentage=60`: o RocksDB aloca memória **fora** do heap (block cache, memtables), e o limite do pod precisa sobrar para ele. O chart monta `/tmp` como `emptyDir` de 2 Gi, onde ficam o `state.dir` e as bibliotecas nativas extraídas.

## Perguntas para responder sem olhar

::: pergunta
Por que dar nome explícito aos operadores e state stores de uma topologia?
???
Porque os nomes gerados dependem da posição do operador; mudar a topologia muda os nomes dos tópicos internos e dos stores, e a aplicação perde o estado em silêncio. Com nomes explícitos, a topologia evolui mantendo o estado.
:::

::: pergunta
`LogAndContinueExceptionHandler` e `SHUTDOWN_CLIENT`: por que escolhas diferentes para erros diferentes?
???
Erro de desserialização é falha permanente de um registro: pular (e mandar para DLT) não compromete os outros. Erro não tratado no processamento costuma ser bug; continuar com `REPLACE_THREAD` relê a mesma mensagem em laço. Parar a instância torna o problema visível (restarts, alerta) em vez de escondê-lo.
:::

::: pergunta
O health do Kafka Streams está na liveness. Isso não viola a regra de não colocar dependência na liveness?
???
Não, porque o estado do cliente é interno: Kafka indisponível não leva a ERROR, só bug ou erro fatal levam, e nesses casos reiniciar resolve. REBALANCING conta como saudável, para não criar tempestade de restarts durante deploys.
:::

**Próximo:** [Exercícios do módulo](exercicios.md) e [perguntas de entrevista](perguntas-de-entrevista.md)
