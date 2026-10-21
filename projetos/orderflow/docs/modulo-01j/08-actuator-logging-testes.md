# 1J.8 Actuator, logging e testes

Arquivos: `config/PaymentEventQueueHealthIndicator.java`, `application.yml`, `src/test/`

## Actuator: liveness e readiness

O **Spring Boot Actuator** expõe endpoints operacionais. No Boot 4, as probes do Kubernetes já vêm
ligadas por padrão:

| Endpoint | Equivale a | O que verifica aqui |
|---|---|---|
| `/actuator/health/liveness` | `/health/live` do Orders | só o estado interno do Spring (`livenessState`) |
| `/actuator/health/readiness` | `/health/ready` do Orders | `readinessState` + a nossa fila (`paymentEventQueue`) |

```yaml
management:
  endpoint:
    health:
      group:
        readiness:
          include: readinessState,paymentEventQueue
```

O nome `paymentEventQueue` vem do nome do bean `PaymentEventQueueHealthIndicator` sem o sufixo
`HealthIndicator`. Fila acima de 90% → `DOWN` → readiness devolve **503** → o Kubernetes tira o pod do
balanceamento, sem reiniciá-lo. A regra da lição 1.9 vale igual: **nada externo na liveness**.

Um bônus do Spring: durante o desligamento gracioso, o próprio Boot muda o readiness para
`REFUSING_TRAFFIC`, então o Kubernetes para de mandar requisições novas enquanto as atuais terminam.

**Mudança do Boot 4 que pega quem segue tutorial antigo:** as classes de health mudaram de pacote,
de `org.springframework.boot.actuate.health` para `org.springframework.boot.health.contributor`.

## Logging com SLF4J

```java
private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

log.info("Pagamento {} do pedido {} registrado com status {}", payment.id(), payment.orderId(), payment.status());
log.error("Falha ao processar {} do pedido {}", event.getClass().getSimpleName(), event.orderId(), e);
```

- **SLF4J** é a API (o `ILogger<T>`); **Logback** é a implementação que o Spring Boot traz.
- **`{}` em vez de concatenação**: a string só é montada se o nível estiver ligado. Mesma lição do
  `[LoggerMessage]` e do analisador CA1873 no .NET. `log.info("Pagamento " + id)` em code review é
  pedido de mudança.
- **Exceção como último argumento** sem `{}` correspondente: o SLF4J imprime o stack trace inteiro.
- Para logs **estruturados em JSON** (Loki, Elastic, Application Insights), o Boot tem suporte nativo:
  `logging.structured.format.console: ecs` (ou `logstash`). Você liga isso no Módulo 7.

## Testes

```bash
./mvnw test
```

| Teste | Tipo | Sobe o Spring? |
|---|---|---|
| `domain/PaymentTest` | unidade | não (milissegundos) |
| `application/PaymentServiceTest` | unidade, com concorrência real | não |
| `api/PaymentApiIntegrationTest` | integração HTTP | sim, Tomcat numa porta aleatória |

### Unidade sem mocks

Como o `PaymentService` é Java puro, o teste monta tudo com `new` e usa uma lambda como publicador:

```java
private final List<PaymentEvent> published = new ArrayList<>();
new PaymentService(new InMemoryPaymentRepository(), new FakePaymentGateway(...), published::add, Clock.systemUTC());
```

Isso funciona porque `PaymentEventPublisher` tem um único método (é uma **interface funcional**).
Mockito existe e vem no starter de teste, mas implementação em memória costuma dar testes mais
legíveis e menos frágeis que `when(...).thenReturn(...)` encadeado.

### O teste de concorrência e a pegadinha do `Future`

```java
for (Future<?> future : futures) {
    future.get();   // relança a exceção que aconteceu DENTRO da thread
}
```

Sem esse laço, uma thread que lançou exceção some em silêncio e o teste passa com bug. A primeira
versão deste teste não tinha o laço. Em teste concorrente, sempre pergunte: "se uma das threads
falhar, o teste fica vermelho?".

### Integração: por que `HttpClient` do JDK e não `TestRestTemplate`

O Spring Boot 4 mudou o pacote do `TestRestTemplate` e deixou de configurar o `MockMvc`
automaticamente no `@SpringBootTest` (agora exige `@AutoConfigureMockMvc`). Tutoriais do Boot 3
quebram. O teste deste módulo usa o `java.net.http.HttpClient` do próprio JDK e
`@Value("${local.server.port}")`, que não mudam entre versões. No Exercício 5 você reescreve com o
`RestTestClient`, a ferramenta nova do Spring Framework 7, e compara.

### O contexto é compartilhado

O Spring guarda o contexto em cache entre classes de teste com a mesma configuração (sobe uma vez só).
Como o repositório em memória é singleton, os testes compartilham dados: cada um usa `orderId` e
`Idempotency-Key` próprios. No Módulo 3, com Postgres, entra o **Testcontainers** (que nasceu no mundo
Java).

Próximo: [.NET × Spring: tabela de equivalências](dotnet-vs-spring.md)
