# 3.1 Postgres com EF Core e JPA: mapear agregados sem sujar o domínio

Arquivos: `Infrastructure/Persistence/OrdersDbContext.cs`, `EfOrderRepository.cs`, `SqlMigrator.cs`,
`Migrations/V1__orders.sql` (.NET); `infrastructure/persistence/PaymentEntity.java`,
`JpaPaymentRepository.java`, `db/migration/V1__payments.sql` (Java)

As duas stacks resolvem o mesmo problema de jeitos opostos, e é por isso que esta lição as coloca lado a
lado: o EF Core mapeia **a própria classe de domínio**; no Java, o domínio fica intocado e uma
**entidade JPA separada** faz a ponte.

## O esquema é SQL, revisado como código

Nos dois serviços, as tabelas vêm de um arquivo `V1__*.sql`, e não de geração automática pelo ORM
(`ddl-auto: none` no Hibernate; nada de `EnsureCreated` no EF). Em cada coluna há uma decisão:

```sql
unit_price  numeric NOT NULL CHECK (unit_price > 0),  -- numeric SEM escala: guarda exato
CREATE UNIQUE INDEX ux_orders_idempotency_key ON orders (idempotency_key) WHERE idempotency_key IS NOT NULL;
```

::: porque Por que o índice único é a idempotência de verdade
O `ConcurrentDictionary.GetOrAdd` do Módulo 1 era atômico **dentro de um processo**. Com 3 pods, cada um
tem o seu dicionário, e a mesma `Idempotency-Key` cria 3 pedidos. O índice único está no único lugar que
os 3 pods compartilham: o banco. Ele escolhe a vencedora; a perdedora recebe a violação `23505` e o
repositório devolve o pedido da vencedora. Índice **parcial** (`WHERE ... IS NOT NULL`): pedidos sem
chave continuam permitidos.
:::

O Payments vai além e põe uma regra de negócio no banco:

```sql
CREATE UNIQUE INDEX ux_payments_one_approved_per_order ON payments (order_id) WHERE status = 'APPROVED';
```

A checagem "este pedido já tem pagamento aprovado?" do `PaymentService` é um *check-then-act* (lição
1.8): duas requisições em pods diferentes passam juntas por ela. O índice garante a regra no último
lugar possível, e o `JpaPaymentRepository` traduz a violação para o mesmo `409 payment.order_already_paid`.

## Quem aplica as migrações

| | Orders (.NET) | Payments (Java) |
|---|---|---|
| Ferramenta | `SqlMigrator` (≈60 linhas, no próprio projeto) | Flyway (`spring-boot-starter-flyway`) |
| Quando | `StartAsync` de um hosted service, antes dos consumers | na subida do contexto Spring |
| Concorrência entre pods | `pg_advisory_xact_lock` | trava do próprio Flyway |
| Histórico | tabela `schema_migrations` | tabela `flyway_schema_history` |

O `SqlMigrator` existe para você **ver** o que um Flyway faz: lista de versões aplicadas, tudo numa
transação (DDL no Postgres é transacional), e uma trava para dois pods subindo juntos não aplicarem o
mesmo script duas vezes.

::: armadilha Spring Boot 4 e o Flyway
Até o Boot 3, bastava pôr `flyway-core` no `pom.xml`. No Boot 4, a auto-configuração saiu do módulo
geral e você precisa do `spring-boot-starter-flyway`. Sem ele, nada acontece: nenhum erro, nenhuma
migração, e a aplicação quebra na primeira consulta com "relation payments does not exist". E desde o
Flyway 10 o suporte ao Postgres é outro artefato (`flyway-database-postgresql`).
:::

::: dica Migração no Kubernetes
Rodar migração em cada pod que sobe é prático no laboratório. Em produção, prefira um passo separado
(um `Job` do Kubernetes, ou um passo do pipeline) antes do rollout: a migração não fica refém do
`startupProbe`, e uma migração lenta não derruba o deploy. O Módulo 4 retoma isso.
:::

## .NET: o EF Core mapeia o próprio `Order`

O `Order` do Módulo 1 tem construtor privado, propriedades sem setter público e uma lista privada de
itens. O EF Core consegue materializá-lo assim mesmo:

```csharp
order.Property(o => o.CustomerId).HasColumnName("customer_id");          // get-only: usa o campo de apoio
order.Property<string?>("IdempotencyKey").HasColumnName("idempotency_key"); // propriedade de SOMBRA
order.OwnsMany(o => o.Items, items => { items.ToTable("order_items"); ... });
order.Navigation(o => o.Items).HasField("_items").UsePropertyAccessMode(PropertyAccessMode.Field);
```

- **Propriedade sem setter** não é mapeada por convenção; mapeando explicitamente, o EF escreve no campo
  que o compilador gerou para a auto-property.
- **Propriedade de sombra**: existe no modelo do EF e na tabela, não na classe. A chave de idempotência é
  detalhe da borda HTTP, não do pedido.
