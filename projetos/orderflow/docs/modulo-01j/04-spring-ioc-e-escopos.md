# 1J.4 Spring: IoC, beans e o escopo que muda tudo

Arquivos: `PaymentsApplication.java`, `config/PaymentsConfiguration.java`

## O container é o mesmo conceito

O Spring nasceu em 2003 justamente como um container de injeção de dependência; a DI do ASP.NET Core
veio bem depois, com as mesmas ideias. Vocabulário:

| .NET | Spring |
|---|---|
| serviço registrado | **bean** |
| `IServiceCollection` / `IServiceProvider` | `ApplicationContext` |
| `builder.Services.AddSingleton<I, Impl>()` | método `@Bean` numa classe `@Configuration`, **ou** `@Component` na classe |
| injeção por construtor | injeção por construtor (com um construtor só, nem precisa de `@Autowired`) |

## Duas formas de registrar

**Por varredura (component scan)**, a mais comum no mercado:

```java
@Service
public class PaymentService { ... }   // o Spring acha sozinho porque está abaixo do pacote do main
```

**Explícita, com `@Bean`**, a que usamos para domínio, aplicação e infraestrutura:

```java
@Configuration(proxyBeanMethods = false)
public class PaymentsConfiguration {
    @Bean
    PaymentService paymentService(PaymentRepository repository, PaymentGateway gateway,
                                  PaymentEventPublisher publisher, Clock clock) {
        return new PaymentService(repository, gateway, publisher, clock);
    }
}
```

Usamos `@Component`/`@RestController` só onde a classe já é Spring por natureza (controller, handler
de erro, health indicator). Por quê: o `PaymentService` fica Java puro, e o teste dele é um `new`.
O custo é um arquivo de fiação a mais. Times grandes discordam sobre isso; o Exercício 6 pede um ADR.

`proxyBeanMethods = false`: diz ao Spring que não precisa criar um proxy da classe de configuração
(o proxy só serve quando um método `@Bean` chama outro diretamente; aqui as dependências chegam
pelos parâmetros). Sobe mais rápido. É o padrão recomendado em configuração nova.

## ⚠️ O escopo padrão é SINGLETON

Esta é **a** diferença que pega devs .NET:

| | .NET | Spring |
|---|---|---|
| Escopo que você costuma usar em serviço de aplicação | **Scoped** (um por requisição) | **Singleton** (um para a aplicação, o padrão) |
| Um por requisição | `AddScoped` | `@RequestScope` (raro) |
| Novo a cada injeção | `AddTransient` | `@Scope("prototype")` (raro) |

Consequência: **no Spring, quase todo bean é compartilhado entre todas as requisições, em várias
threads ao mesmo tempo.** Portanto:

- bean **não guarda estado de requisição** em campo. Nunca:

  ```java
  @Service
  class PaymentService {
      private UUID currentOrderId;   // ❌ duas requisições sobrescrevem uma à outra
  }
  ```

- estado compartilhado de verdade (o repositório em memória) precisa ser thread-safe
  (`ConcurrentHashMap`), exatamente como no singleton do .NET.

O `PaymentService` é seguro como singleton porque todos os campos são `final` e apontam para objetos
thread-safe; o estado de cada requisição vive em variáveis locais e parâmetros. **Campos `final` em
todo bean** é a regra que você vai defender em code review.

## Ciclo de vida: `initMethod` e `destroyMethod`

```java
@Bean(initMethod = "start", destroyMethod = "stop")
PaymentEventsWorker paymentEventsWorker(...) { ... }
```

O Spring chama `start()` quando o contexto termina de subir e `stop()` quando ele fecha. O SIGTERM
do Kubernetes dispara o fechamento do contexto. É o `BackgroundService` do .NET: mesma ideia,
mecanismo diferente. Alternativas que você vai ver: `@PostConstruct`/`@PreDestroy` na própria classe,
ou implementar `SmartLifecycle` (quando a ordem de start/stop entre beans importa, como num consumer
Kafka que deve parar **antes** do pool de conexões).

## Erros clássicos de IoC no Spring

| Sintoma | Causa |
|---|---|
| `NoSuchBeanDefinitionException` | classe fora do pacote do `@SpringBootApplication`, ou faltou registrar |
| `NoUniqueBeanDefinitionException` | dois beans do mesmo tipo; resolva com `@Primary` ou `@Qualifier` |
| `BeanCurrentlyInCreationException` (dependência circular) | A precisa de B, B precisa de A. Desde o Boot 2.6 é **proibido por padrão**: redesenhe, não "libere" |
| `@Transactional` ou `@Async` "não funciona" | chamada interna (`this.metodo()`) não passa pelo proxy do Spring |

Faça o teste: comente o método `paymentGateway(...)` na `PaymentsConfiguration` e suba a aplicação.
Leia a mensagem inteira: o Spring diz qual bean precisava de qual tipo e não achou. Saber ler essa
mensagem rápido é metade do trabalho de manutenção em Spring.

Próxima: [1J.5 Configuração tipada e perfis](05-configuracao.md)
