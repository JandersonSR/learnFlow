# .NET 10 × Spring Boot 4: tabela de equivalências

Uma página para revisar antes de entrevista. Cada linha tem o mesmo conceito nas duas stacks, como
foi usado no OrderFlow.

## Projeto e build

| Conceito | .NET 10 | Java 25 + Spring Boot 4 |
|---|---|---|
| Arquivo de projeto | `.csproj` | `pom.xml` (Maven) ou `build.gradle.kts` |
| Versões centralizadas | `Directory.Packages.props` | `spring-boot-starter-parent` (BOM) |
| Repositório de pacotes | NuGet | Maven Central |
| Ponto de entrada | `Program.cs` | classe com `@SpringBootApplication` + `main` |
| Servidor web embutido | Kestrel | Tomcat (padrão), Jetty |
| Artefato de deploy | pasta publicada / imagem | fat jar `java -jar` / imagem |

## Injeção de dependência

| Conceito | .NET | Spring |
|---|---|---|
| Registrar | `builder.Services.AddScoped<I, Impl>()` | `@Bean` em `@Configuration` ou `@Component`/`@Service` |
| Escopo padrão na prática | **Scoped** | **Singleton** |
| Um por requisição | `AddScoped` | `@RequestScope` |
| Novo a cada injeção | `AddTransient` | `@Scope("prototype")` |
| Validação do grafo na subida | só em Development | sempre (falha se faltar bean) |
| Ciclo de vida de serviço em segundo plano | `BackgroundService` / `IHostedService` | `initMethod`/`destroyMethod`, `@PostConstruct`/`@PreDestroy`, `SmartLifecycle` |

## Configuração

| Conceito | .NET | Spring |
|---|---|---|
| Arquivo | `appsettings.json` | `application.yml` |
| Ambiente | `ASPNETCORE_ENVIRONMENT` | `SPRING_PROFILES_ACTIVE` |
| Configuração tipada | `IOptions<T>` + `BindConfiguration` | `@ConfigurationProperties` (record) |
| Falhar na subida se inválida | `ValidateDataAnnotations().ValidateOnStart()` | `@Validated` |
| Variável de ambiente | `Orders__MaxItemsPerOrder` | `PAYMENTS_APPROVALLIMIT` |

## Web

| Conceito | .NET | Spring |
|---|---|---|
| Estilo moderno | Minimal APIs | `@RestController` (Spring MVC) |
| Validação de entrada | DataAnnotations + `AddValidation()` (automática) | Bean Validation + **`@Valid` no parâmetro** |
| Formato de erro | `ProblemDetails` + `IExceptionHandler` | `ProblemDetail` + `@RestControllerAdvice` |
| Retorno tipado | `Results<Created<T>, Ok<T>>` | `ResponseEntity<T>` |

## Concorrência

| Conceito | .NET | Java |
|---|---|---|
| I/O sem segurar thread | `async/await` | threads virtuais |
| Cancelamento | `CancellationToken` | `Thread.interrupt()` + `InterruptedException` |
| Fila produtor/consumidor | `Channel<T>` (bounded) | `BlockingQueue<T>` (`ArrayBlockingQueue`) |
| Mapa concorrente | `ConcurrentDictionary.GetOrAdd` | `ConcurrentHashMap.putIfAbsent` |
| Visibilidade entre threads | `volatile` / `Interlocked` | `volatile` / `AtomicInteger` |
| Contexto por fluxo | `AsyncLocal<T>` | `ScopedValue` (Java 25) |

## Linguagem

| Conceito | C# | Java |
|---|---|---|
| Dinheiro | `decimal` (operadores) | `BigDecimal` (métodos, `compareTo`) |
| Null | nullable reference types (compilador) | `Optional`, JSpecify `@Nullable` (ferramentas) |
| União fechada | `interface` + `switch` de tipos | `sealed interface` + `record` + `switch` exaustivo |
| Relógio injetável | `TimeProvider` | `java.time.Clock` |
| UUID v7 | `Guid.CreateVersion7()` | biblioteca ou implementação própria |
| Logging | `ILogger<T>` + `[LoggerMessage]` | SLF4J + `{}` |

## Testes

| Conceito | .NET | Java |
|---|---|---|
| Framework | xUnit | JUnit 5 |
| Asserções fluentes | (xUnit `Assert`) | AssertJ |
| API inteira em teste | `WebApplicationFactory<Program>` | `@SpringBootTest` |
| Mocks | Moq / NSubstitute | Mockito |
| Banco real descartável | Testcontainers for .NET | Testcontainers (original) |