- **Owned entities** (`OwnsMany`): itens não existem sem o pedido e são carregados junto, sempre.
- Para materializar, o EF precisa de um construtor que ele saiba preencher; o `Order` ganhou um
  `private Order()` só para isso. É a única concessão do domínio ao ORM.

## Concorrência otimista: `xmin` no Postgres, `@Version` no JPA

O problema que a lição 1.8 deixou aberto: um `cancel` e um `PaymentApproved` chegam juntos para o mesmo
pedido, em pods diferentes. Os dois leem `Pending`, os dois gravam.

```csharp
order.Property<uint>("Version")
    .HasColumnName("xmin").HasColumnType("xid")
    .ValueGeneratedOnAddOrUpdate().IsConcurrencyToken();
```

::: conceito xmin
Coluna de sistema que todo registro do Postgres tem: o id da transação que gravou a versão atual da
linha. Toda gravação muda o `xmin`. O EF gera `UPDATE orders SET ... WHERE id = @id AND xmin = @lido`;
se outro processo gravou antes, 0 linhas mudam e o EF lança `DbUpdateConcurrencyException`, que o
repositório traduz para `ConcurrencyConflictException`.
:::

No Java, a coluna é explícita: `version bigint` + `@Version Long version` na `PaymentEntity`. O
Hibernate incrementa a cada `UPDATE` e põe `AND version = ?` no `WHERE`.

| Quem recebe o conflito | O que faz |
|---|---|
| API (requisição HTTP) | `409` com `code: order.concurrent_update`; o cliente relê e decide |
| Consumer Kafka | exceção → retry (lição 3.4); na tentativa seguinte, relê o pedido já atualizado |

::: previsao
O `cancel` (HTTP) e o `PaymentApproved` (Kafka) chegam no mesmo milissegundo para um pedido `Pending`.
O `PaymentApproved` grava primeiro. O que o cliente que pediu o cancelamento recebe? E se o `cancel`
gravar primeiro?
???
Se o pagamento grava primeiro, o `cancel` recebe `409 order.concurrent_update`; se o cliente tentar de
novo, recebe `409 order.already_paid` (regra de domínio, agora sobre o estado real). Se o `cancel`
grava primeiro, o consumer recebe o conflito, tenta de novo, relê o pedido `Cancelled`, o domínio lança
`order.cancelled`, o `PaymentEventsHandler` registra e segue, e o Payments estorna ao receber o
`OrderCancelled` (a compensação da lição 2.5). Nos dois casos, exatamente um estado final e nenhum
evento contraditório: era o Exercício 5 do Módulo 1.
:::

## Java: entidade separada do domínio

```java
@Entity @Table(name = "payments")
public class PaymentEntity {
    @Id private UUID id;
    @Column(name = "order_id", nullable = false, updatable = false) private UUID orderId;
    @Enumerated(EnumType.STRING) private PaymentStatus status;
    @Version private Long version;
    protected PaymentEntity() { }
    static PaymentEntity forInsert(Payment p, String idempotencyKey) { ... }
    Payment toDomain() { return Payment.restore(...); }
}
```

O JPA exige construtor sem argumentos e campos que ele consiga preencher; o `Payment` tem campos
`final` e construtor privado. Em vez de afrouxar o domínio, o adaptador traduz. O domínio ganhou só
`Payment.restore(...)` (reconstruir sem gerar eventos) e o campo `version`.

::: porque Por que `TransactionTemplate` e não `@Transactional`
`@Transactional` funciona por **proxy**: só vale quando o método é chamado **de fora** do bean. Um
método anotado chamado por outro método da mesma classe roda sem transação, sem aviso. É uma das
perguntas de entrevista de Spring mais comuns. O `TransactionTemplate` deixa a fronteira visível no
código e não depende de proxy. E com propagação `REQUIRED` (o padrão), quando o Inbox já abriu uma
transação, o repositório **participa** dela.
:::

::: armadilha `EnumType.ORDINAL`
O padrão do JPA para enum é gravar o **número** (0, 1, 2). Alguém insere `PENDING` no começo do enum e
todos os pagamentos aprovados viram recusados no banco. Sempre `EnumType.STRING`.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que a idempotência precisa de um índice único no banco, se o código já verifica antes de inserir?
???
A verificação é check-then-act: duas requisições simultâneas, em pods diferentes, passam juntas por ela.
O índice único é atômico e compartilhado por todos os pods; o código trata a violação devolvendo o
registro vencedor.
:::

::: pergunta
O que é `xmin` e como o EF Core o usa?
???
A coluna de sistema do Postgres com o id da transação que gravou a versão atual da linha. Mapeada como
token de concorrência, o EF acrescenta `AND xmin = @lido` ao UPDATE; 0 linhas afetadas vira
`DbUpdateConcurrencyException`. Concorrência otimista sem coluna de versão.
:::

**Próxima:** [3.2 Transactional Outbox](02-outbox.md).
