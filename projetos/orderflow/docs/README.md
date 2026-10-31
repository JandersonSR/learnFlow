# Trilha de estudo do OrderFlow

O OrderFlow foi construído como um curso prático: cada módulo evolui o mesmo sistema e vem com
lições, exercícios com critério de aceite e perguntas de entrevista com a resposta que um sênior daria.

Regra de ouro: **digite o código, não copie.** O objetivo é conseguir defender cada linha numa
entrevista ou num code review.

## Como cada módulo funciona

| Parte | O que é |
|---|---|
| **Lições** | O porquê de cada decisão, comparando com o que você já sabe (Node/TS, C#) |
| **Código** | Compila, roda e tem comentários explicando o que importa |
| **Exercícios** | Tarefas com critério de aceite; cada uma vira um commit |
| **Perguntas de entrevista** | O que costuma cair, com a resposta esperada de um sênior |

## Mapa dos módulos

| # | Módulo | Status | Certificação que ajuda |
|---|---|---|---|
| 0 | [Ambiente e visão geral](00-ambiente-e-visao-geral.md) | ✅ pronto | — |
| 1 | [C# e ASP.NET 10 para quem vem de Node/TS](modulo-01/README.md) (serviço **Orders**) | ✅ pronto | base para todas |
| 1-J | [Java 25 e Spring Boot 4 para quem sabe TS e C#](modulo-01j/README.md) (serviço **Payments**) | ✅ pronto | **Oracle Java SE (1Z0-830)** |
| 2 | [Kafka do zero: producers e consumers em **.NET e Java**, partições, offsets; Orders ↔ Payments por eventos](modulo-02/README.md) | ✅ pronto | **CCDAK** (núcleo) |
| 3 | [Kafka em produção: outbox, idempotência, retry, DLT, Schema Registry (contrato entre Java e .NET); EF Core e JPA com Postgres](modulo-03/README.md) | ✅ pronto | **CCDAK** |
| 4 | [Kubernetes local: Docker (imagens .NET e Java), Deployments, Services, probes, Helm](modulo-04/README.md) | ✅ pronto | **CKAD** |
| 5 | [Kafka no Kubernetes: Strimzi vs Confluent Cloud vs Event Hubs; Kafka Streams (Java)](modulo-05/README.md) | ✅ pronto | CCDAK + CKAD |
| 6 | [AKS de verdade: ACR, Ingress, Workload Identity, Key Vault, KEDA, Bicep/Terraform](modulo-06/README.md) | ✅ pronto | **AZ-104**, AI-200 |
| 7 | [Operação: OpenTelemetry nas duas stacks, Grafana, CI/CD, deploy sem downtime, runbooks](modulo-07/README.md) | ✅ pronto | AZ-400 |
| 8 | [Camada de tech lead/staff: ADRs, system design, trade-offs, revisão](modulo-08/README.md) | ✅ pronto | entrevistas sênior/staff |

Ordem sugerida: 0 → 1 → 1-J → 2. Com foco em vaga Java, dá para fazer 0 → 1-J → 1; o 1-J compara
com o 1 o tempo todo, então leia pelo menos as lições 1.3 (domínio) e 1.7/1.8 (worker e
concorrência) antes.

## Referência rápida

- [.NET 10 × Spring Boot 4: tabela de equivalências](modulo-01j/dotnet-vs-spring.md)
- [Perguntas de entrevista do Módulo 1 (.NET)](modulo-01/perguntas-de-entrevista.md)
- [Perguntas de entrevista do Módulo 1-J (Java)](modulo-01j/perguntas-de-entrevista.md)
