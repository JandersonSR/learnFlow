# 1J.5 Configuração tipada e perfis

Arquivos: `config/PaymentsProperties.java`, `src/main/resources/application.yml`

## De onde vem a configuração

Mesma ideia do .NET (lição 1.5), com nomes diferentes. O último vence:

```
application.yml
  → application-{perfil}.yml        (perfil ativo: SPRING_PROFILES_ACTIVE=dev)
    → variáveis de ambiente          ← como o Kubernetes configura o pod
      → argumentos (--payments.approval-limit=100)
```

| .NET | Spring |
|---|---|
| `appsettings.json` | `application.yml` (ou `application.properties`) |
| `ASPNETCORE_ENVIRONMENT=Development` | `SPRING_PROFILES_ACTIVE=dev` |
| `Orders__MaxItemsPerOrder=50` | `PAYMENTS_APPROVALLIMIT=50` |
| `dotnet user-secrets` | variável de ambiente ou um `application-local.yml` fora do git |

## Relaxed binding: como a variável de ambiente vira propriedade

A chave `payments.approval-limit` vira variável de ambiente assim: troque `.` por `_`, **remova os
hífens** e use maiúsculas.

```bash
PAYMENTS_APPROVALLIMIT=100 ./mvnw spring-boot:run
# agora um pagamento de 150.00 é recusado com limit_exceeded
```

No Windows (PowerShell): `$env:PAYMENTS_APPROVALLIMIT = "100"; .\mvnw.cmd spring-boot:run`

## `@ConfigurationProperties` + `@Validated`: o Options pattern do Spring

```java
@Validated
@ConfigurationProperties(prefix = "payments")
public record PaymentsProperties(
        @NotNull @DecimalMin("1.00") @DefaultValue("5000.00") BigDecimal approvalLimit,
        @Min(10) @Max(100_000)       @DefaultValue("1000")    int eventQueueCapacity,
        @NotNull                     @DefaultValue("10s")     Duration workerShutdownTimeout) {
}
```

- Record = configuração **imutável** depois da subida.
- `@DefaultValue` vale quando a chave não aparece em lugar nenhum.
- `Duration` entende `10s`, `500ms`, `2m` direto do YAML.
- `@Validated` faz a validação **na subida**. Teste:

```bash
PAYMENTS_EVENTQUEUECAPACITY=1 ./mvnw spring-boot:run
```

A aplicação **não sobe**, com uma mensagem parecida com:

```
Binding to target ... PaymentsProperties failed:
    Property: payments.event-queue-capacity
    Value: "1"
    Reason: must be greater than or equal to 10
```

Mesmo argumento do `ValidateOnStart` do .NET: no Kubernetes o pod entra em `CrashLoopBackOff`, o
rollout para e os pods antigos continuam atendendo.

Evite `@Value("${payments.approval-limit}")` espalhado pelo código: sem tipo, sem validação, sem
lugar central. É o `configuration["Orders:MaxItemsPerOrder"]` do Spring.

## O `application.yml` deste serviço

Leia os comentários do arquivo. Três chaves merecem atenção agora:

- `spring.threads.virtual.enabled: true` → lição 1J.7.
- `spring.lifecycle.timeout-per-shutdown-phase: 20s` → quanto tempo o Spring espera as requisições em
  andamento terminarem no desligamento. Precisa ser **menor** que o
  `terminationGracePeriodSeconds` do Kubernetes (30 s por padrão), senão o SIGKILL chega antes.
- `management.endpoint.health.group.readiness.include` → lição 1J.8.

Próxima: [1J.6 REST, Bean Validation e ProblemDetail](06-rest-validacao-problemdetail.md)
