# 1.4 Program.cs, injeção de dependência e tempos de vida

Arquivo: `src/OrderFlow.Orders.Api/Program.cs`

## As duas fases

```csharp
var builder = WebApplication.CreateBuilder(args);
// FASE 1: registrar serviços (builder.Services.Add...)
var app = builder.Build();
// FASE 2: montar o pipeline (app.Use...) e as rotas (app.Map...)
await app.RunAsync();
```

No Express você faz tudo na fase 2 e cria dependências com `new` ou `require`. No ASP.NET, a fase
1 diz ao **container de DI** como construir cada coisa; depois, quando um endpoint pede um
`OrderService`, o container monta ele com todas as dependências (repositório, publisher, opções,
relógio, logger) automaticamente.

## Os três tempos de vida

| Tempo de vida | Uma instância por... | Use para | No OrderFlow |
|---|---|---|---|
| **Singleton** | aplicação inteira | coisas caras ou com estado compartilhado, **thread-safe** | repositório em memória, Channel, `TimeProvider`, (Módulo 2) producer Kafka |
| **Scoped** | requisição HTTP | serviços de aplicação, `DbContext` | `OrderService` |
| **Transient** | cada vez que alguém pede | objetos leves e sem estado | (nenhum ainda) |

### O erro clássico: dependência cativa

Um **singleton que recebe um scoped** "prende" a instância scoped para sempre. Com `DbContext`
(Módulo 3), isso significa um único contexto compartilhado entre todas as requisições, em
threads diferentes: dados corrompidos e exceções aleatórias.

Faça o teste agora. No fim do `Program.cs`, crie um singleton que recebe o `OrderService` (scoped):

```csharp
internal sealed class RelatorioCache(OrderService service)
{
    public OrderService Service { get; } = service;
}
```

E registre logo abaixo do `AddScoped<OrderService>()`:

```csharp
builder.Services.AddSingleton<RelatorioCache>();
```

Agora rode nos dois ambientes:

```bash
# Development (o padrão do dotnet run com launchSettings): NÃO SOBE
dotnet run --project src/OrderFlow.Orders.Api
#   InvalidOperationException: Cannot consume scoped service 'OrderFlow.Orders.Api.Application.OrderService'
#   from singleton 'RelatorioCache'.

# Production: SOBE NORMALMENTE, com o bug escondido
ASPNETCORE_ENVIRONMENT=Production dotnet run --project src/OrderFlow.Orders.Api --no-launch-profile
```

Em Development, o host liga a **validação de escopos e do grafo de dependências** na subida. Em
Production essa checagem fica desligada por desempenho, e o bug vai para o ar. Lição: rode
local sempre em Development, e trate esse erro como bug, nunca "desligue a validação".

Desfaça a mudança antes de seguir.

### Regra prática

Uma dependência só pode ter tempo de vida **igual ou maior** que quem a recebe:
singleton ← singleton; scoped ← scoped ou singleton; transient ← qualquer um.

## Registrando por interface

```csharp
builder.Services.AddSingleton<IOrderRepository, InMemoryOrderRepository>();
```

O serviço pede `IOrderRepository`; o container entrega `InMemoryOrderRepository`. No Módulo 3,
essa linha vira `AddScoped<IOrderRepository, EfOrderRepository>()` e **nada mais muda**. Essa é a
resposta para "por que usar DI?" numa entrevista: trocar implementação sem tocar em quem usa,
e substituir por dublês nos testes.

## Fábrica: quando o registro precisa de lógica

```csharp
builder.Services.AddSingleton(sp =>
{
    var capacity = sp.GetRequiredService<IOptions<OrdersOptions>>().Value.EventQueueCapacity;
    return Channel.CreateBounded<IOrderEvent>(...);
});
```

O `sp` (service provider) deixa você pedir outros serviços para montar este. Aqui, a capacidade
do Channel vem da configuração.

## A ordem do pipeline

```csharp
app.UseExceptionHandler();   // 1º: envolve tudo que vem depois
app.UseStatusCodePages();    // 404/405 vazios ganham corpo ProblemDetails
app.MapHealthChecks(...);
app.MapOrderEndpoints();
```

Middlewares (`app.Use...`) formam uma "cebola": a requisição entra pelo primeiro e a resposta
sai por ele. **Um middleware só captura exceções do que vem depois dele.** Por isso o
`UseExceptionHandler` vai primeiro. No Express o error handler vai **no fim**; aqui vai **no
começo**, porque o modelo é de envelopamento.

Uma pegadinha que confunde muita gente: os **endpoints** (`app.Map...`) não seguem essa ordem.
O `WebApplication` adiciona o roteamento no começo e executa os endpoints **sempre no fim do
pipeline**, não importa em que linha você chamou `MapOrderEndpoints()`. A ordem que importa é
entre os `Use...`.

Prove para você mesmo. Adicione este middleware **antes** do `UseExceptionHandler`:

```csharp
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Headers.ContainsKey("X-Boom")) throw new InvalidOperationException("boom");
    await next(ctx);
});
```

```bash
curl -i -H 'X-Boom: 1' http://localhost:5279/orders
# 500 sem corpo nenhum: o exception handler ainda não estava "em volta" do middleware
```

Agora mova o mesmo bloco para **depois** do `UseStatusCodePages()` e repita: a resposta vira um
500 com `Content-Type: application/problem+json` e o corpo padronizado. No Módulo 6 você vai usar
essa mesma regra com `UseAuthentication()` antes de `UseAuthorization()`.

## `public partial class Program;`

A última linha do `Program.cs` torna a classe gerada visível para o
`WebApplicationFactory<Program>` dos testes de integração (lição 1.10).

Próxima: [1.5 Configuração e Options pattern](05-configuracao.md)
