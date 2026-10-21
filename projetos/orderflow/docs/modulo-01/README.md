# Módulo 1: C# e ASP.NET 10 para quem vem de Node/TypeScript

**Objetivo:** construir a Orders API com a qualidade que se espera de um sênior em .NET, e entender
cada decisão bem o bastante para defendê-la numa entrevista.

**Pré-requisito:** Módulo 0 concluído. Você já sabe programar backend (Node/TS); este módulo
traduz o que você já sabe e foca no que é **diferente** no .NET.

**Tempo estimado:** 8 a 12 horas, mais os exercícios.

## Lições

| # | Lição | Arquivos do código |
|---|---|---|
| 1.1 | [Anatomia de um projeto .NET](01-anatomia-do-projeto.md) | `.slnx`, `.csproj`, `Directory.Build.props` |
| 1.2 | [C# para quem vem de TypeScript](02-csharp-para-quem-vem-de-ts.md) | (folha de consulta) |
| 1.3 | [O domínio: regras que não dependem de nada](03-dominio.md) | `Domain/` |
| 1.4 | [Program.cs, injeção de dependência e tempos de vida](04-program-e-di.md) | `Program.cs` |
| 1.5 | [Configuração e Options pattern](05-configuracao.md) | `OrdersOptions.cs`, `appsettings.json` |
| 1.6 | [Minimal APIs, validação e Problem Details](06-minimal-apis.md) | `Api/` |
| 1.7 | [BackgroundService e Channels: a ponte para o Kafka](07-background-e-channels.md) | `Infrastructure/` |
| 1.8 | [Concorrência e idempotência](08-concorrencia-e-idempotencia.md) | `InMemoryOrderRepository.cs` |
| 1.9 | [Health checks e logging estruturado](09-health-e-logging.md) | `EventQueueHealthCheck.cs` |
| 1.10 | [Testes de unidade e de integração](10-testes.md) | `tests/` |
| ✍️ | [Exercícios](exercicios.md) | |
| 🎤 | [Perguntas de entrevista](perguntas-de-entrevista.md) | |

## O que você terá no fim

- Uma API com 5 endpoints, validação nativa do .NET 10, erros padronizados (RFC 9457),
  idempotência à prova de concorrência e health checks prontos para Kubernetes.
- Um worker em segundo plano que consome eventos de uma fila em memória, no mesmo formato
  que o consumer Kafka do Módulo 2.
- Testes de unidade do domínio e de integração da API.
- Clareza sobre os três problemas que os próximos módulos resolvem:
  1. eventos somem se o processo reiniciar (→ Kafka, Módulo 2);
  2. salvar e publicar não são atômicos (→ Outbox, Módulo 3);
  3. dados somem se o processo reiniciar (→ Postgres + EF Core, Módulo 3).

Próximo módulo: [1-J: Java 25 e Spring Boot 4](../modulo-01j/README.md), o serviço Payments em Java.
