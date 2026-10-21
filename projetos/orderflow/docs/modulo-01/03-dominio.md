# 1.3 O domínio: regras que não dependem de nada

Arquivos: `src/OrderFlow.Orders.Api/Domain/`

## A regra de dependência

```
Api  ──▶  Application  ──▶  Domain
 │             ▲
 └──▶ Infrastructure (implementa as interfaces de Application)
```

O **Domain não referencia nada**: nem ASP.NET, nem Kafka, nem banco. Isso não é purismo, é
prático:

- O mesmo `Order.Cancel()` vai ser chamado por um endpoint HTTP (hoje) e por um consumer Kafka
  (Módulo 2). Se a regra estivesse no endpoint, você duplicaria.
- Testes do domínio rodam em milissegundos, sem subir nada (lição 1.10).
- Quando trocar memória por Postgres (Módulo 3), o domínio não muda uma linha.

> Para um projeto deste tamanho, as camadas são **pastas** num projeto só. Separar em projetos
> diferentes (`OrderFlow.Domain.csproj` etc.) só se paga quando vários serviços compartilham o
> mesmo domínio ou o time é grande. Saber **quando não** separar também é decisão de sênior.

## O agregado `Order`

Abra `Domain/Order.cs` e repare em quatro decisões:

### 1. Construtor privado + método de fábrica

```csharp
private Order(...) { ... }
public static Order Create(string customerId, IEnumerable<OrderItem> items, int maxItems, TimeProvider clock)
```

Não existe `new Order()` fora da classe. A única porta de entrada é `Create`, que valida as
regras. Resultado: **é impossível existir um `Order` inválido** em memória. Compare com um objeto
JS onde qualquer um faz `pedido.status = "pago"`.

### 2. Estado muda só por métodos com nome de negócio

`Status { get; private set; }`: ninguém de fora altera. Para mudar, chama `Cancel()` ou
`MarkAsPaid()`, que conferem se a transição é permitida:

```
Pending ──MarkAsPaid──▶ Paid
   │
   └──Cancel─────────▶ Cancelled
```

`Paid → Cancel` lança `DomainException` com `DomainErrorType.Conflict`.

### 3. Idempotência no próprio domínio

```csharp
case OrderStatus.Paid:
    return; // idempotente
```

Chamar `MarkAsPaid` num pedido já pago **não é erro, só não faz nada**. Por quê? Porque no Kafka a
entrega padrão é *at-least-once*: o mesmo evento de pagamento pode chegar duas vezes (rebalance,
retry do producer, reprocessamento). Um domínio que explode na segunda entrega gera incidente.
Você vai ouvir muito essa palavra no Módulo 3.

### 4. Eventos de domínio

Cada mudança registra um fato em `_events` (`OrderCreated`, `OrderPaid`, `OrderCancelled`).
O domínio **não publica nada**: só anota "isso aconteceu". Quem publica é o serviço de aplicação.
Isso permite, no Módulo 3, gravar os eventos na tabela outbox na mesma transação do pedido.

Eventos são `record` (imutáveis) com nome no passado. O `OrderId` vai ser a **chave da mensagem no
Kafka**: mesma chave, mesma partição, ordem garantida para aquele pedido.

## `TimeProvider` em vez de `DateTime.Now`

```csharp
order.Cancel(reason, clock);   // e não DateTime.UtcNow lá dentro
```

`TimeProvider` (do próprio .NET 8+) é um relógio injetável. Nos testes, você passa um relógio
falso e controla o tempo (`tests/.../FakeClock.cs`). Código que chama `DateTime.Now` direto é
difícil de testar e é apontado em code review.

## `Guid.CreateVersion7()`

O id do pedido é um UUID **versão 7**, que começa com o timestamp. Ids gerados em sequência ficam
ordenados, o que é muito melhor para índice de banco (Módulo 3) do que o `Guid.NewGuid()` (v4,
aleatório), que espalha inserções pelo índice inteiro.

## Duas validações, dois lugares

| Tipo | Exemplo | Onde mora | Resposta HTTP |
|---|---|---|---|
| Formato | SKU com 3 a 32 caracteres, quantidade entre 1 e 1000 | DTO (`Api/Contracts.cs`) | 400 |
| Regra de negócio | SKU repetido no pedido; pedido pago não cancela | Domínio | 422 / 409 |

Regra de negócio fica no domínio porque precisa valer para **qualquer** entrada (HTTP, Kafka,
script de migração). Formato fica na borda porque depende do contrato daquela entrada.

Próxima: [1.4 Program.cs, injeção de dependência e tempos de vida](04-program-e-di.md)
