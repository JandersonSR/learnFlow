# 9.2 O AKS, argumento por argumento

O [`aks.tf`](https://github.com/JandersonSR/lending-plataform/blob/main/infra/terraform/10-azure/aks.tf) tem uns 100 linhas. Cada argumento é uma decisão que você vai ter que defender numa revisão de arquitetura. Esta lição percorre as que importam.

::: video Kubernetes explained in 15 mins (TechWorld with Nana, em inglês)
https://www.youtube.com/watch?v=VnvRFRk_51k
Se plano de controle e nó ainda se confundem, reveja antes.
:::

## azurerm 5.x: o que mudou

O provider `azurerm` 5.0 trouxe mudanças que quebram configurações antigas. As que aparecem no CreditFlow:

| Mudança | Efeito no código |
|---|---|
| `node_provisioning_profile` passou a ser **obrigatório** no `azurerm_kubernetes_cluster` | `node_provisioning_profile { mode = "Manual" }`: pools declarados por nós, sem Node Auto Provisioning |
| `oidc_issuer_enabled` agora é `true` por padrão | Deixamos explícito mesmo assim: é requisito do Workload Identity |
| Registro de provedores de recurso desligado por padrão | `resource_providers_to_register = [...]` no bloco `provider`, só os que a camada usa |
| `azurerm_federated_identity_credential`: `parent_id` removido | Usamos `user_assigned_identity_id` |
| `azurerm_key_vault`: `rbac_authorization_enabled` obrigatório | `true`: autorização por Azure RBAC, sem access policies |
| `azurerm_storage_container`: `storage_account_name` removido | `storage_account_id` |

::: dica
Antes de subir a versão maior de um provider, leia o guia de atualização dele (para o azurerm, o `5.0-upgrade-guide`) e rode `terraform plan`: o plan mostra tudo que mudaria. Fixe a versão com `~> 5.12` (aceita 5.12.x, 5.13..., não 6.0).
:::

## Identidade do cluster e de quem administra

```hcl
identity {
  type         = "UserAssigned"
  identity_ids = [azurerm_user_assigned_identity.aks.id]
}

local_account_disabled = true
azure_active_directory_role_based_access_control {
  azure_rbac_enabled = true
  tenant_id          = data.azurerm_client_config.atual.tenant_id
}
```

| Escolha | Por quê |
|---|---|
| Identidade do plano de controle **atribuída pelo usuário** | Ela existe antes do cluster, então dá para conceder `Network Contributor` (sub-rede, IP público) **antes** do `create`. Com identidade do sistema, a permissão só pode ser dada depois, e o primeiro create pode falhar |
| `local_account_disabled = true` | Não existe kubeconfig "admin" com certificado que nunca expira. Todo acesso é um usuário ou identidade do Entra ID, auditável e revogável |
| Azure RBAC | Permissão no cluster vira atribuição de papel na Azure (`Azure Kubernetes Service RBAC Cluster Admin`, `... Reader`), no mesmo lugar das outras |

Consequência prática: `az aks get-credentials` gera um kubeconfig que chama o **kubelogin** para pegar um token do Entra ID. É por isso que os providers `helm` e `kubernetes` da camada 20 usam um bloco `exec` com `kubelogin get-token --login azurecli`, e o CI instala o kubelogin.

::: armadilha
Com conta local desligada, se ninguém estiver em `administradores_aks` (ou o grupo for apagado), ninguém administra o cluster. Coloque um **grupo** do Entra ID, não um usuário, e mais de uma pessoa nele.
:::

## Workload Identity: as duas linhas que habilitam tudo

```hcl
oidc_issuer_enabled       = true
workload_identity_enabled = true
```

A primeira faz o AKS publicar um **emissor OIDC** público (a URL vai para o output `oidc_issuer_url`): é ele que assina os tokens das ServiceAccounts, e o Entra ID consegue baixar as chaves públicas para conferir. A segunda instala o webhook que injeta, nos pods com o rótulo `azure.workload.identity/use: "true"`, o token projetado e as variáveis `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_FEDERATED_TOKEN_FILE`. A lição 9.4 abre o fluxo inteiro.

## Atualizações

```hcl
automatic_upgrade_channel = "patch"
node_os_upgrade_channel   = "NodeImage"
kubernetes_version        = "1.36"
```

- **Versão menor** (`1.36`) é decisão sua: o AKS escolhe o patch GA mais novo dela. Em out/2026 o AKS suporta 1.35, 1.36 e 1.37 (N-2); o projeto usa N-1 para não ser o primeiro a pegar regressão de uma versão nova. Confira na sua região com `az aks get-versions -l brazilsouth -o table`.
- **Patch** automático: correções de segurança dentro da 1.36 sem você fazer nada.
- **Imagem do nó** semanal: o SO dos nós (Azure Linux) é trocado por uma imagem nova, nó por nó.

Atualizar nó = drenar pods. É aqui que as escolhas do módulo 7 pagam: PDB com `minAvailable: 1`, `maxUnavailable: 0` no rolling update, preStop e `terminationGracePeriod` fazem uma manutenção da Azure às 3 da manhã não derrubar nada.

```hcl
upgrade_settings {
  max_surge                = "33%"   # sobe nós novos antes de drenar os velhos
  drain_timeout_in_minutes = 30      # um PDB que nunca libera não trava para sempre
}
```

## Pools de nós

| Pool | Para quê | Detalhes |
|---|---|---|
| `sistema` (`default_node_pool`) | CoreDNS, metrics-server, Konnectivity, CSI | Em prod, `only_critical_addons_enabled = true` coloca o taint `CriticalAddonsOnly`: só pods de sistema rodam ali. Um vazamento de memória da aplicação não derruba o DNS do cluster |
| `apps` | Tudo o mais | Autoescala de nós (`min_count`/`max_count`). Em dev, **Spot**: VMs ociosas da Azure com até ~80-90% de desconto, que podem ser retomadas com 30 s de aviso |

::: previsao
Em dev, o pool `apps` é Spot. A Azure retoma as VMs no meio de um teste. O que acontece com o Kafka (Strimzi) e com o Postgres?
???
O **Postgres** não está no cluster (é o Flexible Server): nada acontece. O **Kafka**, sim: os brokers são pods num StatefulSet; quando o nó some, os pods vão para outro nó (quando houver capacidade) e reanexam os discos (PVs de disco gerenciado, que sobrevivem ao nó). Em dev, com um broker só e replicação 1, o Kafka fica fora até o pod voltar; as mensagens não se perdem (estão no disco), mas o worker fica parado. É um bom game day gratuito. Em prod, sem Spot e com 3 brokers em 3 zonas, a perda de um nó não para nada.
:::

## O que **não** está habilitado, e por quê

| Recurso | Por que não |
|---|---|
| `oms_agent` (Container Insights) e `monitor_metrics` (Managed Prometheus) | O CreditFlow tem a própria pilha (OpenTelemetry + Prometheus + Loki + Tempo, módulo 12). Ligar os dois duplica custo de ingestão. Num time que já usa Azure Monitor, a escolha seria o contrário |
| `key_vault_secrets_provider` (driver CSI) | Os segredos chegam pelo External Secrets (lição 9.4). Os dois resolvem o mesmo problema; usar ambos é confusão |
| `web_app_routing` (App Routing) | Gateway API com Envoy Gateway (lição 9.1) |
| `workload_autoscaler_profile.keda_enabled` (KEDA gerenciado) | O KEDA vem por Helm com versão escolhida por nós, igual no kind. O add-on é uma alternativa válida; a troca custa pouco |
| `private_cluster_enabled` | Um API server privado exige runner do CI dentro da VNet (ou ponte). Fica como endurecimento de prod, discutido no desafio |

## Perguntas para responder sem olhar

::: pergunta
Por que desligar as contas locais do AKS, e o que isso exige de quem usa o cluster?
???
Para que todo acesso seja por Entra ID: auditável, revogável, sem certificado admin eterno. Exige kubelogin no kubectl, no Helm e no Terraform, e pelo menos um grupo com o papel de administrador do cluster.
:::

::: pergunta
O que fazem `oidc_issuer_enabled` e `workload_identity_enabled`?
???
O primeiro publica um emissor OIDC para os tokens das ServiceAccounts, que o Entra ID usa para confiar neles. O segundo instala o webhook que injeta o token e as variáveis de identidade nos pods marcados.
:::

::: pergunta
Para que serve `only_critical_addons_enabled` no pool de sistema?
???
Coloca um taint que impede pods comuns de rodar nos nós de sistema, isolando CoreDNS e outros componentes críticos da carga da aplicação.
:::

**Próxima:** [9.3 Dados privados](03-dados-privados.md).
