# Módulo 8: AKS de produção: CI/CD sem senha, Ingress e TLS, Key Vault, observabilidade, escala

**Objetivo:** entender o que transforma "a API rodando no AKS" em "a API em produção": publicar sem nenhuma senha guardada, expor com domínio e TLS automáticos, tirar os segredos do cluster, investigar um problema sem `kubectl logs` pod por pod, e aguentar picos e manutenções sem perder requisições.

## O que você vai conseguir fazer no fim

- Explicar a cadeia de confiança OIDC entre o GitHub Actions e a Azure, e por que não existe segredo de service principal
- Explicar o caminho Ingress → Service → Pod com TLS do cert-manager, e por que a API precisa dos cabeçalhos encaminhados
- Desenhar a cadeia Workload Identity: pod → ServiceAccount → token → identidade gerenciada → Key Vault
- Achar todas as linhas de log de uma requisição de qualquer pod com uma consulta KQL
- Explicar como HPA, cluster autoscaler e PodDisruptionBudget se completam

## Lições

| # | Lição | Tempo |
|---|---|---|
| 8.1 | [CI/CD sem nenhuma senha](01-ci-cd-sem-senha.md) | 50 min |
| 8.2 | [A porta de entrada: Ingress, TLS e o IP real do cliente](02-ingress-e-tls.md) | 50 min |
| 8.3 | [Segredos fora do cluster: Key Vault e Workload Identity](03-key-vault-e-identidade.md) | 60 min |
| 8.4 | [Observabilidade: achar a agulha no palheiro](04-observabilidade.md) | 50 min |
| 8.5 | [Escala e manutenção sem perder requisições](05-escala.md) | 50 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Onde está a prática

Níveis [04](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/04-ci-cd.md) a [08](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/08-escala.md) do aks-step-by-step. Estes níveis custam dinheiro na Azure: siga o guia do nível com a assinatura de estudo e destrua o ambiente quando terminar o dia (`scripts/destruir.sh`, a partir do nível 10).

::: checkpoint
A certificação **AZ-104** cobre boa parte deste módulo (identidades gerenciadas, RBAC, Key Vault, AKS, monitoramento). A trilha [Cert - AZ-104 Azure Administrator](trilha:cert-az-104-azure-administrator) ajuda a fechar as lacunas.
:::

## Entregável do módulo

Um diagrama de uma página da cadeia de confiança do ambiente (quem prova identidade para quem, com que token, com que papel), e o runbook "Um parceiro diz que uma consulta falhou às 14h: como eu acho a causa", usando as consultas da lição 8.4.
