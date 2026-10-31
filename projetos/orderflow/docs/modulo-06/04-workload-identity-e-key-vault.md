# 6.4 Workload Identity e Key Vault: nenhuma senha no cluster

Arquivos: [`infra/bicep/modules/workload-identity.bicep`](../../infra/bicep/modules/workload-identity.bicep), [`infra/bicep/modules/keyvault.bicep`](../../infra/bicep/modules/keyvault.bicep), templates `serviceaccount.yaml` e `secretproviderclass.yaml`, `values-dev.yaml`/`values-prod.yaml`

O problema clássico: para ler um segredo do Key Vault, a aplicação precisa se autenticar no Entra ID. Com quê? Se for com um *client secret*, você tem um segredo para proteger o acesso aos segredos, e ele vai parar num Secret do Kubernetes, que é base64 (lição 4.5). O Workload Identity corta esse círculo: **o pod prova quem é com o token do próprio ServiceAccount**, e o Entra ID troca esse token por um token do Azure.

## Como funciona a troca

```mermaid
sequenceDiagram
    participant Pod as pod orders (SA orders)
    participant K as kubelet
    participant AAD as Entra ID
    participant OIDC as emissor OIDC do AKS<br/>(URL pública)
    participant KV as Key Vault

    K->>Pod: projeta um token do ServiceAccount<br/>iss=<issuer do cluster>, sub=system:serviceaccount:orderflow:orders,<br/>aud=api://AzureADTokenExchange (expira em ~1 h, renovado)
    Pod->>AAD: "sou o client-id X; aqui está meu token" (client assertion)
    AAD->>OIDC: busca as chaves públicas do emissor
    AAD->>AAD: assinatura válida? issuer + subject + audience batem com<br/>uma credencial federada da identidade X?
    AAD-->>Pod: token de acesso do Azure (como a identidade X)
    Pod->>KV: GET segredo (Bearer token)
    KV->>KV: X tem "Key Vault Secrets User"? → 200
```

As peças, e onde cada uma está no código:

| Peça | Onde | O que faz |
|---|---|---|
| Emissor OIDC do cluster | `oidcIssuerProfile.enabled` (Bicep) | publica as chaves públicas que validam os tokens dos ServiceAccounts |
| Webhook do Workload Identity | `securityProfile.workloadIdentity.enabled` | em pods com o rótulo `azure.workload.identity/use: "true"`, injeta o token projetado e as variáveis `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_FEDERATED_TOKEN_FILE`, `AZURE_AUTHORITY_HOST` |
| Identidade gerenciada | `id-orderflow-orders` | a "conta" do Azure que o pod vai assumir |
| Credencial federada | `subject: system:serviceaccount:orderflow:orders` | a regra de confiança: **só** esse ServiceAccount, deste cluster |
| Anotação no ServiceAccount | `azure.workload.identity/client-id` (chart) | diz qual identidade o SA representa |
| Papel | `Key Vault Secrets User` no vault | o que a identidade pode fazer |

::: porque Por que a confiança é por ServiceAccount, e não por pod ou namespace
O subject inclui namespace **e** nome do ServiceAccount. Um pod do Payments (SA `payments`) no mesmo namespace recebe um token com outro subject, e o Entra ID recusa a troca pela identidade do Orders. Um atacante que consiga criar um pod qualquer no namespace só assume a identidade do Orders se puder usar o SA `orders`, e isso é controlado pelo RBAC do Kubernetes. Por isso cada serviço tem **seu** SA e **sua** identidade, e nenhum usa o SA `default`.
:::

## Duas formas de o segredo chegar à aplicação

| | **CSI driver** (este curso) | **SDK na aplicação** |
|---|---|---|
| Como | o add-on monta os segredos como arquivos e (opcional) sincroniza um Secret do Kubernetes | `Azure.Extensions.AspNetCore.Configuration.Secrets` (.NET) ou Spring Cloud Azure (Java) leem o Key Vault na subida |
| Código da aplicação | nenhum: continua lendo variável de ambiente | uma dependência e configuração por stack |
| Rotação | arquivos atualizam sozinhos (`rotationPollInterval: 2m`); **variáveis de ambiente não** | a aplicação recarrega se você programar |
| Segredo no etcd | sim, se usar `secretObjects` | não |
| Pod sobe sem Key Vault? | não: o volume não monta e o pod fica em `ContainerCreating` | depende do código |

Escolhemos o **CSI driver com `secretObjects`** porque os dois serviços, em duas linguagens, continuam iguais ao Módulo 4: leem `ConnectionStrings__Orders` e `SPRING_DATASOURCE_PASSWORD` de variáveis. A configuração muda; o código não. O custo, assumido: o valor também fica num Secret do Kubernetes, e rotação exige restart.

O `SecretProviderClass` que o chart gera (com `keyVault.enabled`):

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
spec:
  provider: azure
  parameters:
    usePodIdentity: "false"
    clientID: "<client id da identidade do orders>"
    keyvaultName: "kv-orderflow-xxxxxx"
    tenantId: "<tenant>"
    objects: |
      array:
        - |
          objectName: orders-db-connection
          objectType: secret
  secretObjects:
    - secretName: orders-kv
      type: Opaque
      data:
        - objectName: orders-db-connection
          key: ConnectionStrings__Orders
