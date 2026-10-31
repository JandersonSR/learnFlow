# Módulo 6: AKS de verdade: ACR, Gateway API, Workload Identity, Key Vault e KEDA

**Objetivo:** levar o OrderFlow para um AKS criado por código (Bicep **e** Terraform), sem
nenhuma senha no cluster nem no pipeline, com entrada HTTP pela Gateway API, segredos no Key
Vault e o Payments escalando pelo lag do Kafka. É a parte de AKS, identidade e rede da **AZ-104**
e a de containers e identidade da **AI-200**.

**Pré-requisitos:** Módulos 4 e 5. Uma assinatura Azure (a de avaliação serve), `az` CLI
recente (2.86+ para a Gateway API do App Routing), `kubelogin`, Bicep CLI ou Terraform 1.12+.

**Tempo estimado:** 10 a 12 horas, **em sessões de no máximo 4 horas com o cluster ligado**.

::: armadilha Custo
Este é o primeiro módulo que gasta dinheiro. Leia a lição 6.1 antes de criar qualquer coisa,
configure o budget e destrua o resource group no fim de cada sessão
(`az group delete -n rg-orderflow-lab --yes --no-wait`).
:::

## O que você constrói

| Peça | Arquivo |
|---|---|
| Infraestrutura em Bicep (módulos: acr, aks, keyvault, workload-identity, roles, github-*) | `infra/bicep/` |
| A mesma em Terraform (azurerm 5.x + azapi) | `infra/terraform/` |
| Gateway compartilhado | `deploy/k8s/aks/gateway.yaml` |
| Values por ambiente (dev, prod) com Key Vault, Workload Identity, KEDA, HTTPRoute, NetworkPolicy | `deploy/helm/*/values-dev.yaml`, `values-prod.yaml` |
| Identidades federadas para o GitHub Actions (usadas no Módulo 7) | `github-identity.bicep`, `github.tf` |

## Lições

| # | Lição | Tempo |
|---|---|---|
| 6.1 | [O que vamos criar no Azure, e quanto custa](01-arquitetura-e-custos.md) | 60 min |
| 6.2 | [Bicep e Terraform, lado a lado](02-bicep-e-terraform.md) | 75 min |
| 6.3 | [ACR: imagens, digests e quem pode puxar](03-acr-e-imagens.md) | 45 min |
| 6.4 | [Workload Identity e Key Vault: nenhuma senha no cluster](04-workload-identity-e-key-vault.md) | 75 min |
| 6.5 | [A entrada: Gateway API do App Routing, e a rede por dentro](05-gateway-api-e-rede.md) | 60 min |
| 6.6 | [KEDA: escalar pelo lag do Kafka](06-keda-por-lag.md) | 50 min |
| ✍️ | [Exercícios e desafio](exercicios.md) | 5 a 8 h |
| 🎤 | [Perguntas de entrevista](perguntas-de-entrevista.md) | 40 min |

## Roteiro de uma sessão

```bash
# 1. infraestrutura (6.1, 6.2)
az group create -n rg-orderflow-lab -l brazilsouth
az deployment group create -g rg-orderflow-lab -f infra/bicep/main.bicep -p infra/bicep/main.bicepparam
az aks get-credentials -g rg-orderflow-lab -n aks-orderflow && kubelogin convert-kubeconfig -l azurecli

# 2. plataforma no cluster (Módulos 4 e 5)
kubectl apply -f deploy/k8s/aks/gateway.yaml
kubectl apply -f deploy/k8s/dev/        # Postgres de laboratório (e o Kafka simples, se não for usar Strimzi)
#    Strimzi: deploy/k8s/strimzi/README.md

# 3. imagens (6.3) e segredos (6.4)
az acr build -r <acr> -t orders:<sha>   -f deploy/docker/orders.Dockerfile .
az acr build -r <acr> -t payments:<sha> -f deploy/docker/payments.Dockerfile .
az keyvault secret set --vault-name <kv> -n orders-db-connection --value '...'
az keyvault secret set --vault-name <kv> -n payments-db-password --value '...'

# 4. serviços (preencha os <PREENCHER> do values-dev.yaml com os outputs)
helm upgrade --install orders   deploy/helm/orders   -n orderflow -f deploy/helm/orders/values-dev.yaml   --set-string image.repository=<acr>.azurecr.io/orders   --set-string image.tag=<sha> --wait
helm upgrade --install payments deploy/helm/payments -n orderflow -f deploy/helm/payments/values-dev.yaml --set-string image.repository=<acr>.azurecr.io/payments --set-string image.tag=<sha> --wait

# 5. fim do dia
az group delete -n rg-orderflow-lab --yes --no-wait
```

## Sobre o que foi validado

- **Bicep**: compilado com o Bicep CLI 0.48.1 (`build` e `build-params`) sem erros nem avisos;
  tipos conferidos para as versões de API usadas (AKS `2026-03-01`).
- **Terraform**: só análise sintática (python-hcl2); argumentos conferidos na documentação do
  azurerm 5.x. Sem `terraform validate` (sem acesso ao registry de providers).
- **Charts e manifestos**: renderizados e validados com `kubeconform -strict` (Kubernetes 1.34 +
  CRDs do KEDA, Gateway API e Secrets Store CSI).
- **Nada foi aplicado numa assinatura Azure.** O Exercício 1 existe para isso.

Próximo módulo: [7: Operação](../modulo-07/README.md).
