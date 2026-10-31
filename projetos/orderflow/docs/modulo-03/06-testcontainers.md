# 3.6 Testes com Testcontainers

Arquivos: `tests/OrderFlow.Orders.Tests/Persistence/`, `Messaging/OutboxRelayKafkaTests.cs`,
`Messaging/EventContractsTests.cs` (.NET); `src/test/.../integration/PaymentsKafkaPostgresIT.java` (Java)

## Por que não um banco "parecido"

Tudo que este módulo construiu depende de comportamento **específico do Postgres**: índice único
parcial, `xmin`, `ON CONFLICT DO NOTHING`, `FOR UPDATE SKIP LOCKED`, `pg_try_advisory_xact_lock`. O
provider InMemory do EF não tem transação nem índice único; o SQLite não tem `xmin` nem advisory lock;
o H2 do Java imita o Postgres até o dia em que não imita. Um teste verde com eles prova que o código
funciona **com eles**.

::: conceito Testcontainers
Biblioteca (Java, .NET, Go, Node, Python...) que sobe containers Docker de verdade a partir do código do
teste, espera ficarem prontos, entrega o endereço e os derruba no fim. O teste fala com um Postgres 18 e
um Kafka reais, numa porta aleatória, descartáveis.
:::

## A pirâmide do OrderFlow

| Camada | Quantos | Precisa de | Exemplos |
|---|---|---|---|
| Domínio e aplicação | muitos | nada | `OrderTests`, `PaymentServiceTest`, `OrderEventHandlerTest` |
| Contrato | alguns | nada | `EventContractsTests` (ida e volta JSON e Avro, mensagem do jeito que o Java produz) |
| API em memória | alguns | nada | `OrderEndpointsTests` com `InMemoryOrdersApiFactory`, `PaymentApiIntegrationTest` com perfil `lab` |
| Persistência e mensageria | poucos | Docker | `EfOrderRepositoryTests`, `OutboxRelayKafkaTests`, `PaymentsKafkaPostgresIT` |

::: porque Por que o teste de contrato não precisa de Kafka
A integração entre .NET e Java quebra quase sempre no **formato**: um campo renomeado, um decimal com
vírgula, uma data com fuso. O `EventContractsTests` monta um `PaymentEventMessage` exatamente como o
Java produz (data com microssegundos, `Instant.toString()`), e o teste do codec Avro lê o
`payments-events.avsc` **do projeto Java** (linkado no `.csproj`), não de uma cópia. Se o Payments mudar
o schema, o teste do Orders roda contra o schema novo. Milissegundos, sem Docker, pegando o erro que mais
acontece.
:::

## .NET: uma fixture por classe

```csharp
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:18").Build();

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        await using var db = CreateDbContext();
        await new SqlMigrator(...).MigrateAsync(db, CancellationToken.None); // o MESMO migrador da app
    }
}

[Trait("Category", "Integration")]
public class EfOrderRepositoryTests(PostgresFixture postgres) : IClassFixture<PostgresFixture> { ... }
```

- **`IClassFixture`**: um container por classe de teste, compartilhado pelos testes dela. Subir um
  Postgres leva segundos; um por teste deixaria a suíte lenta demais.
- **O mesmo `SqlMigrator`** da aplicação cria o esquema. Se o SQL e o mapeamento do EF divergirem (uma
  coluna com outro nome), o teste quebra aqui, e não em produção.
- **`[Trait("Category", "Integration")]`**: `dotnet test --filter "Category!=Integration"` roda o resto
  numa máquina sem Docker.

Os testes que valem a pena escrever com banco real são os que testam **o que o banco garante**:

```csharp
// 20 "pods", cada um com sua conexão, a mesma Idempotency-Key, ao mesmo tempo
var results = await Task.WhenAll(Enumerable.Range(0, 20).Select(async _ =>
{
    await using var db = postgres.CreateDbContext();
    return await NewRepository(db).AddAsync(NewOrder("cli-idem"), key, CancellationToken.None);
}));
Assert.Single(results, r => r.Created);
```

E o conflito de `xmin` com dois `DbContext` lendo o mesmo pedido, o Inbox processando uma vez só, e o
Inbox desfazendo o registro quando o handler falha.

