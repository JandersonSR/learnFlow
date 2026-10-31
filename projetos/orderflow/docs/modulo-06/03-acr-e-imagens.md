# 6.3 ACR: imagens, digests e quem pode puxar

Arquivos: [`infra/bicep/modules/acr.bicep`](../../infra/bicep/modules/acr.bicep), [`roles.bicep`](../../infra/bicep/modules/roles.bicep), [`github-identity.bicep`](../../infra/bicep/modules/github-identity.bicep), [`infra/terraform/github.tf`](../../infra/terraform/github.tf)

No kind, você carregava a imagem nos nós com `kind load`. No AKS há um **registry**: o Azure Container Registry. Três perguntas definem esta lição: como a imagem **chega** lá, como o cluster **puxa** sem senha, e como garantir que roda **exatamente** a imagem testada.

## Enviando a imagem

Da sua máquina, com Docker:

```bash
ACR=$(az deployment group show -g rg-orderflow-lab -n main --query properties.outputs.acrName.value -o tsv)
az acr login -n "$ACR"                       # token do Entra ID → docker login, válido por ~3 h
docker build -f deploy/docker/orders.Dockerfile -t "$ACR.azurecr.io/orders:$(git rev-parse --short HEAD)" .
docker push "$ACR.azurecr.io/orders:$(git rev-parse --short HEAD)"
```

Sem Docker (ou num Mac M sem querer lidar com `--platform`), o ACR builda para você, na nuvem, em `linux/amd64`:

```bash
az acr build -r "$ACR" -t orders:$(git rev-parse --short HEAD) -f deploy/docker/orders.Dockerfile .
```

::: porque Por que `adminUserEnabled: false`
O ACR tem um "usuário admin" com usuário e senha fixos. É uma credencial compartilhada, que não diz **quem** fez o push, não expira e acaba colada num secret do CI e num `imagePullSecret`. Desligado, todo acesso é por identidade do Entra ID: você (`az acr login`), o kubelet (pull) e o pipeline (push), cada um com o papel mínimo e auditável.
:::

## Como o cluster puxa: a identidade do kubelet

Quem baixa a imagem não é o pod, é o **kubelet** do nó (lição 4.3). No AKS, o kubelet roda com uma identidade gerenciada própria (`identityProfile.kubeletidentity`), e o IaC dá a ela o papel **AcrPull** no ACR:

```bicep
resource kubeletAcrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, kubeletObjectId, acrPull)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPull)
    principalId: kubeletObjectId
    principalType: 'ServicePrincipal'
  }
}
```

É o que `az aks update --attach-acr` faz por baixo. Nenhum `imagePullSecrets` nos charts.

::: porque Por que o nome do role assignment é um `guid(...)` de três partes
O nome de um role assignment precisa ser um GUID, e o mesmo par (escopo, principal, papel) só pode existir uma vez. `guid(acr.id, kubeletObjectId, acrPull)` é **determinístico**: rodar o deploy de novo gera o mesmo nome, e o ARM entende "já existe, nada a fazer". Com `newGuid()`, cada deploy tentaria criar outro e falharia com `RoleAssignmentExists`.
:::

### Diagnosticando `ImagePullBackOff` no AKS

```bash
kubectl -n orderflow describe pod <pod> | sed -n '/Events/,$p'
```

| Mensagem nos Events | Causa |
|---|---|
| `manifest unknown` / `not found` | tag ou repositório errados (confira `az acr repository show-tags -n $ACR --repository orders`) |
| `401 Unauthorized` / `failed to authorize` | o kubelet não tem AcrPull **neste** ACR; ou o role assignment acabou de ser criado e ainda propaga (minutos) |
| `dial tcp ... i/o timeout` | rede: ACR com acesso público desligado sem Private Endpoint, ou firewall de saída |

E o comando que testa tudo de uma vez, do ponto de vista do cluster:

```bash
az aks check-acr -g rg-orderflow-lab -n aks-orderflow --acr "$ACR.azurecr.io"
```

## Tag é ponteiro, digest é conteúdo

`orders:abc1234` é um **ponteiro**: quem tem permissão de push pode apontá-lo para outra imagem amanhã. `orders@sha256:9f86d0...` é o **hash do manifesto**: se o conteúdo mudar, o digest muda. Os charts aceitam `image.digest`, que tem precedência sobre a tag:

```yaml
image:
  repository: acrorderflowxxxxxx.azurecr.io/orders
  digest: sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
```

O pipeline do Módulo 7 builda uma vez, testa aquela imagem e faz deploy **pelo digest** em dev e depois em prod: o que chega em produção é byte a byte o que passou nos testes.

::: previsao
Alguém faz `docker push` de uma imagem nova com a mesma tag `orders:abc1234` que está em produção. Os pods em execução mudam? E quando um pod for recriado (um nó novo, um restart)?
???
Os pods em execução **não mudam**: o container já está rodando a imagem baixada. Mas um pod novo num nó que ainda não tem a imagem baixa a tag **de agora**, que aponta para a imagem nova. Resultado: pods do mesmo Deployment rodando código diferente, sem nenhum deploy registrado. Com `image.digest` isso é impossível: o digest identifica o conteúdo. Um ACR Premium permite ainda bloquear sobrescrita de tags (*tag locking*).
:::

## O pipeline também sem senha

O IaC cria identidades para o GitHub Actions (usadas na lição 7.6), cada uma aceitando **um** subject:

| Identidade | Subject aceito | Papel |
|---|---|---|
| `id-orderflow-github-acrpush` | `repo:JandersonSR/orderflow:ref:refs/heads/main` | **AcrPush** no ACR |
| `id-orderflow-github-deploy-dev` | `repo:JandersonSR/orderflow:environment:dev` | Cluster User Role + RBAC Writer no AKS |
| `id-orderflow-github-deploy-prod` | `repo:JandersonSR/orderflow:environment:prod` | idem |

Os outputs `acrName`, `githubAcrPushClientId` e `githubDeployClientIds` viram as variáveis `ACR_NAME` e `AZURE_CLIENT_ID` (do repositório e de cada environment) no GitHub. São identificadores, não segredos.

::: porque Cluster User Role + RBAC Writer, e não Cluster Admin
**Cluster User Role** só permite baixar o kubeconfig; não dá poder dentro do cluster. **RBAC Writer** permite criar e alterar objetos nos namespaces (Deployments, Services, os Secrets das releases do Helm), mas **não** Roles e RoleBindings, nem namespaces. Um pipeline comprometido consegue fazer deploy de algo ruim, mas não consegue se dar mais permissão. Os namespaces são criados uma vez, por um humano (o `gateway.yaml` cria o `orderflow`). No laboratório, dev e prod apontam para o **mesmo** cluster; numa empresa, cada environment teria o seu, e a identidade de dev não teria papel nenhum no de prod.
:::

## Perguntas para responder sem olhar

::: pergunta
Como o AKS puxa imagens de um ACR sem senha?
???
O kubelet de cada nó roda com uma identidade gerenciada, e essa identidade recebe o papel AcrPull no ACR (o que `--attach-acr` faz). Sem imagePullSecrets e sem usuário admin do ACR.
:::

::: pergunta
Por que fazer deploy por digest e não por tag?
???
A tag é um ponteiro mutável; o digest é o hash do conteúdo. Por digest, o que roda é exatamente o que foi testado, todos os pods rodam o mesmo código e o rollback volta a um conteúdo conhecido.
:::

**Próxima:** [6.4 Workload Identity e Key Vault: nenhuma senha no cluster](04-workload-identity-e-key-vault.md)
