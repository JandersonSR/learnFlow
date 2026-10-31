# 3.5 Schema Registry e Avro: o contrato entre Java e .NET

Arquivos: `Infrastructure/Messaging/Schemas/orders-events.avsc`, `EventCodecs.cs` (.NET);
`resources/avro/payments-events.avsc`, `kafka/AvroEventCodec.java` (Java);
`deploy/local/schema-registry/register.sh`

## O problema que sobrou do Módulo 2

O contrato em JSON está escrito duas vezes (C# e Java) e documentado na lição 2.5. Nada impede um PR no
Payments de renomear `amount` para `value`. O build passa, os testes do Payments passam, o deploy sai, e
o Orders começa a receber pagamentos sem valor. Quem descobre é o cliente.

::: conceito Schema Registry
Um serviço (aqui, o da Confluent) que guarda **versões de schema** por *subject* e verifica, a cada
versão nova, se ela é **compatível** com as anteriores segundo uma regra configurada. Cada mensagem no
Kafka leva só o **id** do schema com que foi escrita; quem lê busca o schema pelo id (e guarda em cache).
:::

O formato no fio (*wire format* da Confluent), igual para Avro, JSON Schema e Protobuf:

```
[0x00][id do schema: 4 bytes, big-endian][dados serializados]
 magic
```

::: dica
Por isso uma mensagem em JSON puro num tópico Avro dá "Unknown magic byte!" no Java e
`InvalidDataException` no .NET: o primeiro byte de `{"eventId"...` é `{`, não `0x00`. No OrderFlow,
isso vira `PoisonMessageException` e vai para o DLT (lição 3.4).
:::

## A decisão: Avro, JSON Schema ou Protobuf?

Os três funcionam com o Schema Registry e têm serializadores para Java e .NET. A escolha do OrderFlow é
**Avro**, e o porquê vale mais que a escolha:

| Critério | Avro | JSON Schema | Protobuf |
|---|---|---|---|
| Regras de compatibilidade | as mais bem definidas (resolução de schema leitor/escritor é parte da especificação) | existem, mas dependem de detalhes como `additionalProperties` (modelo aberto ou fechado) | boas, baseadas em números de campo |
| Tamanho no fio | binário, sem nomes de campo | texto, com nomes | binário |
| Legível sem ferramenta | não (o Kafka UI decodifica com o registry) | sim | não |
| No .NET (`Confluent.SchemaRegistry.Serdes.*`) | maduro; `GenericRecord` sem geração de código | serializa com **Newtonsoft.Json** e gera schema com NJsonSchema: dois comportamentos de JSON diferentes do resto do serviço | maduro; exige `protoc` no build |
| Peso na certificação CCDAK | central | menor | menor |

O que pesou: (1) as regras de compatibilidade do Avro são precisas, e é **compatibilidade** que estamos
comprando aqui; (2) o ecossistema Confluent e a CCDAK giram em torno de Avro; (3) no .NET, o caminho do
JSON Schema traria o Newtonsoft de volta só para as mensagens. O que perdemos: abrir a mensagem e ler
sem ferramenta, e o JSON do Módulo 2 deixa de ser o formato do fio (continua existindo como modo de
laboratório e como payload da outbox).

::: porque Por que os campos continuam texto
Avro tem tipos lógicos: `timestamp-millis`, `uuid`, `decimal`. Eles são o idiomático. Mas o suporte varia
**entre as bibliotecas**: no C# (`Apache.Avro`), um campo `timestamp-millis` exige um `DateTime` no
`GenericRecord`; no Java, o valor é `Long` ou `Instant` conforme a opção `avro.use.logical.type.converters`;
`decimal` é `bytes` com escala fixa no schema, e cada lado converte de um jeito. Manter os campos como
`string` (com o formato documentado no `doc`) deixa o contrato **idêntico** nos dois formatos e nas duas
linguagens, com o mesmo mapeamento do Módulo 2. É uma troca consciente: perdemos validação de tipo pelo
schema, ganhamos zero ambiguidade. O Exercício 3.5 pede para migrar `occurredAt` para `timestamp-millis`
e testar a ida e volta entre as stacks.
:::

## O schema

```json
{
  "type": "record", "name": "OrderEvent", "namespace": "com.orderflow.orders.events",
  "fields": [
    { "name": "eventId",    "type": "string" },
    { "name": "eventType",  "type": "string" },
    { "name": "orderId",    "type": "string" },
    { "name": "occurredAt", "type": "string" },
    { "name": "customerId", "type": ["null", "string"], "default": null },
    { "name": "total",      "type": ["null", "string"], "default": null },
    ...
  ]
}
```

`["null", "string"]` com `"default": null` é a forma Avro de "opcional". O `default` é o que importa para
compatibilidade: é o valor que um leitor usa quando a mensagem foi escrita **sem** aquele campo.

::: porque Quem é o dono do schema
Cada serviço é dono do schema do tópico que **produz**: `orders-events.avsc` mora no código do Orders,
`payments-events.avsc` no do Payments. Quem só **lê** não precisa do arquivo: a mensagem traz o id, o
deserializador busca o schema do escritor no registry e devolve um `GenericRecord` com os campos que
existem. Por isso o `AvroPaymentEventCodec` do .NET é criado com `writerSchema: null`.
:::

## Subjects e a estratégia de nome

Com a `TopicNameStrategy` (o padrão), o subject do valor de `orders.events` é `orders.events-value`.
**Um schema por tópico.** Todos os tipos de evento de pedido (Created, Paid, Cancelled) precisam caber
nesse schema, e é por isso que o envelope é plano, com campos opcionais e um `eventType`.

::: dica As alternativas, para a entrevista
`RecordNameStrategy` / `TopicRecordNameStrategy` permitem vários tipos de record no mesmo tópico, cada
um com seu subject e sua compatibilidade. Outra opção é um schema de **união** no topo
(`[OrderCreated, OrderPaid, OrderCancelled]`) com *schema references*. As duas dão tipagem mais forte
por evento; o envelope plano dá simplicidade e o mesmo formato do JSON. O Exercício 3.6 pede o redesenho
com união.
:::

## Compatibilidade: a regra que o registry aplica

| Modo | Leitor NOVO lê dado VELHO | Leitor VELHO lê dado NOVO | Quem atualiza primeiro |
|---|---|---|---|
| `BACKWARD` (padrão) | ✓ | — | os **consumidores** |
| `FORWARD` | — | ✓ | o **produtor** |
| `FULL` | ✓ | ✓ | qualquer um |
| `*_TRANSITIVE` | contra **todas** as versões anteriores, não só a última | | |

O OrderFlow usa **`FULL_TRANSITIVE`**: Orders e Payments são deployados por times diferentes, em
qualquer ordem, e um consumidor pode estar reprocessando mensagens de meses atrás (retenção, DLT).

O que cada mudança faz, verificado com o `fastavro` sobre o `orders-events.avsc`:

| Mudança | BACKWARD | FORWARD | FULL |
|---|---|---|---|
| acrescentar campo opcional (`["null","string"]`, default `null`) | ✓ | ✓ | ✓ |
| acrescentar campo obrigatório **com** default | ✓ | ✓ | ✓ |
| acrescentar campo obrigatório **sem** default | ✗ | ✓ | ✗ |
| remover campo opcional (que tinha default) | ✓ | ✓ | ✓ |
| remover campo obrigatório (sem default) | ✓ | ✗ | ✗ |

::: previsao
O time do Orders quer **renomear** `customerId` para `clientId`. Com `FULL_TRANSITIVE`, o registry aceita?
???
Não. Para o Avro, renomear é remover `customerId` e acrescentar `clientId`. Como os dois são opcionais
com default, cada passo isolado é compatível... e o registry **aceita**. O problema é semântico: um
leitor velho procura `customerId`, recebe `null` (o default) e segue em frente com dado faltando. O
registry protege a **forma**, não o **significado**. O caminho seguro é o mesmo de uma migração de banco:
acrescentar `clientId`, produzir os dois por um tempo, migrar os consumidores, e só então parar de
produzir `customerId`. (Avro tem `aliases` para renomear com resolução automática, mas o suporte varia
entre bibliotecas; teste nas duas antes de confiar.)
:::

## Quem registra: o pipeline, nunca o producer

```csharp
AutoRegisterSchemas = false,   // .NET
```
```yaml
auto-register-schemas: false   # Java (payments.kafka)
```

Com auto-registro ligado (o padrão dos serializadores!), o producer registra o schema que está no
código dele na primeira mensagem. O registry até recusa um incompatível, mas aí o erro aparece **em
produção**, na primeira mensagem depois do deploy, como uma exceção no producer. Com auto-registro
desligado, o registro é um passo do pipeline (aqui, o `register.sh` do compose), que falha **antes** do
deploy. O producer só procura o id de um schema que já existe.

```bash
# o que o register.sh faz, por subject:
curl -X PUT  .../config/orders.events-value   -d '{"compatibility":"FULL_TRANSITIVE"}'
curl -X POST .../subjects/orders.events-value/versions -d '{"schema":"<o .avsc como texto>"}'
```

::: quebra Lab: o registry recusando uma quebra
Com o compose de pé:

```bash
SR=http://localhost:8085
curl -s $SR/subjects
curl -s $SR/subjects/orders.events-value/versions/latest | head -c 300; echo
# uma versão nova que acrescenta um campo obrigatório SEM default:
curl -s -X POST -H 'Content-Type: application/vnd.schemaregistry.v1+json' \
  $SR/compatibility/subjects/orders.events-value/versions/latest \
  -d '{"schema":"{\"type\":\"record\",\"name\":\"OrderEvent\",\"namespace\":\"com.orderflow.orders.events\",\"fields\":[{\"name\":\"eventId\",\"type\":\"string\"},{\"name\":\"eventType\",\"type\":\"string\"},{\"name\":\"orderId\",\"type\":\"string\"},{\"name\":\"occurredAt\",\"type\":\"string\"},{\"name\":\"channel\",\"type\":\"string\"}]}"}'
```

Antes de rodar o último: compatível ou não? E se o campo novo tiver `"default": "web"`?
:::

::: solucao
`{"is_compatible":false}`: sem default, um leitor novo não tem como ler mensagens velhas (BACKWARD
falha), e `FULL_TRANSITIVE` exige os dois sentidos. Repare que o schema do teste também **removeu** os
campos opcionais; isso sozinho seria aceito, porque todos tinham default. Com `"default": "web"` no
`channel`, a resposta vira `true`. É a tabela acima, aplicada por uma máquina em vez de por um revisor de PR.
:::

## O código, dos dois lados

.NET (`AvroEventCodec<T>`):

```csharp
_serializer = new AvroSerializer<GenericRecord>(registry, new AvroSerializerConfig { AutoRegisterSchemas = false });
var record = new GenericRecord(schema);
record.Add("eventId", m.EventId);
...
return _serializer.SerializeAsync(record, new SerializationContext(MessageComponentType.Value, topic));
```

Java (`AvroEventCodec<T>`):

```java
serializer.configure(Map.of("schema.registry.url", url, "auto.register.schemas", false, ...), false);
GenericRecord record = new GenericData.Record(writerSchema);
fill.accept(record, message);
return serializer.serialize(topic, record);
```

::: armadilha Duas pegadinhas do `GenericRecord` no Java
1. Strings voltam como `org.apache.avro.util.Utf8`, não `String`. `(String) record.get("x")` lança
   `ClassCastException`; use `toString()`.
2. Desde o Avro 1.10, `record.get("campoQueNaoExiste")` **lança** exceção (antes devolvia `null`).
   Mensagem escrita com um schema mais antigo não tem o campo novo: confira
   `record.getSchema().getField(nome)` antes. É o que o `AvroEventCodec.optional` faz.
:::

## Vídeo

::: video Schema Compatibility, Schema Registry 101 (Confluent, em inglês)
https://www.youtube.com/watch?v=vQ4mPepAM7Q
Os modos de compatibilidade com exemplos, e em que ordem atualizar produtores e consumidores.
:::

## Perguntas para responder sem olhar

::: pergunta
O que viaja em cada mensagem Avro com Schema Registry?
???
Um byte mágico 0x00, o id do schema em 4 bytes e os dados Avro binários, sem nomes de campo. O leitor
busca o schema pelo id no registry (com cache).
:::

::: pergunta
Por que `auto.register.schemas=false` em produção?
???
Para o registro (e a checagem de compatibilidade) acontecer no pipeline, antes do deploy, e não na
primeira mensagem em produção. O producer só procura o id de um schema já registrado.
:::

**Próxima:** [3.6 Testes com Testcontainers](06-testcontainers.md).