::: armadilha Testes que passam por estado compartilhado
Os testes de uma classe compartilham o container. Cada teste usa dados próprios (`Guid` novo, chave
nova, cliente com nome próprio) e nunca assume uma tabela vazia. O `OutboxRelayKafkaTests` publica até
a outbox esvaziar e filtra o que consome pela chave do pedido que **ele** criou. Ordem de execução de
teste não é contrato.
:::

## Java: `@ServiceConnection` e uma rede para o Schema Registry

```java
@Container @ServiceConnection
static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

@Container @ServiceConnection
static final KafkaContainer kafka = new KafkaContainer("apache/kafka:4.3.2")
        .withNetwork(network).withListener("kafka:19092");

@Container
static final GenericContainer<?> schemaRegistry = new GenericContainer<>("confluentinc/cp-schema-registry:8.3.2")
        .withNetwork(network)
        .withEnv("SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS", "PLAINTEXT://kafka:19092")
        ...;
```

- **`@ServiceConnection`** (Spring Boot 3.1+): o Boot lê endereço, usuário e senha do container e
  configura `spring.datasource.*` e `spring.kafka.bootstrap-servers` sozinho.
- **`withListener("kafka:19092")`**: o mesmo problema dos listeners da lição 2.1. O teste fala com o
  Kafka pela porta mapeada no host; o Schema Registry, outro container, precisa de um endereço **dentro**
  da rede Docker. O Testcontainers acrescenta esse segundo listener.
- O registry não tem módulo próprio: `GenericContainer` com espera em `GET /subjects`.
- **`@DynamicPropertySource`** para o que não é "service connection": a URL do registry, e
  `auto-register-schemas=true`, porque o registry do teste começa vazio. **Só no teste.**

::: dica Testcontainers 2.x
No Testcontainers 2.0 os artefatos ganharam o prefixo `testcontainers-` (`testcontainers-postgresql`,
`testcontainers-kafka`) e as classes dos módulos mudaram de pacote
(`org.testcontainers.postgresql.PostgreSQLContainer`, sem o genérico `<?>`). Tutorial com
`org.testcontainers.containers.PostgreSQLContainer<?>` é da linha 1.x.
:::

O teste Java atravessa o módulo inteiro: um `OrderCreated` em Avro chega (como o Orders produziria,
usando o `.avsc` do projeto .NET), o listener grava em `known_orders` pelo Inbox, o `POST /payments`
com valor errado é recusado, o certo grava pagamento e outbox, o relay publica em Avro, e um segundo
teste prova que uma mensagem envenenada vai para `orders.events.payments.dlt` com os bytes originais.

::: porque Por que o .NET não sobe um Schema Registry
O módulo Kafka do Testcontainers for .NET não documenta um listener extra para outros containers da
rede, como o Java faz com `withListener`. Montar isso à mão (listeners e endereço anunciado conhecidos
só depois de o container subir) é frágil. A divisão escolhida: o .NET testa o **relay e o Kafka** com o
formato JSON, e o **codec Avro** sem rede (ida e volta binária com o schema real); o Java testa Avro +
registry ponta a ponta. Juntos, cobrem o contrato nos dois sentidos. O Exercício 3.7 pede para fechar
essa lacuna.
:::

## `*Test` e `*IT` no Maven

O Surefire roda `*Test` na fase `test`; o Failsafe roda `*IT` na fase `integration-test` (e falha o build
no `verify`). `./mvnw test` continua rápido e sem Docker; `./mvnw verify` roda tudo. O `pom.xml` ganhou
o plugin do Failsafe para isso.

## Vídeo

::: video Testcontainers and Spring Boot from integration tests to local development (Oleg Šelajev, Spring I/O, em inglês)
https://www.youtube.com/watch?v=7rTs3e79sDo
`@ServiceConnection`, reutilização de containers e o uso dos mesmos containers no desenvolvimento local.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que não testar o repositório com o provider InMemory do EF Core?
???
Porque o que o repositório garante depende do Postgres: índice único, transação, xmin, ON CONFLICT. O
InMemory não tem nada disso; o teste passaria e provaria só que o código funciona contra um banco que
não existe em produção.
:::

::: pergunta
Para que serve o `withListener` no `KafkaContainer`?
???
Para outro container na mesma rede Docker (o Schema Registry) alcançar o Kafka por um nome interno. O
listener padrão é anunciado com o endereço do host, que não serve de dentro da rede.
:::

**Próximo:** [Exercícios](exercicios.md).
