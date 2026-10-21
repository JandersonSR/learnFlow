# 1J.3 O domínio em Java puro

Arquivos: `java/payments/src/main/java/com/orderflow/payments/domain/`

## As mesmas decisões do Orders, outra sintaxe

Releia a [lição 1.3](../modulo-01/03-dominio.md) e compare com `Payment.java`. Tudo se repete:

| Decisão | Orders (.NET) | Payments (Java) |
|---|---|---|
| Só a fábrica cria | `Order.Create(...)` | `Payment.record(...)` |
| Estado muda por método de negócio | `Cancel`, `MarkAsPaid` | `refund` |
| Transição repetida não faz nada | `MarkAsPaid` duas vezes | `refund` duas vezes |
| Eventos anotados, não publicados | `_events` | `pendingEvents` |
| Relógio injetável | `TimeProvider` | `java.time.Clock` |
| Id ordenável no tempo | `Guid.CreateVersion7()` | `UuidV7.next(clock)` (escrito à mão, o JDK não tem) |
| Erro de negócio sem saber de HTTP | `DomainException` + `DomainErrorType` | `DomainException` + `Type` |

Quando a mesma ideia funciona em duas linguagens, ela é **arquitetura**, não detalhe de framework.
Essa é a frase para usar numa entrevista quando perguntarem "você conhece Java?" sendo dev .NET (ou o
contrário).

## O que é diferente em Java

### Tentativa recusada também é um `Payment`

```java
Payment payment = switch (decision) {
    case GatewayDecision.Approved(String authCode) -> new Payment(..., APPROVED, authCode, null, now);
    case GatewayDecision.Declined(String reason)   -> new Payment(..., DECLINED, null, reason, now);
};
```

Decisão de negócio: guardar as recusas. Antifraude precisa delas ("5 recusas em 2 minutos do mesmo
cliente") e o suporte precisa responder "por que meu cartão não passou?". Um pedido pode ter várias
tentativas recusadas e **no máximo uma aprovada**: essa regra fica no `PaymentService`, porque
depende de outros pagamentos, e não só deste.

### `sealed interface` + `record` = união discriminada

`GatewayDecision` só pode ser `Approved` ou `Declined`. O `switch` acima não tem `default`: se alguém
criar `GatewayDecision.Pending`, o código **para de compilar** até tratar o caso. É o equivalente ao
`type Decision = Approved | Declined` do TypeScript, só que verificado pelo compilador em toda parte.

`PaymentEvent` usa o mesmo truque, e o `PaymentEventsWorker` desconstrói cada record no `case`:

```java
case PaymentEvent.PaymentDeclined(var paymentId, var orderId, var reason, _) -> ...
```

### Dinheiro recusa arredondamento silencioso

```java
return amount.setScale(2, RoundingMode.UNNECESSARY);   // 10.005 → ArithmeticException → DomainException
```

`UNNECESSARY` significa "se precisar arredondar, lance exceção". Arredondar em silêncio
(`HALF_UP`) aceitaria 10,005 como 10,01 e você cobraria um centavo que ninguém pediu. Com dinheiro,
**recusar é melhor que adivinhar**. A borda HTTP (`@Digits(fraction = 2)`) já barra isso com 400; o
domínio garante de novo para qualquer outra entrada (consumer Kafka, script).

### Encapsulamento sem propriedades

Java não tem `{ get; private set; }`. O padrão é campo `private` + método de leitura. Usamos o estilo
dos records (`status()`) em vez do estilo JavaBean (`getStatus()`); você vai ver os dois no mercado.
E `pendingEvents()` devolve `List.copyOf(...)`: uma cópia imutável, porque em Java não existe um
`IReadOnlyList` que o compilador impeça de alterar.

### `serialVersionUID`

O compilador (com `-Xlint:all`) avisou que `DomainException` não tinha `serialVersionUID`. Exceções em
Java são `Serializable` por herança, uma relíquia dos anos 90. Declare `private static final long
serialVersionUID = 1L;` e siga a vida.

## Nenhum `import org.springframework` aqui

Rode, na pasta `java/payments`:

```bash
grep -r "springframework" src/main/java/com/orderflow/payments/domain src/main/java/com/orderflow/payments/application
# (nenhum resultado)
```

Muito código Spring de mercado põe `@Entity` (JPA) e `@Component` direto nas classes de domínio. Funciona,
mas acopla regra de negócio ao framework e ao banco. No Módulo 3, quando entrar JPA, você vai decidir
(com um ADR) se mapeia o domínio direto ou usa classes de persistência separadas. Os dois lados têm
argumentos; o que não pode é decidir sem saber que está decidindo.

Próxima: [1J.4 Spring: IoC, beans e o escopo que muda tudo](04-spring-ioc-e-escopos.md)
