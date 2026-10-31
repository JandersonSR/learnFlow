# 0005. Contratos de evento em Avro no Schema Registry, com compatibilidade FULL_TRANSITIVE

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** Janderson, revisão do time

## Contexto

O contrato entre um serviço .NET e um Java é o formato da mensagem (ADR 0001). Sem verificação,
um produtor renomeia um campo, o build dele passa, e o consumidor do outro time quebra em
produção. No Módulo 2 os eventos viajavam como JSON, verificado só por testes de cada lado. O
Módulo 3 precisava de um contrato que **as duas linguagens leiam do mesmo arquivo** e que seja
verificado **no ponto de produção**, valendo também para consumidores futuros.

## Decisão

Cada tópico tem um schema **Avro** versionado no repositório (`orders-events.avsc` no Orders,
`payments-events.avsc` no Payments), registrado no **Schema Registry** sob o subject do tópico. O
produtor serializa com o schema registrado; a mensagem carrega o id do schema, e o consumidor
desserializa com ele. Regras:

- Compatibilidade do subject **FULL_TRANSITIVE**: toda versão nova lê e é lida por **todas** as
  anteriores. Na prática, só se acrescentam campos **com default** (`["null", ...]` com `default: null`),
  e nunca se remove ou renomeia campo.
- **Auto-registro desligado** nos serviços: o schema é registrado pelo pipeline, e um deploy com
  schema incompatível falha no registro, antes de produzir. Nos testes, um registry `mock://`.
- Um envelope por tópico (`eventType` + campos opcionais por tipo): leitores ignoram tipos que não conhecem.
- O formato JSON do Módulo 2 continua disponível por configuração (`Kafka:Format`), mas os dois
  serviços precisam usar o mesmo.

## Alternativas consideradas

- **JSON Schema no Registry.** Mantém a legibilidade do JSON nos logs e no `kafka-console-consumer`.
  Rejeitado: o suporte e as regras de evolução do Avro são mais maduros no ecossistema Confluent
  nas duas linguagens, e a mensagem binária é menor.
- **Protobuf.** Bom suporte nas duas linguagens e geração de código forte. Rejeitado por
  familiaridade do time e porque o modelo de "campo com default" do Avro casa com a regra de compatibilidade escolhida.
- **JSON sem registro, com testes de contrato** (Pact ou similar). Mais leve. Rejeitado porque o
  registro verifica no ponto de produção, para qualquer consumidor, inclusive os que não escreveram teste.
- **BACKWARD em vez de FULL_TRANSITIVE.** Mais permissivo (permite remover campo). Rejeitado: com
  dois serviços implantados em ordens que não controlamos totalmente, e com replay de mensagens
  antigas, queremos que qualquer versão leia qualquer outra.
- **Biblioteca compartilhada com as classes dos eventos.** Impossível entre C# e Java, e indesejável
  mesmo numa stack só (acopla o deploy dos dois).

## Consequências

- Positivas: quebra de contrato vira falha de pipeline, não incidente; o `.avsc` é a documentação
  viva do evento; ordem de deploy entre produtor e consumidor deixa de ser crítica para mudanças compatíveis.
- Negativas: o Registry entra no caminho crítico (com cache local, mas o primeiro uso de um schema
  depende dele); a mensagem binária não se lê a olho nu (precisa de ferramenta com acesso ao
  Registry); o envelope com campos opcionais transfere para o código a validação de "obrigatório por tipo".
- Obrigatório: mudança incompatível de verdade = **tópico novo** (`orders.events.v2`) com período
  de publicação dupla, nunca uma quebra no tópico existente. Mesmo com FULL_TRANSITIVE, o
  consumidor que **exige** um campo novo é implantado depois de o produtor passar a enviá-lo.

## Revisitar quando

- Um terceiro time, numa terceira linguagem, passar a consumir (avaliar Protobuf pela geração de código); ou
- o envelope único por tópico crescer a ponto de a maioria dos campos ser opcional (sinal de que
  vale um subject por tipo de evento, com `RecordNameStrategy`).
