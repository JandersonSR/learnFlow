# Plataforma .NET em Produção: mapa do curso

**Objetivo:** sair sabendo explicar, montar, quebrar e consertar cada peça de uma API .NET de produção no Azure, no nível que uma entrevista para sênior, tech lead ou staff cobra.

## Como este curso ensina

Ler e entender dá a sensação de ter aprendido. Não é a mesma coisa que saber fazer. Cada lição usa os mesmos blocos, cada um com uma função:

| Bloco | Para que serve |
|---|---|
| **O que é** | O conceito em linguagem simples, antes de qualquer comando |
| **Analogia** | Uma ponte com algo que você já conhece (Node, fábrica, linha de montagem) |
| **Por que assim (e não de outro jeito)** | A decisão e a alternativa descartada. É isso que separa sênior de pleno |
| **Vídeo** | Uma explicação de outra pessoa, de outro ângulo. Assista depois de ler, não antes |
| **Antes de rodar: preveja** | Você escreve o que acha que vai acontecer e só depois abre a resposta. Errar aqui é onde mais se aprende |
| **Cuidado** | O erro que todo mundo comete na primeira vez |
| **Lab de quebra** | Você quebra algo de propósito e diagnostica, com dicas em níveis |
| **Desafio sem roteiro** | Só o problema e os critérios de aceite. Sem passo a passo |
| **Pergunta para responder sem olhar** | Recuperação ativa: tente responder antes de abrir. Elas voltam nos módulos seguintes |

**Ritmo sugerido:** uma lição por dia, 45 a 90 minutos. No fim de cada módulo, apresente o tema para o time em 20 a 30 minutos. Se travar na apresentação, é ali que a lição precisa ser refeita.

**Regra de ouro:** digite o código, não copie. E escreva seu palpite nas previsões antes de abrir a resposta, mesmo que seja "não faço ideia".

## Mapa dos módulos

| # | Módulo | Status | Certificação que ajuda |
|---|---|---|---|
| 0 | [Como estudar e a visão do sistema](00-visao-geral.md) | ✅ pronto | — |
| 1 | [ASP.NET 10 como monolito modular com DDD](modulo-01/README.md) | ✅ pronto | entrevistas sênior |
| 2 | [Contrato da API: OpenAPI, Swagger e Scalar, ProblemDetails, versionamento](modulo-02/README.md) | ✅ pronto | — |
| 3 | [PostgreSQL e EF Core em produção: migrações revisadas, usuário sem DDL, concorrência](modulo-03/README.md) | ✅ pronto | — |
| 4 | [Cache em camadas: HybridCache, Dragonfly e o que fazer quando o cache cai](modulo-04/README.md) | ✅ pronto | — |
| 5 | [Kafka: eventos, partições, ordem, consumidor idempotente e escala pela fila (KEDA)](modulo-05/README.md) | ✅ pronto | CCDAK |
| 6 | [Contêiner e Kubernetes do zero: imagem, pod, deployment, service, probes](modulo-06/README.md) | ✅ pronto | CKAD |
| 7 | [Helm: empacotar, versionar e voltar um deploy](modulo-07/README.md) | ✅ pronto | CKAD |
| 8 | [AKS de produção: CI/CD sem senha, Ingress e TLS, Key Vault, observabilidade, escala](modulo-08/README.md) | ✅ pronto | AZ-104 |
| 9 | [Terraform: infraestrutura em camadas, estado remoto e revisão em PR](modulo-09/README.md) | ✅ pronto | Terraform Associate |
| 10 | [Harbor e cadeia de suprimentos: robôs, scan, bloqueio de imagem vulnerável](modulo-10/README.md) | ✅ pronto | — |
| 11 | [GitOps com Argo CD: o cluster puxa, o Git é a fonte da verdade](modulo-11/README.md) | ✅ pronto | — |
| 12 | [Projeto final: incidente simulado, post-mortem, ADRs e apresentação ao time](modulo-12/README.md) | ✅ pronto | entrevistas staff |

Ordem sugerida: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. Quem já conhece Kubernetes pode fazer o 6 antes do 2; quem vai começar pela infraestrutura do trabalho pode ir do 1 direto para o 6 e voltar depois.

## Onde está a prática de cada módulo

| Módulo | Pratique em | Gabarito |
|---|---|---|
| 1 | [`src/`](https://github.com/JandersonSR/aks-step-by-step/tree/main/src) do aks-step-by-step | [`docs/decisoes.md`](https://github.com/JandersonSR/squad-dotnet-kubernetes/blob/main/docs/decisoes.md) (ADR-001, 002, 006, 010) |
| 2 | `Program.cs` e endpoints do aks-step-by-step | `docs/decisoes.md` |
| 3 | Níveis [02](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/02-azure-sql.md), [09](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/09-migracao-revisada.md) e [13](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/13-postgresql.md) | ADR-004 |
| 4 | Nível [14](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/14-dragonfly.md) | ADR-012 |
| 5 | Níveis [15](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/15-kafka.md) e [16](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/16-worker-keda.md) | — |
| 6 | Módulos 01 a 07 do [kub-learn-flow](https://github.com/JandersonSR/kub-learn-flow), depois o nível [01](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/01-aks-minimo.md) | — |
| 7 | Nível [03](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/03-helm.md) e o chart [`charts/cep-api`](https://github.com/JandersonSR/aks-step-by-step/tree/main/charts/cep-api) | [`charts/cep-api`](https://github.com/JandersonSR/squad-dotnet-kubernetes/tree/main/charts/cep-api) do gabarito |
| 8 | Níveis [04](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/04-ci-cd.md) a [08](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/08-escala.md) | `infra/10-azure` do gabarito |
| 9 | Nível [10](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/10-terraform.md) | [`infra/`](https://github.com/JandersonSR/squad-dotnet-kubernetes/tree/main/infra) do gabarito |
| 10 | Níveis [12](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/12-scan-de-imagem.md) e [17](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/17-harbor.md) | `infra/20-plataforma` e `infra/30-app` |
| 11 | Nível [11](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/11-gitops-argocd.md) | `infra/30-app` |
