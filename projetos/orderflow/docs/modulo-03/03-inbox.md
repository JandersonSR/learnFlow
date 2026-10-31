# 3.3 Inbox: o consumidor idempotente

Arquivos: `Persistence/EfInbox.cs`, `Messaging/PaymentEventsConsumer.cs` (.NET);
`persistence/JdbcInbox.java`, `kafka/OrderEventsListener.java` (Java)

## De onde vêm as duplicatas

O Módulo 2 escolheu "pelo menos uma vez" e o outbox também é "pelo menos uma vez". Juntando, a mesma
mensagem pode chegar repetida por pelo menos quatro caminhos:

1. O relay publicou e caiu antes de marcar `published_at` (lição 3.2).
2. O consumer processou e caiu antes de confirmar o offset.
3. Rebalance: a partição mudou de dono entre o processamento e o commit.
4. Alguém reprocessou o DLT ou voltou o offset do grupo de propósito.

::: conceito Consumidor idempotente
Processar a mesma mensagem duas vezes produz o mesmo resultado que processar uma. Ou porque a operação
já é naturalmente idempotente (`MarkAsPaid` num pedido pago não faz nada), ou porque o consumidor
**lembra** o que já processou e pula. A segunda forma é o Inbox.
:::

## Por que a idempotência do domínio não basta

O `Order.MarkAsPaid` do Módulo 1 já ignora a segunda chamada. Então para que uma tabela?

::: previsao
Sem Inbox, o Orders recebe `PaymentApproved` duas vezes para o mesmo pedido. O pedido fica `Paid` uma
vez só (domínio idempotente). O que mais acontece na segunda vez? E se a sequência fosse: aprovado,
**estornado**, e o aprovado repetido chegasse depois do estorno?
???
Na repetição simples, nada de errado no estado; mas o handler rodou de novo, e qualquer efeito fora do
agregado (um e-mail, uma chamada a outro sistema, uma métrica) aconteceria duas vezes. No segundo
caso o problema é real: um `PaymentApproved` velho, reaplicado depois de um estado mais novo, pode
"desfazer" o estorno se o domínio aceitar a transição. A idempotência de **operação** não protege contra
**reordenação de repetições**. O Inbox protege das duas: aquele `eventId` já foi processado, ponto.
:::

## O Inbox numa transação só

```sql
BEGIN;
INSERT INTO inbox_messages (consumer, message_id, processed_at)
VALUES ('orders', '01a1...', now())
ON CONFLICT DO NOTHING;                     -- 0 linhas? já processada: ROLLBACK e sai
-- o handler: carrega o pedido, MarkAsPaid, grava pedido + outbox (OrderPaid)
COMMIT;
```

No .NET (`EfInbox`), a transação é aberta explicitamente no `DbContext`, e o `SaveChangesAsync` que o
repositório chama lá dentro **participa** dela, porque é o mesmo `DbContext` (mesmo escopo de DI, criado
pelo consumer para cada mensagem). No Java (`JdbcInbox`), o `TransactionTemplate` abre a transação, e o
`JpaPaymentRepository` (outro `TransactionTemplate`, propagação `REQUIRED`) entra nela.

Quatro coisas acontecem atomicamente: "processei este evento", a mudança no agregado, o evento novo na
outbox, e (pelo commit do offset depois) "o Kafka sabe que passei daqui". As três primeiras estão no
mesmo `COMMIT`; a quarta pode falhar sozinha, e aí o Inbox absorve a repetição.

::: porque Por que `ON CONFLICT DO NOTHING` e não `SELECT` antes
`SELECT ... WHERE message_id = ?` seguido de `INSERT` é *check-then-act* de novo: duas cópias da mesma
mensagem processadas ao mesmo tempo (durante um rebalance, dois pods) passam juntas pelo `SELECT`. Com
o `INSERT` direto, a chave primária resolve: o segundo `INSERT` **espera** a transação do primeiro. Se
o primeiro confirmar, o segundo vê o conflito e devolve 0 linhas. Se o primeiro desfizer (o handler
falhou), o segundo insere e processa. Sem `lock`, sem tabela de controle.
:::

