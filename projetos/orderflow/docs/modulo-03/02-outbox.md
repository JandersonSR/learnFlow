# 3.2 Transactional Outbox e o relay

Arquivos: `EfOrderRepository.cs` (`EnqueuePendingEvents`), `Persistence/OutboxRelay.cs` (.NET);
`OutboxWriter.java`, `OutboxRelay.java` (Java)

## O problema, de novo, com um broker de verdade

O lab da lição 2.2 mostrou: Kafka fora, pedido salvo, evento perdido. Inverter a ordem (publica, depois
salva) só troca o problema: evento de um pedido que não existe. Não existe ordem segura para duas
escritas em dois sistemas sem uma transação entre eles, e não existe transação entre Postgres e Kafka.

## A ideia: uma escrita só

::: conceito Transactional Outbox
O evento é gravado numa tabela (`outbox_messages`) do **mesmo banco**, na **mesma transação** da
mudança de negócio. Ou os dois ficam, ou nenhum. Um processo separado, o **relay**, lê a tabela e
publica no Kafka, marcando o que já foi.
:::

```mermaid
sequenceDiagram
    participant S as OrderService
    participant DB as Postgres
    participant R as OutboxRelay
    participant K as Kafka
    S->>DB: BEGIN; INSERT orders; INSERT order_items; INSERT outbox_messages; COMMIT
    Note over S: 201 Created (mesmo com o Kafka fora)
    loop a cada 500 ms
        R->>DB: BEGIN; trava; SELECT ... FOR UPDATE SKIP LOCKED
        R->>K: produce (lote)
        K-->>R: acks
        R->>DB: UPDATE published_at; COMMIT
    end
```

No .NET, o "mesma transação" sai de graça: o `SaveChangesAsync` grava **tudo** que está no change
tracker numa transação só, e o repositório põe as linhas da outbox no tracker antes:

```csharp
db.Orders.Add(order);
EnqueuePendingEvents(order);       // db.OutboxMessages.Add(...) para cada evento pendente
await db.SaveChangesAsync(ct);     // pedido + itens + outbox: um COMMIT
```

No Java, o `OutboxWriter` usa `JdbcClient` dentro do `TransactionTemplate` do repositório. O
`JpaTransactionManager` expõe a conexão JDBC da transação JPA, então o `INSERT` da outbox vai na mesma
conexão e no mesmo `COMMIT` do `PaymentEntity`.

::: porque Por que o serviço não publica mais
Até o Módulo 2, o `OrderService` fazia "salva, depois publica". Agora o contrato do `IOrderRepository`
diz: "grava o pedido **e** os eventos pendentes dele". O serviço perdeu linhas; a complexidade ficou
dentro do adaptador, que é onde ela pertence. O modo em memória cumpre o mesmo contrato do jeito
antigo (repassa ao publicador), e por isso continua com o *dual write*.
:::

## O eventId nasce na outbox

```csharp
var eventId = Guid.CreateVersion7(now);
var message = OrderEventMapping.ToMessage(orderEvent, eventId);
```

::: previsao
O relay publica um lote, o Kafka confirma, e o pod morre antes do `COMMIT` que marca `published_at`.
O que acontece no próximo ciclo? O consumidor percebe?
???
O lote **volta a ser publicado**: para o banco, aquelas linhas nunca saíram. O consumidor recebe as
mesmas mensagens duas vezes, com o **mesmo** `eventId`, porque o id foi gerado ao gravar na outbox e não
ao publicar. O Inbox do consumidor (lição 3.3) reconhece e descarta. O outbox garante **pelo menos uma
vez** na publicação, nunca exatamente uma: é por isso que outbox e inbox andam juntos.
:::

## O relay por dentro

```sql
SELECT pg_try_advisory_xact_lock(<chave fixa>);                       -- 1. um relay por vez
SELECT * FROM outbox_messages WHERE published_at IS NULL
ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED;                         -- 2. o lote, em ordem
-- 3. envia tudo, espera os acks NA ORDEM, marca o prefixo que deu certo
UPDATE outbox_messages SET published_at = now() WHERE ...;            -- 4.
COMMIT;                                                               -- 5. a trava some aqui
```

**1. A trava (`pg_try_advisory_xact_lock`).** Com 3 pods do Orders, 3 relays rodando. Sem coordenação,
o pod A pega as linhas 1 a 100, o pod B as 101 a 200 e publica antes do A. Se a linha 150 for o
`OrderCancelled` do pedido X e a 90 o `OrderCreated` dele, o Kafka recebe o cancelamento antes da
criação: a ordem por chave que o Kafka garante foi quebrada **antes** de chegar nele. A trava
consultiva por transação deixa um relay publicando por vez; os outros saem na hora (`try`) e tentam no
próximo ciclo. Se o pod morre, a conexão cai, o Postgres desfaz a transação e solta a trava sozinho.

::: conceito Advisory lock
Uma trava do Postgres sobre um **número** que você escolhe, sem relação com nenhuma linha ou tabela. A
versão `_xact_` é solta automaticamente no fim da transação. Ótima para "só um processo do cluster faz
isto por vez" sem tabela de controle nem ferramenta de eleição de líder.
:::