```

::: armadilha Sem volume montado, sem Secret sincronizado
O `secretObjects` só cria o Secret `orders-kv` quando **algum pod monta** o volume CSI. Se você tirar o volume do Deployment achando que "só precisa do Secret", o Secret nunca é criado, o `envFrom` aponta para algo que não existe e o pod fica em `CreateContainerConfigError`. Por isso o template do Deployment monta o volume em `/mnt/secrets-store` mesmo sem a aplicação ler os arquivos.
:::

::: armadilha Rotação que não chega
Você roda `az keyvault secret set` com a senha nova. Em até 2 minutos o arquivo em `/mnt/secrets-store` e o Secret `orders-kv` estão atualizados. A aplicação continua com a **antiga**: variável de ambiente é lida quando o processo nasce. Opções: `kubectl rollout restart` como parte do procedimento de rotação; uma ferramenta como o Reloader (reinicia pods quando um Secret muda); ou ler de arquivo e recarregar (no .NET, `AddKeyPerFile` com `reloadOnChange`). Escreva isso no runbook de rotação (Módulo 7) antes do dia em que a senha vazar.
:::

## Fazendo funcionar

```bash
KV=$(az deployment group show -g rg-orderflow-lab -n main --query properties.outputs.keyVaultName.value -o tsv)

# 1. gravar os segredos (você tem "Key Vault Secrets Officer" pelo Bicep)
az keyvault secret set --vault-name "$KV" -n orders-db-connection \
  --value "Host=postgres.infra.svc.cluster.local;Port=5432;Database=orders;Username=orders;Password=orders-dev"
az keyvault secret set --vault-name "$KV" -n payments-db-password --value payments-dev

# 2. preencher os <PREENCHER> do values-dev.yaml com os outputs (client ids, vault, tenant)
# 3. instalar
helm upgrade --install orders deploy/helm/orders -n orderflow -f deploy/helm/orders/values-dev.yaml \
  --set-string image.repository="$ACR.azurecr.io/orders" --set-string image.tag=<sha> --wait

# 4. conferir
kubectl -n orderflow get secret orders-kv
kubectl -n orderflow exec deploy/orders -- ls /mnt/secrets-store
```

::: quebra Lab: o subject errado
Mude, só no Bicep (ou Terraform), o `serviceAccount` do workload `orders` para `orders-api`, aplique, e reinicie o Orders (`kubectl -n orderflow rollout restart deploy/orders`). Onde aparece o erro, e qual é a mensagem?
:::

::: solucao
O pod fica em `ContainerCreating`. `kubectl describe pod` mostra um evento `FailedMount` do volume `secrets-store`, com um erro do Entra ID **AADSTS700213** ("No matching federated identity record found for presented assertion subject 'system:serviceaccount:orderflow:orders'"). A mensagem traz o subject que **chegou**; compare com o que a credencial federada espera (`az identity federated-credential list`). Os pods antigos continuam rodando (o rollout não avança, `maxUnavailable: 0`), então não há indisponibilidade, só um deploy travado. Desfaça o IaC.
:::

::: video Protecting Secrets in AKS with the Key Vault CSI Driver and Workload Identity (em inglês)
https://www.youtube.com/watch?v=Xr6mHiki9yc
A mesma montagem desta lição: identidade, credencial federada, SecretProviderClass e o pod lendo o segredo.
:::

## Key Vault: dois detalhes de configuração

- **`enableRbacAuthorization: true`**: permissões por role assignment (auditável, igual a qualquer recurso), em vez de *access policies* (modelo antigo, específico do Key Vault). Consequência: nem o dono da assinatura lê segredos sem um papel de **plano de dados** como `Key Vault Secrets Officer`.
- **Soft delete de 7 dias e purge protection desligada**: no laboratório, para você poder recriar um vault com o mesmo nome. Em produção, **ligue** a purge protection: ela impede que alguém (ou um `terraform destroy` errado) apague os segredos de forma irreversível.

## Perguntas para responder sem olhar

::: pergunta
Explique o Workload Identity do AKS em uma frase, e depois em detalhe.
???
O pod troca o token do seu ServiceAccount, emitido pelo cluster, por um token do Entra ID de uma identidade gerenciada, sem nenhuma senha. Em detalhe: o cluster publica um emissor OIDC; uma credencial federada na identidade diz que tokens daquele emissor com subject `system:serviceaccount:ns:sa` e audiência `api://AzureADTokenExchange` valem como ela; o webhook injeta o token projetado e as variáveis no pod rotulado; o SDK (ou o CSI driver) faz a troca; o acesso a recursos é dado por papéis do Azure à identidade.
:::

::: pergunta
CSI driver ou SDK para ler segredos do Key Vault?
???
CSI driver quando quero o código da aplicação igual em todos os ambientes, lendo variáveis ou arquivos, e várias stacks; o custo é o segredo sincronizado no etcd (se usar secretObjects) e rotação que exige restart para variáveis. SDK quando quero recarregar sem restart e não ter o segredo no cluster; o custo é código e configuração por linguagem e a aplicação depender do Key Vault na subida.
:::

**Próxima:** [6.5 A entrada: Gateway API do App Routing, e a rede por dentro](05-gateway-api-e-rede.md)
