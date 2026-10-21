# 1.9 Health checks e logging estruturado

Arquivos: `Infrastructure/EventQueueHealthCheck.cs`, `Program.cs`, os métodos `[LoggerMessage]`

## Liveness vs Readiness

O Kubernetes pergunta duas coisas diferentes para cada pod, e você já deixa os endpoints prontos:

| Probe | Pergunta | Se falhar, o Kubernetes... | Endpoint |
|---|---|---|---|
| **Liveness** | "O processo travou?" | **reinicia** o container | `/health/live` |
| **Readiness** | "Pode receber tráfego agora?" | **tira o pod do balanceamento**, sem reiniciar | `/health/ready` |

```csharp
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });
```

`Predicate = _ => false` significa "não rode nenhum check": se o processo respondeu HTTP, está vivo.

### O erro que derruba produção

Colocar banco ou Kafka na **liveness**. O Kafka fica lento por 20 segundos, a liveness de
**todos** os pods falha ao mesmo tempo, o Kubernetes reinicia **todos**, e uma lentidão
passageira vira indisponibilidade total (com tempestade de reconexões quando eles voltam).
Dependência externa vai, no máximo, na **readiness**, e mesmo assim com cuidado.

### O check de fila

`EventQueueHealthCheck` olha quantos eventos estão esperando no Channel:

- abaixo de 70% → `Healthy`
- 70% a 90% → `Degraded` (ainda responde 200, mas sinaliza no corpo)
- acima de 90% → `Unhealthy` (503): este pod para de receber pedidos novos até o worker esvaziar a fila

É backpressure no nível do cluster: o pod sobrecarregado sai do balanceamento sozinho.

## Logging estruturado

Compare:

```csharp
// ❌ string montada: vira texto solto
logger.LogInformation($"Pedido {order.Id} criado com total {order.Total}");

// ✅ source generator: campos estruturados
[LoggerMessage(Level = LogLevel.Information, Message = "Pedido {OrderId} criado para o cliente {CustomerId} com total {Total}")]
private partial void LogOrderCreated(Guid orderId, string customerId, decimal total);
```

Diferenças:

1. **Campos pesquisáveis.** Em produção os logs vão para JSON (Application Insights, Loki,
   Elastic). Com a versão estruturada, `OrderId` é um **campo**: você filtra
   `OrderId = "01a150ba..."` e vê a vida inteira do pedido. Com a string interpolada, só sobra
   busca por texto.
2. **Desempenho.** A string interpolada é montada **mesmo se o nível Information estiver
   desligado**. O método gerado checa o nível antes e não aloca nada. Em um consumer Kafka
   processando milhares de mensagens por segundo, isso aparece no gráfico de CPU e de GC.

O analisador **CA1873**, ligado pelo `AnalysisLevel` do projeto, barra a versão com
interpolação no build. Foi exatamente o que aconteceu durante a criação deste módulo, no worker.

### O que nunca vai para o log

Senha, token, número de cartão, CPF completo. Lembre que o log fica guardado por meses e muita
gente tem acesso. Logue o `CustomerId`, não o e-mail do cliente.

### Níveis, na prática

| Nível | Quando | Exemplo no OrderFlow |
|---|---|---|
| `Error` | algo quebrou e precisa de humano | exceção não tratada, falha no worker |
| `Warning` | anormal mas o sistema se recuperou | evento desconhecido ignorado |
| `Information` | fatos de negócio | pedido criado, replay de idempotência |
| `Debug` | detalhes para investigar, desligado em produção | |

Regra de bolso: regra de negócio violada (cliente tentou cancelar pedido pago) é `Information`,
não `Error`. Se cada 409 virar `Error`, o alerta toca toda hora e o time aprende a ignorá-lo.

Próxima: [1.10 Testes](10-testes.md)