**2. `FOR UPDATE SKIP LOCKED`.** Trava as linhas do lote e **pula** as que outra transação já travou,
em vez de esperar. Com a advisory lock ele é redundante hoje; ele é o que permite, amanhã, ter vários
relays em paralelo, cada um responsável por um conjunto de chaves (Exercício 3.4).

::: armadilha `ORDER BY id` é ordem de inserção, não de commit
A transação T1 pega o id 10, a T2 pega o 11, a T2 confirma primeiro. O relay vê o 11 (o 10 ainda não
é visível) e o publica antes do 10. Isso quebra a ordem? **Não para o mesmo pedido**: duas transações
que alteram o mesmo pedido são serializadas pela concorrência otimista (`xmin`), e a segunda só
começa a gravar depois de ler o resultado da primeira, já confirmada. Então, **por agregado**, ordem de
id = ordem de commit. Entre pedidos diferentes, a ordem não importa (chaves diferentes). Esse
raciocínio, "a ordem é garantida pelo quê, exatamente?", é o tipo de coisa que um staff pergunta num
design review.
:::

**3. Enviar tudo, esperar na ordem, parar no primeiro erro.**

```csharp
foreach (var message in batch) sends.Add(SendAsync(message, ct));   // dispara tudo
for (var i = 0; i < batch.Count; i++)
{
    try { await sends[i]; batch[i].PublishedAt = now; }
    catch (...) { batch[i].Attempts++; batch[i].LastError = ...; break; }
}
```

Mandar um por um, esperando cada ack, custaria uma ida e volta ao broker por mensagem. Disparando
todos, o producer junta em lotes. E por que parar no primeiro erro? Se a mensagem 5 falhou e a 6 deu
certo, marcar a 6 e não a 5 faria a 5 sair **depois** da 6 no próximo ciclo. Com o producer
**idempotente**, mensagens da mesma partição atrás de uma que falhou também falham (o broker recusa
sequência fora de ordem), então nenhuma mensagem do mesmo pedido "passa à frente". As de outros pedidos
que tenham saído viram duplicata no próximo ciclo, e o Inbox resolve.

## O que o outbox muda no comportamento

::: quebra Lab: Kafka fora, agora com outbox
Com os dois serviços no modo padrão (Postgres + Kafka + Avro):

```bash
docker compose -f deploy/local/docker-compose.yml stop kafka
# crie 3 pedidos pelo requests.http
docker compose -f deploy/local/docker-compose.yml exec postgres \
  psql -U orders -d orders -c "select id, event_type, published_at, attempts, left(last_error, 60) from outbox_messages order by id desc limit 5"
docker compose -f deploy/local/docker-compose.yml start kafka
# rode o select de novo depois de alguns segundos
```

Antes: o `POST /orders` demora? Que status volta? O que a outbox mostra com o Kafka fora e depois?
:::

::: solucao
`201` em milissegundos: a requisição não fala mais com o Kafka. Com o broker fora, as linhas ficam com
`published_at` nulo, e `attempts`/`last_error` crescendo (`Local: Message timed out` depois de 30 s por
tentativa). Quando o Kafka volta, o relay publica tudo, em ordem, e `published_at` é preenchido. Nenhum
evento perdido, e a disponibilidade da API deixou de depender do Kafka. Compare com o lab da lição 2.2.
:::

## Polling ou CDC?

| | Polling (o que fizemos) | CDC (Debezium) |
|---|---|---|
| Como lê | `SELECT` periódico | lê o WAL (log de replicação) do Postgres |
| Latência | até o intervalo (500 ms) | dezenas de ms |
| Carga no banco | consultas periódicas (índice parcial ajuda) | quase nenhuma |
| Peças móveis | nenhuma além da app | Kafka Connect + Debezium + slot de replicação |
| Ordem | você garante (trava + id) | ordem do WAL = ordem de commit |

Polling é o ponto de partida certo para a maioria dos times. Debezium compensa com volume alto ou
quando vários serviços já usam Kafka Connect. O Módulo 5 discute.

::: dica Limpeza
A tabela só cresce. Em produção, um job apaga linhas publicadas há mais de N dias (ou o
particionamento por data do Postgres descarta partições inteiras). O índice parcial
`WHERE published_at IS NULL` mantém o relay rápido mesmo com milhões de linhas publicadas.
:::

## Vídeos

::: video Transactional Outbox Pattern na Prática (Giuliana Bezerra)
https://www.youtube.com/watch?v=0_Fm-xr3LY8
O padrão implementado passo a passo, com Spring.
:::

::: video Outbox Pattern: Fixing event failures in an event-driven architecture (Drawing Boxes, em inglês)
https://www.youtube.com/watch?v=tQw99alEVHo
Visão de arquitetura, em menos de 5 minutos.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que o eventId é gerado ao gravar na outbox, e não ao publicar?
???
Porque o relay pode publicar a mesma linha mais de uma vez (crash entre o ack e o commit). Com o id
gerado na gravação, as cópias são idênticas e o consumidor deduplica. Gerado na publicação, cada cópia
teria um id novo e pareceria um evento diferente.
:::

::: pergunta
Para que serve a advisory lock no relay?
???
Garantir um relay publicando por vez no cluster. Com vários relays em paralelo pegando lotes
diferentes, eventos do mesmo pedido podem ser publicados fora de ordem antes mesmo de chegar ao Kafka.
:::

**Próxima:** [3.3 Inbox](03-inbox.md).
