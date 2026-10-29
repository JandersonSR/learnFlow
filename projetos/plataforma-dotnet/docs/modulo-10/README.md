# Módulo 10: Harbor e cadeia de suprimentos: robôs, scan, bloqueio de imagem vulnerável

**Objetivo:** entender o que entra na imagem além do seu código, como uma vulnerabilidade publicada amanhã afeta uma imagem de ontem, e as duas barreiras do projeto: o Trivy no pipeline e o Harbor que recusa imagem vulnerável no momento do pull.

## O que você vai conseguir fazer no fim

- Explicar o que é a cadeia de suprimentos de software e de onde vêm as vulnerabilidades de uma imagem .NET
- Ler um relatório do Trivy e decidir: atualizar, esperar ou aceitar com registro
- Explicar a regra "High e Critical com correção disponível" e por que ela não bloqueia tudo
- Explicar projetos, robôs e a política `deployment_security` do Harbor, e por que o cluster tem um robô só de leitura
- Dizer o que falta depois do scan: digest em vez de tag, SBOM, assinatura e controle de admissão

## Lições

| # | Lição | Tempo |
|---|---|---|
| 10.1 | [O que vem dentro da imagem, e o Trivy no pipeline](01-cadeia-e-trivy.md) | 50 min |
| 10.2 | [Harbor: o registry que recusa imagem ruim](02-harbor.md) | 60 min |
| 10.3 | [Além do scan: digest, SBOM e assinatura](03-alem-do-scan.md) | 40 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Onde está a prática

Níveis [12](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/12-scan-de-imagem.md) (Trivy) e [17](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/17-harbor.md) (Harbor) do aks-step-by-step. O Trivy roda local com Docker, sem custo; o Harbor precisa do cluster.

## Entregável do módulo

Uma política de uma página para o time: **"O que fazer quando o scan reprovar"**, com os quatro caminhos da lição 10.1, quem pode aprovar uma exceção e com que prazo de revisão.
