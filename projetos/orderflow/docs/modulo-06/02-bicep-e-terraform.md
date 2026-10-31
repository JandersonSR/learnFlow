# 6.2 Bicep e Terraform, lado a lado

Arquivos: [`infra/bicep/`](../../infra/bicep/), [`infra/terraform/`](../../infra/terraform/)

A mesma infraestrutura está escrita duas vezes, recurso por recurso. Não é para você manter as duas num projeto real: é para você saber ler e escrever as duas, porque o mercado brasileiro de Azure usa as duas, e entrevistas perguntam a diferença.

## A diferença que importa: onde mora o estado

::: conceito Estado
"O que já existe e o que o código diz que deveria existir": toda ferramenta de IaC precisa comparar os dois para saber o que criar, mudar ou apagar.
:::

| | Bicep | Terraform |
|---|---|---|
| Quem guarda o "o que existe" | **o próprio Azure** (o ARM consulta os recursos) | um **arquivo de estado** (`terraform.tfstate`) |
| Ver o que vai mudar | `az deployment group what-if` | `terraform plan` |
| Aplicar | `az deployment group create` (o ARM aplica) | `terraform apply` (o binário chama as APIs) |
| Apagar o que saiu do código | só com `--mode Complete` (perigoso) ou *deployment stacks* | padrão: some do código, some do Azure |
| Recurso novo do Azure | no dia do lançamento (os tipos vêm da API) | quando o provider `azurerm` implementar; antes disso, `azapi` |
| Outras nuvens e SaaS | não | sim (GitHub, Cloudflare, Datadog... no mesmo plano) |

::: armadilha O tfstate contém segredos
O estado guarda **todos** os atributos dos recursos, inclusive os sensíveis (chaves de acesso, o `kube_config` do AKS, valores de `azurerm_key_vault_secret`). `sensitive = true` só esconde da **saída** do terminal; no arquivo, está em texto puro. Por isso o `.gitignore` do `infra/terraform` ignora `*.tfstate`, e o `versions.tf` traz o backend `azurerm` comentado: estado num Storage Account com acesso por Entra ID (`use_azuread_auth`), criptografia e **lock** (dois `apply` ao mesmo tempo corrompem o estado). Em time, estado local é proibido.
:::

## O mesmo recurso nas duas línguas

A credencial federada, que é o coração do Workload Identity:

```bicep
resource federated 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2024-11-30' = {
  parent: identity
  name: 'aks-${namespace}-${serviceAccount}'
  properties: {
    issuer: oidcIssuerUrl
    subject: 'system:serviceaccount:${namespace}:${serviceAccount}'
    audiences: [ 'api://AzureADTokenExchange' ]
  }
}
```

```hcl
resource "azurerm_federated_identity_credential" "workload" {
  for_each                  = var.workloads
  name                      = "aks-${each.value.namespace}-${each.value.service_account}"
  user_assigned_identity_id = azurerm_user_assigned_identity.workload[each.key].id
  issuer                    = azurerm_kubernetes_cluster.this.oidc_issuer_url
  subject                   = "system:serviceaccount:${each.value.namespace}:${each.value.service_account}"
  audience                  = ["api://AzureADTokenExchange"]
}
```

Repare nas diferenças de **modelo**:

- O Bicep usa o **tipo e a versão da API REST** (`Microsoft.ManagedIdentity/...@2024-11-30`) e os nomes de propriedade da API (`audiences`). O que está na documentação da API está no Bicep.
- O Terraform usa o **schema do provider** (`azurerm_federated_identity_credential`), com nomes próprios (`audience`, `user_assigned_identity_id`). No azurerm 5.0 o antigo `parent_id` foi **removido** em favor de `user_assigned_identity_id`: copiar um exemplo de 2024 dá erro.

::: porque Por que o Terraform tem `random_string` e o Bicep não
Nomes de ACR e Key Vault são globais (viram DNS). O Bicep usa `uniqueString(resourceGroup().id)`: uma função **determinística**, recalculada a cada deploy, sempre igual para o mesmo resource group. O Terraform não tem função equivalente estável; o `random_string` é gerado **uma vez** e guardado no estado. Perdeu o estado? O próximo `apply` gera outro sufixo e tenta criar um ACR novo. É um exemplo pequeno de como o estado é parte da infraestrutura.
:::

## Quando o provider ainda não chegou: `azapi`

O App Routing com Gateway API (lição 6.5) tem propriedades na API do AKS (`ingressProfile.gatewayAPI`, `webAppRouting.gatewayAPIImplementations`) que o `azurerm_kubernetes_cluster` ainda não expõe. No Bicep, nenhuma diferença: o tipo vem da API. No Terraform, o provider **azapi** fala direto com a API REST:

