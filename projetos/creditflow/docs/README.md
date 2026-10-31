# CreditFlow: mapa do curso

**Objetivo:** construir do zero uma plataforma de crédito pessoal de produção em **ASP.NET 10**, como **monolito modular com DDD**, com **Keycloak**, **PostgreSQL**, **MongoDB**, **Dragonfly** e **Kafka**, empacotada com **Helm**, imagens no **Harbor**, infraestrutura em **Terraform** e deploy por **Argo CD** no **AKS**. Ao longo do curso, os módulos **Simulação** e **Pagamentos** passam a escalar separados do resto, sem virar microsserviços antes da hora.

Cada lição ensina como um professor: o que é cada peça, por que esta escolha e não outra, como funciona por dentro, o que quebra e como diagnosticar. O código fica no repositório [lending-plataform](https://github.com/JandersonSR/lending-plataform), com uma tag do Git por módulo (`modulo-01`, `modulo-02`…).

## Como este curso se liga aos outros

| Curso | Quando usar |
|---|---|
| [Plataforma .NET em Produção](../../plataforma-dotnet/docs/README.md) | A teoria de cada peça da plataforma, aplicada numa API simples. Quando uma lição daqui disser "visto a fundo na Plataforma", vá lá |
| [OrderFlow](../../orderflow/docs/README.md) | Sistema poliglota (.NET + Java) por eventos: bom para comparar com o monolito modular daqui |
| Este (CreditFlow) | O projeto de portfólio completo: um domínio de verdade, construído do primeiro `dotnet new` até o AKS |

**Regra de ouro:** digite o código, não copie. E escreva seu palpite nas previsões antes de abrir a resposta.

## Mapa dos módulos

| # | Módulo | Status | Certificação que ajuda |
|---|---|---|---|
| 0 | [Visão geral, o domínio de crédito e como estudar](00-visao-geral.md) | ✅ pronto | — |
| 1 | [Do zero: solução, monolito modular, fronteiras testadas e ambiente local](modulo-01/README.md) | ✅ pronto | entrevistas sênior |
| 2 | [Domínio de crédito: módulo Simulação (Price, SAC, IOF, CET)](modulo-02/README.md) | ✅ pronto | — |
| 3 | [Identidade com Keycloak: OIDC, PKCE, roles e M2M](modulo-03/README.md) | ✅ pronto | SC-300 (conceitos) |
| 4 | [Persistência poliglota: PostgreSQL e MongoDB](modulo-04/README.md) | ✅ pronto | — |
| 5 | [Cache com Dragonfly: o que cachear em crédito e o que nunca cachear](modulo-05/README.md) | ✅ pronto | — |
| 6 | [Kafka: outbox, saga de desembolso e consumidor idempotente](modulo-06/README.md) | ✅ pronto | CCDAK |
| 7 | [Contêiner, Kubernetes e Helm com perfis de execução](modulo-07/README.md) | ✅ pronto | CKAD |
| 8 | [Escalando Simulação e Pagamentos: HPA, KEDA e teste de carga](modulo-08/README.md) | ✅ pronto | CKAD |
| 9 | [Azure com Terraform: rede, AKS, Postgres, Key Vault e Workload Identity](modulo-09/README.md) | ✅ pronto | AZ-104, Terraform Associate |
| 10 | Harbor e cadeia de suprimentos: scan, assinatura e bloqueio | 🔜 | — |
| 11 | GitOps com Argo CD: app-of-apps, ambientes e promoção | 🔜 | — |
| 12 | Operação: OpenTelemetry, SLOs, game day, post-mortem e ADRs | 🔜 | AZ-400, entrevistas staff |

Ordem sugerida: 0 → 12 em sequência. Cada módulo termina com um desafio sem roteiro e perguntas de entrevista.
