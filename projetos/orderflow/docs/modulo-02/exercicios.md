# Módulo 2: Exercícios

Cada exercício é um commit no seu repositório. Os critérios de aceite dizem quando está pronto.

---

## Exercício 2.1: Rodar tudo de verdade (e trazer o que quebrou)

O código deste módulo foi escrito e revisado contra a documentação, mas **não foi compilado nem
executado** no ambiente em que o curso foi montado (sem SDK .NET, sem Maven Central, sem Docker).

1. `docker compose -f deploy/local/docker-compose.yml up -d` e confira que `kafka-init` e
   `schemas-init` terminaram com `exit 0`.
2. `dotnet build && dotnet test --filter "Category!=Integration"` e `./mvnw test`.
3. Os dois serviços no modo do Módulo 2 (README do módulo) e o roteiro "Fluxo por eventos" do `requests.http`.

**Aceite:** um `NOTAS.md` com cada erro encontrado, a causa e a correção (ou "nenhum"). Erro de
compilação aqui é ótimo exercício: é exatamente o que acontece quando você atualiza uma biblioteca.

---

## Exercício 2.2: Provar a ordem por chave

Escreva um teste (no .NET, com Testcontainers Kafka, como o `OutboxRelayKafkaTests`) que publica 100
eventos para 10 orderIds diferentes, intercalados, num tópico de 3 partições, e verifica que um
consumidor recebe os eventos de **cada** orderId na ordem em que foram publicados.

**Aceite:** o teste passa 10 de 10 vezes. No `NOTAS.md`, explique por que ele **falharia** se você
trocasse a chave por `null`.

<details><summary>Dica</summary>

Com chave nula, o librdkafka escolhe uma partição aleatória (o "Random" de `Murmur2Random`). Para o
teste falhar de forma visível, publique sequências curtas (Created, Paid, Cancelled) por pedido e
confira a ordem por pedido no consumidor.
</details>

---

## Exercício 2.3: KIP-848 na prática

Ligue o protocolo novo nos dois serviços (`Kafka:UseConsumerGroupProtocol=true` no .NET;
`group.protocol: consumer` no Java, removendo `partition.assignment.strategy`). Repita o lab da lição
2.4 (dois Payments, Ctrl+C em um).

**Aceite:** tabela no `NOTAS.md` comparando, com os dois protocolos: tempo até o segundo membro receber
partições, o que aparece no log de rebalance, e a saída de `kafka-consumer-groups.sh --describe --members`.

---

## Exercício 2.4: Decidir o pedido desconhecido

Hoje o Payments **aceita** pagamento de pedido que ele ainda não conhece (lição 2.5). Implemente a
alternativa "validar depois": quando o `OrderCreated` chegar, se já existir pagamento aprovado com valor
diferente do total, estornar com motivo `amount_mismatch`.

**Aceite:** teste de unidade no `OrderEventHandlerTest` para os dois casos (valor bate e não bate) e
um ADR curto (`docs/adr/`) com as três opções da lição e a escolhida.

---

## Exercício 2.5: Quem compensa o quê

O Orders não tem estado "Refunded". Quando o Payments estorna (por pedido do cliente ou por
compensação), o pedido continua `Paid` ou `Cancelled`.

**Aceite:** novo estado no domínio do Orders, transição a partir de `Paid`, tratamento do
`PaymentRefunded` no `PaymentEventsHandler`, testes de domínio. Discuta no commit: o que acontece se o
`PaymentRefunded` chegar para um pedido `Cancelled`?

---

## Desafio sem roteiro: um terceiro serviço

::: desafio
Crie um serviço **Shipping** (na linguagem que você quiser, inclusive Node/TS com `kafkajs` ou
`@confluentinc/kafka-javascript`) que:

1. consome `orders.events` num grupo próprio e só se interessa por `OrderPaid`;
2. "despacha" o pedido e publica `ShipmentCreated` num tópico `shipments.events`, chave orderId;
3. o Orders passa a mostrar o pedido como `Shipped`.

Critérios de aceite:
- nenhuma mudança no Payments;
- o contrato de `shipments.events` documentado com o mesmo cuidado do `EventContracts` (dinheiro, datas, eventId);
- se o Shipping ficar fora do ar por 10 minutos, nenhum pedido pago fica sem despacho quando ele voltar
  (mostre com o lag do grupo);
- se você usar Node: explique no README do serviço qual particionador o cliente usa por padrão e o que
  fez a respeito (lição 2.2).
:::

## Checklist de saída do módulo

- [ ] Explico tópico, partição, offset e consumer group sem olhar, com o OrderFlow como exemplo.
- [ ] Explico por que `acks=all` + idempotência, e por que o .NET precisa ligar a idempotência à mão.
- [ ] Explico a diferença entre `session.timeout.ms` e `max.poll.interval.ms`.
- [ ] Sei dizer onde o OrderFlow ainda perde ou duplica eventos (e por que o Módulo 3 existe).
- [ ] Exercícios 2.1 a 2.3 commitados.

Próximo: [Perguntas de entrevista](perguntas-de-entrevista.md)
