# 1.6 Minimal APIs, validação e Problem Details

Arquivos: `Api/OrderEndpoints.cs`, `Api/Contracts.cs`, `Api/GlobalExceptionHandler.cs`

## Minimal APIs vs Controllers

O ASP.NET tem dois estilos: **Controllers** (classes com atributos `[HttpGet]`, o estilo clássico
que você vai encontrar em muito código legado) e **Minimal APIs** (funções mapeadas em rotas, como
no Express). Desde o .NET 8 as Minimal APIs fazem praticamente tudo, e são o padrão em projetos novos
e em microsserviços. Saiba ler os dois; escreva Minimal APIs.

## Organizando por recurso

```csharp
var orders = app.MapGroup("/orders").WithTags("Orders");
orders.MapPost("/", CreateAsync);
orders.MapGet("/{id:guid}", GetAsync);
```

`MapGroup` é o `express.Router()`. O `:guid` na rota é uma **restrição**: `/orders/abc` nem
chega no handler, devolve 404. Os handlers são métodos estáticos com nome, e não lambdas
gigantes no `Program.cs`, para que o arquivo continue legível com 30 endpoints.

## De onde vem cada parâmetro (binding)

```csharp
private static async Task<...> CreateAsync(
    CreateOrderRequest request,                                   // corpo JSON
    [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,// header
    OrderService service,                                         // DI
    CancellationToken ct)                                         // cancelado se o cliente desistir
```

E em `ListAsync`, `OrderStatus? status = null, int page = 1` vêm da query string, com valores
padrão. Um `status=Pagoo` inválido devolve 400 sozinho.

## `TypedResults` e `Results<A, B>`

```csharp
Task<Results<Created<OrderResponse>, Ok<OrderResponse>>> CreateAsync(...)
```

O tipo de retorno declara **todas as respostas possíveis**. Vantagens: o compilador reclama se
você devolver algo fora da lista; os testes conseguem inspecionar o resultado; e, quando você
adicionar OpenAPI (exercício), a documentação sai correta sem anotações extras.

## Validação nativa do .NET 10

```csharp
builder.Services.AddValidation();
```

```csharp
public sealed record CreateOrderItemRequest(
    [Required, RegularExpression("^[A-Z0-9-]{3,32}$")] string Sku,
    [Range(1, 1_000)] int Quantity,
    [Range(0.01, 1_000_000)] decimal UnitPrice);
```

A partir do .NET 10, Minimal APIs validam DataAnnotations automaticamente, **inclusive em objetos
e listas aninhadas**. Antes você precisava de FluentValidation ou de código manual. Veja a
resposta para um payload inválido:

```json
{
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "CustomerId": ["The field CustomerId must be a string with a minimum length of 3 and a maximum length of 64."],
    "Items[0].Sku": ["SKU deve ter 3 a 32 caracteres: A-Z, 0-9 ou hífen."],
    "Items[0].Quantity": ["The field Quantity must be between 1 and 1000."]
  }
}
```

Repare no `Items[0].Quantity`: o caminho exato do campo, pronto para o front destacar.

> FluentValidation continua útil para regras que dependem de outros campos ou de consulta ao
> banco. Para formato, o nativo resolve e é uma dependência a menos.

## Problem Details (RFC 9457): um formato de erro para tudo

Todo erro da API sai no mesmo formato, com `Content-Type: application/problem+json`:

| Situação | Quem gera | Status |
|---|---|---|
| JSON mal formado ou campo inválido | framework (validação/binding) | 400 |
| Rota com id inexistente | endpoint (`TypedResults.NotFound()`) + `UseStatusCodePages` | 404 |
| Regra de negócio (`DomainErrorType.Rule`) | `GlobalExceptionHandler` | 422 |
| Conflito de estado (`DomainErrorType.Conflict`) | `GlobalExceptionHandler` | 409 |
| Qualquer outra exceção | `GlobalExceptionHandler` | 500 (sem detalhes internos) |

Exemplo de 409:

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.10",
  "title": "Regra de negócio violada",
  "status": 409,
  "detail": "Pedido já pago não pode ser cancelado; solicite estorno.",
  "code": "order.already_paid",
  "traceId": "00-09cc114c...-00"
}
```

Dois campos fazem diferença em produção:

- **`code`**: estável e legível por máquina. O front faz `if (code === "order.already_paid")`
  em vez de comparar a mensagem, que pode mudar ou ser traduzida.
- **`traceId`**: o mesmo id que aparece nos logs e, no Módulo 7, no rastreamento distribuído.
  O suporte recebe o `traceId` do cliente e acha a requisição exata.

## Exceções vs Result pattern

Este módulo usa exceção para regra de negócio (`DomainException`) porque é simples e fica
centralizado num handler. A alternativa é o **Result pattern** (o método retorna
`Result<Order, Error>` em vez de lançar). É um debate clássico em entrevista sênior:

- **Exceção**: menos código, mas o fluxo de erro fica invisível na assinatura do método, e
  exceção tem custo de desempenho (irrelevante em CRUD, relevante em caminho muito quente).
- **Result**: o erro faz parte do tipo, o compilador força tratar; mais verboso em C#.

Não existe resposta certa; existe saber defender a escolha. O Exercício 6 pede para você
implementar uma versão com Result e comparar.

Próxima: [1.7 BackgroundService e Channels](07-background-e-channels.md)
