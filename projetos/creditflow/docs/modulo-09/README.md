# Módulo 9: Azure com Terraform: rede, AKS, dados privados e identidade sem segredo

**Objetivo:** levar o CreditFlow do kind para a Azure com Terraform, entendendo **por que** cada peça está onde está: uma rede onde banco e cache não têm IP público, um AKS sem conta de administrador local, um Postgres Flexible e um MongoDB (Azure DocumentDB) alcançáveis só de dentro da VNet, e segredos que chegam aos pods sem nenhuma senha guardada em lugar nenhum além do Key Vault. Tudo em quatro camadas de Terraform, com estado remoto, lock e ordem de aplicação.

## O que você vai conseguir fazer no fim

- Desenhar a rede do CreditFlow e justificar cada sub-rede, o CNI Overlay, o NAT e o IP fixo do Gateway
- Explicar o que cada argumento do `azurerm_kubernetes_cluster` muda (Entra ID + Azure RBAC, OIDC, Workload Identity, canais de atualização) e o que mudou no azurerm 5.x
- Explicar acesso privado do Postgres Flexible (injeção na VNet) x Private Endpoint (DocumentDB), e por que os dois existem
- Contar, passo a passo e com um diagrama de sequência, como um pod lê um segredo do Key Vault sem ter senha
- Gerar senhas no Terraform que **não** vão para o estado (efêmero + write-only)
- Aplicar e destruir as quatro camadas na ordem certa e estimar o custo de dev e de prod

## O que você constrói

- [`infra/terraform/00-base`](https://github.com/JandersonSR/lending-plataform/blob/main/infra/terraform/00-base/main.tf): estado remoto e identidade do CI
- [`infra/terraform/10-azure`](https://github.com/JandersonSR/lending-plataform/blob/main/infra/terraform/10-azure/aks.tf): rede, AKS, Postgres, DocumentDB, Key Vault, identidades
- [`infra/terraform/20-plataforma`](https://github.com/JandersonSR/lending-plataform/blob/main/infra/terraform/20-plataforma/main.tf): operadores, Harbor, Argo CD
- [`infra/terraform/30-app`](https://github.com/JandersonSR/lending-plataform/blob/main/infra/terraform/30-app/main.tf): a ponte para o GitOps
- ADRs [0010 (MongoDB na Azure)](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0010-mongodb-na-azure.md) e [0011 (Terraform em camadas)](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0011-terraform-em-camadas.md)

## Pré-requisitos

- Módulos 7 e 8 (o chart e a escala funcionando no kind)
- Assinatura Azure (os créditos de estudante ou de Visual Studio servem para dev), Azure CLI, Terraform 1.12+ e `kubelogin`
- A base de Terraform (plan/apply, providers, estado, camadas) e de Key Vault + Workload Identity: módulos [9](../../plataforma-dotnet/docs/modulo-09/README.md) e [8.3](../../plataforma-dotnet/docs/modulo-08/03-key-vault-e-identidade.md) da Plataforma. Aqui não repetimos `terraform init`; aplicamos num sistema com mais peças e decisões

::: armadilha Custa dinheiro
Este módulo cria recursos pagos. O ambiente dev completo fica na faixa de algumas centenas de dólares por mês **se ficar ligado** (lição 9.5). Pare o cluster quando não estiver estudando (`az aks stop`) e destrua tudo no fim (`terraform destroy` na ordem inversa).
:::

## Lições

| # | Lição | Tempo |
|---|---|---|
| 9.1 | [A rede, e por que ela é assim](01-a-rede.md) | 60 min |
| 9.2 | [O AKS, argumento por argumento](02-o-aks.md) | 60 min |
| 9.3 | [Dados privados: Postgres Flexible e DocumentDB](03-dados-privados.md) | 50 min |
| 9.4 | [Key Vault e Workload Identity por dentro](04-key-vault-e-workload-identity.md) | 60 min |
| 9.5 | [Estado, camadas, ordem de apply e custo](05-estado-camadas-e-custo.md) | 50 min |
| — | [Desafio do módulo](desafio.md) | 3–4 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |

Tempo estimado: **9 a 10 horas**, contando o desafio.

## Entregável do módulo

Dev aplicado na sua assinatura, o CreditFlow respondendo em `https://api.<ip>.nip.io/v1/simulacoes` (módulo 11 completa o GitOps), e uma planilha de custo dev x prod com os preços **da sua região** tirados da calculadora da Azure.
