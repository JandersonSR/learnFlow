# Módulo 3: Exercícios

Cada exercício é um commit no seu repositório.

---

## Exercício 3.1: Rodar, e comparar com o EF Migrations

1. `docker compose ... up -d`, os dois serviços no modo padrão, roteiro completo do `requests.http`.
2. `dotnet test` (com Docker) e `./mvnw verify`. Anote no `NOTAS.md` tudo que quebrou e por quê.
3. Gere a migração EF equivalente ao `V1__orders.sql`: `dotnet ef migrations add Inicial` (precisa do
   pacote `Microsoft.EntityFrameworkCore.Design`) e `dotnet ef migrations script`.

**Aceite:** `NOTAS.md` com a diferença entre o SQL gerado pelo EF e o `V1__orders.sql` (o índice
parcial? o `CHECK` do status? o `numeric` sem escala?) e sua opinião, com argumentos, sobre qual dos dois
deveria ser a fonte da verdade num time de 18 devs.

---

## Exercício 3.2: Entidade separada ou domínio mapeado?

O Orders mapeia o próprio `Order` no EF; o Payments tem `PaymentEntity` separada. Escolha um dos dois
serviços e reescreva-o no estilo do outro.

**Aceite:** os testes continuam passando, e um ADR (`docs/adr/`) com o que você sentiu escrevendo:
quantas linhas, quantas concessões no domínio, o que ficou mais fácil de testar.

---

## Exercício 3.3: A regra no banco

O índice `ux_payments_one_approved_per_order` garante "um aprovado por pedido". Escreva um teste
`*IT` que dispara 20 `POST /payments` **sem** `Idempotency-Key` para o mesmo pedido, em paralelo, e
verifica: exatamente um `201` com `APPROVED`, os outros `409 payment.order_already_paid`, nenhum `500`.

**Aceite:** o teste passa 10 de 10 vezes. Ele vai mostrar o problema da lição 1J.7: o gateway foi
chamado 20 vezes. Explique no `NOTAS.md` por que o índice não resolve **isso**, e proponha uma solução
(dica: reservar antes de cobrar).

---

## Exercício 3.4: Vários relays em paralelo

Hoje a advisory lock deixa um relay por vez. Com muito volume, ele vira gargalo. Reescreva o relay para
que N pods publiquem em paralelo **sem quebrar a ordem por pedido**.

**Aceite:** desenho no `NOTAS.md` antes do código (por exemplo: `hashtext(message_key) % N` e uma
advisory lock por "fatia"), teste com 3 instâncias do relay e 1.000 eventos de 50 pedidos verificando a
ordem por pedido no Kafka.

---

## Exercício 3.5: `timestamp-millis` de verdade

Migre `occurredAt` para `{"type": "long", "logicalType": "timestamp-millis"}` nos dois schemas, sem
quebrar a compatibilidade com as mensagens já gravadas.

**Aceite:** explique por que trocar o tipo de um campo existente **não** passa no `FULL_TRANSITIVE` e
como você contornou (campo novo + período de transição). Teste de ida e volta .NET → Java e Java → .NET
(o C# do `Apache.Avro` quer `DateTime`; o Java, `Long` ou `Instant` conforme
`avro.use.logical.type.converters`).

---

## Exercício 3.6: União em vez de envelope plano

Redesenhe `orders.events` com um schema de união (`OrderCreated | OrderPaid | OrderCancelled`, cada um com
seus campos obrigatórios) usando *schema references* no registry.

**Aceite:** os dois codecs adaptados, os testes de contrato, e um parágrafo comparando: o que a união
garante que o envelope não garante, e o que ela custa para acrescentar um tipo de evento novo (dica:
FORWARD).

---

## Exercício 3.7: Schema Registry no teste do .NET

Feche a lacuna da lição 3.6: um teste .NET que produz em Avro, com um Schema Registry em container, e
consome com o `AvroPaymentEventCodec`.

**Aceite:** o teste passa, e o `NOTAS.md` explica como você resolveu o endereço do Kafka visto de dentro
da rede Docker.

---

## Desafio sem roteiro: o replay do DLT

::: desafio
Construa uma ferramenta de linha de comando (na linguagem que quiser) para reprocessar um DLT:

1. lista as mensagens de `payments.events.orders.dlt` com partição, offset de origem, tipo e mensagem de erro;
2. reprocessa uma mensagem específica, ou todas de um intervalo de tempo, republicando no tópico de
   origem **com a mesma chave**;
3. registra o que foi reprocessado (para não reprocessar duas vezes por engano).

Critérios de aceite:
- republicar uma mensagem que já tinha sido processada não muda nada no Orders (prove com o Inbox);
- a ferramenta recusa republicar no tópico errado (o header de origem manda);
- se você escrever em Node ou Python: qual particionador o cliente usa por padrão, e o que você fez a
  respeito (lição 2.2)?
- um runbook curto (`docs/runbooks/`) de "o alerta do DLT disparou: o que eu faço".
:::

## Checklist de saída do módulo

- [ ] Explico o dual write problem e o outbox, inclusive por que ele é "pelo menos uma vez".
- [ ] Explico por que outbox e inbox andam juntos.
- [ ] Sei classificar uma falha de consumer e dizer para onde a mensagem vai.
- [ ] Explico `BACKWARD`, `FORWARD`, `FULL` e quem atualiza primeiro em cada um.
- [ ] Sei por que os testes de persistência usam Postgres real.
- [ ] Exercícios 3.1 a 3.3 commitados.

Próximo: [Perguntas de entrevista](perguntas-de-entrevista.md)
