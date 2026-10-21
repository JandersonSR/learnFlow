# 1.7 BackgroundService e Channels: a ponte para o Kafka

Arquivos: `Infrastructure/ChannelOrderEventPublisher.cs`, `Infrastructure/OrderEventsWorker.cs`

## Por que um Channel antes do Kafka?

Kafka tem muito conceito novo ao mesmo tempo (broker, tópico, partição, offset, consumer group).
Se você aprender o **padrão produtor/consumidor** primeiro com uma ferramenta simples, no Módulo 2
só sobra aprender o Kafka em si. O código do worker vai mudar pouquíssimo.

```
OrderService ──PublishAsync──▶ [ Channel<IOrderEvent> ] ──ReadAllAsync──▶ OrderEventsWorker
   (produtor)                   fila em memória, limitada                    (consumidor)
```

| Channel (agora) | Kafka (Módulo 2) |
|---|---|
| `Writer.WriteAsync` | `producer.ProduceAsync` |
| `Reader.ReadAllAsync` em loop | `consumer.Consume` em loop |
| capacidade limitada + `Wait` | `buffer.memory` + `max.block.ms` |
| **some quando o pod reinicia** | durável, replicado, relido a partir de um offset |

A última linha é o motivo de existir o Módulo 2.

## Backpressure

```csharp
Channel.CreateBounded<IOrderEvent>(new BoundedChannelOptions(capacity)
{
    FullMode = BoundedChannelFullMode.Wait,
});
```

Se o consumidor ficar lento e a fila encher, o produtor **espera** em vez de crescer a memória
sem limite até o pod ser morto por OOM. Isso se chama *backpressure*: a lentidão de quem consome
freia quem produz. As alternativas (`DropOldest`, `DropNewest`) descartam mensagens; para
eventos de pedido, isso é inaceitável. Para métricas de telemetria, pode ser ok. **Escolher o
modo é decisão de negócio**, e é o tipo de pergunta que um staff faz num design review.

## BackgroundService

```csharp
internal sealed partial class OrderEventsWorker(...) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken) { ... }
}
```

Registrado com `AddHostedService<OrderEventsWorker>()`. O host chama `ExecuteAsync` na subida e
sinaliza `stoppingToken` no desligamento. É o equivalente a um worker que roda junto com o
servidor HTTP, mas com ciclo de vida gerenciado.

### Três cuidados que separam júnior de sênior

**1. `try/catch` por mensagem.**
Se uma exceção escapar do `ExecuteAsync`, o comportamento padrão desde o .NET 6
(`BackgroundServiceExceptionBehavior.StopHost`) é **derrubar a aplicação inteira**, API junto.
Por isso o catch fica **dentro** do loop: uma mensagem ruim é registrada e o loop segue. No
Módulo 3, esse catch manda a mensagem para retry e, depois, para um Dead Letter Topic.

**2. Respeitar o `stoppingToken` (desligamento gracioso).**
Quando o Kubernetes remove um pod, ele manda **SIGTERM**, espera o `terminationGracePeriodSeconds`
(30 s por padrão) e então manda SIGKILL. O host do .NET traduz o SIGTERM em cancelamento do
`stoppingToken` e espera os hosted services terminarem (até `HostOptions.ShutdownTimeout`,
também 30 s por padrão). Teste: rode a API, crie um pedido e aperte Ctrl+C. Você verá:

```
Application is shutting down...
Worker de eventos parado
```

**3. Saber o que se perde.**
Eventos ainda na fila no momento do desligamento **somem**. Com Channel não tem como evitar.
Com Kafka, o evento já está gravado no broker antes de você responder ao cliente, e o consumer
retoma do último offset confirmado. Guarde isso para a entrevista: "por que não fazer tudo em
memória com um BackgroundService?" → durabilidade, escala horizontal e reprocessamento.

## O dual write problem (spoiler do Módulo 3)

Olhe `OrderService.ChangeAsync`:

```csharp
await repository.UpdateAsync(order, ct);     // 1. salva
await PublishPendingEventsAsync(order, ct);  // 2. publica
```

Se o processo morrer **entre** 1 e 2, o pedido muda e o evento nunca sai. Se você inverter a ordem,
o evento sai e o pedido pode não ser salvo. Não existe ordem segura com duas operações em dois
sistemas diferentes. A solução padrão de mercado é o **Transactional Outbox**: gravar o evento numa
tabela do mesmo banco, na mesma transação, e publicar depois. É o coração do Módulo 3 e uma das
perguntas mais comuns em entrevista de sistemas distribuídos.

Próxima: [1.8 Concorrência e idempotência](08-concorrencia-e-idempotencia.md)
