# 1.2 C# para quem vem de TypeScript

Folha de consulta. Volte aqui sempre que travar na sintaxe. Todos os trechos compilam no .NET 10.

## A diferença que mais importa: tipos existem em tempo de execução

No TypeScript, os tipos somem depois do build: em runtime é tudo JavaScript, e um JSON mal
formado passa pelo `as Pedido` sem reclamar. No C#, **o tipo existe em runtime**. Se o JSON não
encaixa no record, a desserialização falha na hora. Isso muda como você pensa validação: o
formato básico já é garantido pelo tipo; você valida só regras (tamanho, faixa, padrão).

## Tabela de tradução

| TypeScript | C# |
|---|---|
| `const x = 10` | `var x = 10;` (tipo inferido) ou `const int X = 10;` (constante de compilação) |
| `let nome: string \| null` | `string? nome;` |
| `interface Pedido { id: string }` (forma de dados) | `record Pedido(string Id);` |
| `interface Repositorio { get(): Promise<X> }` (contrato) | `interface IRepositorio { Task<X> GetAsync(); }` |
| `Promise<T>` | `Task<T>` (ou `ValueTask<T>` em caminhos muito quentes) |
| `async/await` | `async/await` (igual, mas a convenção é sufixo `Async` no nome) |
| `AbortSignal` | `CancellationToken` |
| `arr.map(f)` | `list.Select(f)` |
| `arr.filter(f)` | `list.Where(f)` |
| `arr.find(f)` | `list.FirstOrDefault(f)` |
| `arr.some(f)` / `arr.every(f)` | `list.Any(f)` / `list.All(f)` |
| `arr.reduce((a, b) => a + b.preco, 0)` | `list.Sum(x => x.Preco)` |
| `[...a, ...b]` | `[.. a, .. b]` (collection expression) |
| `x ?? y`, `x?.y` | igual: `x ?? y`, `x?.y` |
| `type Evento = Criado \| Pago` + `switch (e.kind)` | `interface IEvento` + `switch (e) { case Criado c: ... }` |
| `Map<string, X>` | `Dictionary<string, X>` (ou `ConcurrentDictionary` entre threads) |
| `throw new Error()` | `throw new InvalidOperationException()` (use exceções específicas) |
| template string `` `Olá ${nome}` `` | `$"Olá {nome}"` |

## Records: o tipo que você mais vai usar

```csharp
public sealed record OrderItem(string Sku, int Quantity, decimal UnitPrice)
{
    public decimal Subtotal => Quantity * UnitPrice; // propriedade calculada
}

var a = new OrderItem("AAA", 1, 10m);
var b = new OrderItem("AAA", 1, 10m);
Console.WriteLine(a == b);            // True: igualdade por VALOR, não por referência
var c = a with { Quantity = 5 };      // cópia com alteração (como {...a, quantity: 5})
```

Use `record` para DTOs, eventos e value objects. Use `class` para entidades com identidade e
estado que muda (como `Order`).

## `decimal` para dinheiro

```csharp
Console.WriteLine(0.1 + 0.2);      // 0.30000000000000004 (double, igual ao JS)
Console.WriteLine(0.1m + 0.2m);    // 0.3 (decimal, base 10, exato)
```

O sufixo `m` indica literal `decimal`. Em entrevista, "por que decimal para dinheiro?" é pergunta
certa.

## Nullable: o compilador como revisor

```csharp
string nome = null;      // warning (vira erro no nosso projeto): string não aceita null
string? apelido = null;  // ok
int tamanho = apelido.Length;          // warning: apelido pode ser null
int tamanhoSeguro = apelido?.Length ?? 0;

if (apelido is not null)
{
    Console.WriteLine(apelido.Length); // ok: o compilador sabe que aqui não é null
}
```

## Pattern matching

```csharp
// switch expression com padrões relacionais (usado no EventQueueHealthCheck)
string Classificar(double uso) => uso switch
{
    >= 0.9 => "crítico",
    >= 0.7 => "atenção",
    _ => "ok",
};

// padrão de tipo (usado no OrderEventsWorker)
string Descrever(IOrderEvent e) => e switch
{
    OrderCreated c => $"criado, total {c.Total}",
    OrderPaid p => $"pago, pagamento {p.PaymentId}",
    _ => "desconhecido",
};

// padrão de propriedade
bool EhGrande(Order o) => o is { Status: OrderStatus.Pending, Total: > 1000m };
```

## Primary constructors (injeção de dependência sem cerimônia)

TypeScript/Nest:

```ts
class OrderService {
  constructor(private readonly repo: OrderRepository) {}
}
```

C# 12+:

```csharp
public sealed class OrderService(IOrderRepository repository)
{
    public Task<Order?> GetAsync(Guid id, CancellationToken ct) => repository.GetAsync(id, ct);
}
```

O parâmetro `repository` fica visível na classe inteira. Diferença sutil: ele **não é** `readonly`.
Por convenção, nunca reatribua um parâmetro de primary constructor.

## async/await: as diferenças que mordem

1. **Não existe event loop único.** O ASP.NET atende requisições em várias threads do thread pool
   ao mesmo tempo. Estado compartilhado (um singleton com dicionário) precisa ser thread-safe.
   No Node você nunca pensou nisso; aqui é obrigatório (lição 1.8).
2. **Nunca use `.Result` ou `.Wait()`** num `Task`. Bloqueia uma thread do pool; sob carga, o pool
   esgota e a API inteira trava ("thread pool starvation"). É async de ponta a ponta.
3. **Repasse o `CancellationToken`** até o fim da cadeia. Se o cliente desiste da requisição ou o
   pod recebe SIGTERM, o token cancela e você para de gastar banco e CPU à toa.
4. **`async void` só em event handlers.** Em qualquer outro lugar, retorne `Task`; exceção em
   `async void` derruba o processo.

## LINQ é preguiçoso

```csharp
var query = pedidos.Where(p => p.Total > 100);  // NADA executou ainda
var lista = query.ToList();                      // agora executa
var total = query.Count();                       // executa DE NOVO (percorre outra vez)
```

Com EF Core (Módulo 3), o mesmo LINQ vira SQL. Entender quando a query executa evita o problema
N+1 e consultas duplicadas.

## Novidades do C# 14 (vem com o .NET 10) que você vai ver por aí

- **`field`** dentro de propriedades: acessa o campo gerado sem declarar um manualmente.
  `public string Nome { get; set => field = value.Trim(); }`
- **Atribuição condicional a null**: `cliente?.Endereco = novo;` (só atribui se `cliente` não for null).
- **Extension members**: blocos `extension` que permitem propriedades de extensão, não só métodos.

Não precisa decorar; reconheça quando aparecer num code review.

Próxima: [1.3 O domínio](03-dominio.md)