```hcl
resource "azapi_update_resource" "aks_gateway_api" {
  type        = "Microsoft.ContainerService/managedClusters@2026-03-01"
  resource_id = azurerm_kubernetes_cluster.this.id
  body = {
    properties = {
      ingressProfile = {
        gatewayAPI    = { installation = "Standard" }
        webAppRouting = { gatewayAPIImplementations = { appRoutingIstio = { mode = "Enabled" } } }
      }
    }
  }
}
```

::: armadilha Dois donos para o mesmo recurso
O `azurerm_kubernetes_cluster` e o `azapi_update_resource` gerenciam o **mesmo** cluster. Se um `apply` futuro do azurerm regravar o cluster sem conhecer o `ingressProfile`, ele pode desligar o Gateway; o próximo `plan` mostra o azapi querendo religar. Regras práticas: depois de todo `apply` que mexe no AKS, rode `plan` de novo e confirme que o `azapi_update_resource` aparece **sem mudanças**; e quando o azurerm passar a suportar a propriedade, migre para ele e remova o azapi (com `terraform state rm`, para não "desfazer" a configuração).
:::

## Rodando (e o que foi verificado aqui)

```bash
# Bicep
az group create -n rg-orderflow-lab -l brazilsouth
az deployment group what-if -g rg-orderflow-lab -f infra/bicep/main.bicep -p infra/bicep/main.bicepparam
az deployment group create  -g rg-orderflow-lab -f infra/bicep/main.bicep -p infra/bicep/main.bicepparam

# Terraform
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # preencha
terraform init && terraform plan -out plano.tfplan && terraform apply plano.tfplan
```

::: armadilha O que **não** foi verificado
O Bicep foi compilado com o **Bicep CLI 0.48.1** (`bicep build` e `bicep build-params` sem erros nem avisos: tipos e propriedades conferidos contra as definições da API, inclusive o `ingressProfile` da versão `2026-03-01`). O Terraform só foi **analisado sintaticamente** (python-hcl2): sem acesso ao registry, não houve `terraform init/validate`, e os nomes de argumentos foram conferidos na documentação do azurerm 5.x. **Nenhum dos dois foi aplicado numa assinatura.** O Exercício 1 é rodar `what-if`/`plan` e corrigir o que divergir.
:::

::: video Bicep vs Terraform - A fair and balanced comparison (em inglês)
https://www.youtube.com/watch?v=3lTrIgTJ9yc
Estado, ciclo de vida, suporte a recursos novos e ecossistema, sem torcida.
:::

## Qual eu escolho?

| Situação | Escolha |
|---|---|
| Só Azure, time .NET, quer o recurso novo no dia do lançamento | **Bicep** (com *deployment stacks* para apagar o que sai do código) |
| Multi-nuvem ou muitos SaaS (GitHub, DNS externo, observabilidade) no mesmo fluxo | **Terraform** |
| A empresa já tem módulos, pipelines e gente de Terraform | Terraform, sem discussão: consistência vale mais |

Para o OrderFlow sozinho, Bicep seria suficiente. Mas o pipeline do Módulo 7 cria identidades para o **GitHub** e um dia pode querer gerenciar o próprio repositório (environments, proteções) como código, coisa que só o Terraform faz. Em entrevista, a resposta boa nunca é "a melhor ferramenta"; é "depende de X e Y, e no meu contexto escolhi Z por isso".

## Perguntas para responder sem olhar

::: pergunta
Qual a principal diferença entre Bicep e Terraform?
???
Onde o estado vive: o Bicep compara com o próprio Azure (o ARM), sem arquivo de estado; o Terraform mantém um arquivo de estado, que precisa de backend remoto com lock e contém segredos. Derivadas disso: o Terraform apaga por padrão o que sai do código, suporta outras nuvens e SaaS, e depende do provider para recursos novos; o Bicep usa os tipos da API e tem suporte no dia do lançamento.
:::

::: pergunta
O que é o azapi e quando usar?
???
Um provider do Terraform que chama a API REST do Azure diretamente, com tipo e versão de API como no Bicep. Uso quando o azurerm ainda não suporta um recurso ou propriedade. Cuidado com dois recursos do Terraform gerenciando o mesmo recurso do Azure; quando o azurerm alcançar, migro.
:::

**Próxima:** [6.3 ACR: imagens, digests e quem pode puxar](03-acr-e-imagens.md)