::: armadilha O Inbox fora da transação
Registrar o `eventId` numa transação e aplicar o efeito em outra (ou num Redis "processados") cria a
janela inversa: registrou, caiu antes do efeito, e a mensagem nunca mais será processada. O registro e
o efeito precisam ter o mesmo destino. Se o efeito é num sistema sem transação compartilhada (uma API
externa), o que se faz é passar o `eventId` como chave de idempotência para **essa** API, como o
`PaymentGateway` faz com a `Idempotency-Key` do adquirente.
:::

## Chave do Inbox: (consumidor, mensagem)

`PRIMARY KEY (consumer, message_id)`: o mesmo evento pode ser processado por consumidores diferentes
do mesmo serviço, cada um uma vez. Hoje o Orders só tem um consumidor com Inbox (`orders`), mas no dia
em que o grupo de notificações precisar de Inbox, a tabela já serve.

## O que fica fora do Inbox

O `OrderNotificationsConsumer` **não** usa Inbox: uma notificação simulada repetida num rebalance é
aceitável. Decidir onde a duplicata dói é trabalho de quem desenha o sistema:

| Efeito | Duplicata | Proteção |
|---|---|---|
| Marcar pedido como pago | inofensiva no estado, perigosa se reordenada | Inbox + domínio idempotente |
| Estornar pagamento (compensação) | dinheiro devolvido duas vezes | Inbox + domínio (`refund` idempotente) + chave no adquirente |
| E-mail ao cliente | incômodo | talvez Inbox; talvez aceitar |
| Log, métrica | irrelevante | nada |

## Exactly-once do Kafka: por que não usamos

O Kafka tem transações (`transactional.id`, `isolation.level=read_committed`): consumir, produzir e
confirmar o offset numa transação só. É o *exactly-once semantics* (EOS). Ele cobre o caso
**Kafka → Kafka**, como um Kafka Streams que lê um tópico e escreve em outro (Módulo 5). Quando o efeito
é num **banco**, a transação do Kafka e a do Postgres continuam separadas: o EOS não ajuda, e o padrão
é exatamente o deste módulo, pelo menos uma vez + Inbox.

::: quebra Lab: reprocessar de propósito
Com os serviços parados, volte o offset do grupo `orders` para o início e suba o Orders de novo:

```bash
docker compose -f deploy/local/docker-compose.yml exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --group orders --topic payments.events --reset-offsets --to-earliest --execute
```

Antes: o que o Orders faz com cada `PaymentApproved` antigo? Algum `OrderPaid` novo aparece em
`orders.events`?
:::

::: solucao
Todos os eventos são relidos, e o `EfInbox` devolve `false` para cada um (já processado): nenhum
handler roda, nenhuma linha nova na outbox, nenhum `OrderPaid` repetido. Sem o Inbox, o domínio também
não geraria `OrderPaid` de novo (`MarkAsPaid` é idempotente), mas qualquer efeito colateral do handler
rodaria outra vez. O `--reset-offsets` só funciona com o grupo **sem membros ativos**; com o Orders
rodando, a ferramenta recusa.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que o registro no Inbox e o efeito do handler precisam estar na mesma transação?
???
Se forem separados, há uma janela: registrar e cair antes do efeito perde a mensagem para sempre;
aplicar o efeito e cair antes de registrar processa de novo. Na mesma transação, ou os dois acontecem,
ou nenhum.
:::

::: pergunta
O Kafka tem exactly-once. Por que o OrderFlow ainda precisa de Inbox?
???
O exactly-once do Kafka vale para Kafka → Kafka (consumir, produzir e confirmar offset numa transação
do Kafka). O efeito do OrderFlow é no Postgres, que não participa dessa transação. Com banco no meio, a
garantia é pelo menos uma vez + consumidor idempotente.
:::

**Próxima:** [3.4 Retry, backoff e DLT](04-retry-e-dlt.md).
