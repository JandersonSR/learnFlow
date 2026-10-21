# Módulo 1-J: Java 25 e Spring Boot 4 para quem já sabe TS e C#

**Objetivo:** construir o serviço **Payments** em Java, com o mesmo nível de qualidade da Orders
API, e sair capaz de trabalhar e ser entrevistado em vagas Java/Spring.

**Por que um serviço em Java no mesmo sistema?** Em empresa grande é normal: times diferentes,
linguagens diferentes, integrados por eventos. No Módulo 2, o Payments (Java) e o Orders (.NET)
vão conversar **só pelo Kafka**. Você aprende as duas stacks e, de quebra, o assunto que mais pesa
em entrevista de staff: contratos entre serviços que não compartilham código.

```
                         Módulo 2 em diante
Orders API (.NET 10) ── orders.events ──▶ Kafka ──▶ Payments (Java 25 + Spring Boot 4)
        ▲                                                   │
        └──────────────── payments.events ◀── Kafka ◀───────┘
```

**Pré-requisito:** Módulo 1 (.NET) feito ou pelo menos lido. Este módulo compara o tempo todo
com ele: mesmo domínio, mesmos padrões, outra linguagem. Ver a mesma ideia escrita duas vezes é o
jeito mais rápido de separar o **conceito** (que vale em qualquer stack) da **sintaxe**.

**Tempo estimado:** 8 a 10 horas, mais os exercícios.

## Lições

| # | Lição | Arquivos do código (`java/payments/`) |
|---|---|---|
| 1J.1 | [Anatomia: Maven, pom.xml e o projeto Spring](01-anatomia-maven-e-spring.md) | `pom.xml`, `PaymentsApplication.java` |
| 1J.2 | [Java para quem sabe TypeScript e C#](02-java-para-quem-sabe-ts-e-csharp.md) | (folha de consulta) |
| 1J.3 | [O domínio em Java puro](03-dominio-em-java.md) | `domain/` |
| 1J.4 | [Spring: IoC, beans e o escopo que muda tudo](04-spring-ioc-e-escopos.md) | `config/PaymentsConfiguration.java` |
| 1J.5 | [Configuração tipada e perfis](05-configuracao.md) | `PaymentsProperties.java`, `application.yml` |
| 1J.6 | [REST, Bean Validation e ProblemDetail](06-rest-validacao-problemdetail.md) | `api/` |
| 1J.7 | [Threads virtuais: o "async/await" do Java](07-threads-virtuais.md) | `infrastructure/PaymentEventsWorker.java` |
| 1J.8 | [Actuator, logging e testes](08-actuator-logging-testes.md) | `PaymentEventQueueHealthIndicator.java`, `src/test/` |
| 📋 | [.NET × Spring: tabela de equivalências](dotnet-vs-spring.md) | |
| ✍️ | [Exercícios](exercicios.md) | |
| 🎤 | [Perguntas de entrevista](perguntas-de-entrevista.md) | |

## O que foi verificado neste módulo (e o que não foi)

- **Domínio, aplicação e infraestrutura** (Java puro): compilados com JDK 25 em modo estrito
  (`-Xlint:all -Werror`), com os 16 testes de unidade passando 10 de 10 vezes. Isso inclui um teste de
  concorrência com 50 threads virtuais e um teste de estresse que encontrou um problema real,
  discutido na lição 1J.7 e no Exercício 3.
- **Camada Spring** (controller, configuração, health, testes de integração): escrita e revisada
  contra a documentação do Spring Boot 4, mas **não compilada**, porque o ambiente onde o curso foi
  montado não acessava o Maven Central. Rodar `./mvnw verify` na sua máquina é o primeiro passo do
  Exercício 1. Se quebrar, ótimo: é um bug real, e você me traz o erro.
