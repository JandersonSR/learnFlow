# 1J.6 REST, Bean Validation e ProblemDetail

Arquivos: `api/PaymentController.java`, `api/Contracts.java`, `api/GlobalExceptionHandler.java`

## Endpoints

| Método | Rota | Respostas |
|---|---|---|
| `POST` | `/payments` (header opcional `Idempotency-Key`) | 201 (aprovado **ou** recusado), 200 (retry), 400, 409 |
| `GET` | `/payments/{id}` | 200, 404 |
| `GET` | `/payments?orderId=...` | 200 (lista, pode ser vazia) |
| `POST` | `/payments/{id}/refund` | 200, 404, 409 |

Por que um cartão **recusado** responde 201? Porque a requisição deu certo: o recurso "tentativa de
pagamento" foi criado, com `status: DECLINED`. Erro HTTP (4xx) é para requisição inválida ou
conflitante, não para um "não" legítimo do banco do cliente. Esse é um debate frequente em design de
API; defenda a sua escolha com esse argumento.

## Controllers anotados

O Spring MVC trabalha com controllers (o estilo "Controllers" do ASP.NET). Não há equivalente às
Minimal APIs no MVC.

```java
@PostMapping
ResponseEntity<PaymentResponse> process(
        @Valid @RequestBody ProcessPaymentRequest request,
        @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) { ... }
```

| Anotação | De onde vem | .NET equivalente |
|---|---|---|
| `@RequestBody` | corpo JSON | parâmetro de tipo complexo |
| `@PathVariable` | `/{id}` | nome igual ao da rota |
| `@RequestParam` | `?orderId=` | parâmetro simples / `[FromQuery]` |
| `@RequestHeader` | header | `[FromHeader]` |

**⚠️ Sem `@Valid`, nada é validado.** As anotações do DTO ficam lá, bonitas, e o Spring as ignora.
No .NET 10 com `AddValidation()` a validação é automática; no Spring você pede por parâmetro. Esquecer
`@Valid` é um bug clássico que só aparece quando chega lixo em produção.

## Bean Validation

```java
@NotNull @DecimalMin("0.01") @Digits(integer = 9, fraction = 2)
BigDecimal amount,

@NotBlank @Pattern(regexp = "^tok_[A-Za-z0-9_]{4,60}$", message = "deve ser um token no formato tok_...")
String cardToken
```

`jakarta.validation` é a especificação; o Spring usa a implementação Hibernate Validator. (`jakarta`
e não `javax`: o pacote foi renomeado em 2020, quando o Java EE virou Jakarta EE. Tutorial com
`javax.validation` é de antes do Spring Boot 3.)

### Nunca receba número de cartão

O campo se chama `cardToken`, não `cardNumber`, e o padrão exige `tok_...`. Em produção, o front
manda o cartão **direto para o adquirente**, que devolve um token; o seu backend só vê o token. Assim
o número do cartão nunca passa pelos seus servidores, logs ou banco, e o escopo de **PCI DSS** da
empresa fica muito menor. Falar isso numa entrevista de fintech conta pontos.

## ProblemDetail: o mesmo formato de erro nos dois serviços

O `GlobalExceptionHandler` faz em Java o que o handler do .NET faz no Orders:

| Exceção | Status | Corpo |
|---|---|---|
| `MethodArgumentNotValidException` (`@Valid` falhou) | 400 | `errors` por campo |
| `DomainException` tipo `RULE` | 422 | `code` estável |
| `DomainException` tipo `CONFLICT` | 409 | `code` estável |
| `PaymentNotFoundException` | 404 | |
| qualquer outra | 500 | mensagem genérica, stack trace só no log |

O resultado para quem consome a API: **o mesmo JSON de erro** (RFC 9457) no Orders e no Payments.
Para o front e para outros times, o OrderFlow parece um sistema só. Em empresa com dezenas de
serviços, padronizar o formato de erro entre stacks é o tipo de decisão que um staff puxa.

### Por que sobrescrever `handleMethodArgumentNotValid`

Por padrão, o Spring responde 400 ao `@Valid` com um ProblemDetail que **não diz quais campos
falharam**. O front recebe "Bad Request" e o dev abre um chamado. Sobrescrevemos para incluir:

```json
{
  "title": "Erro de validação",
  "status": 400,
  "detail": "Um ou mais campos são inválidos.",
  "errors": {
    "amount": ["numeric value out of bounds (<9 digits>.<2 digits> expected)"],
    "cardToken": ["deve ser um token no formato tok_..."]
  }
}
```

(O texto exato das mensagens padrão do Hibernate Validator pode variar com o idioma da JVM.)

Repare que a classe estende `ResponseEntityExceptionHandler`: assim os erros do próprio MVC (JSON
quebrado, UUID inválido na rota, parâmetro obrigatório faltando) também saem como ProblemDetail, sem
você tratar um por um.

Próxima: [1J.7 Threads virtuais](07-threads-virtuais.md)
