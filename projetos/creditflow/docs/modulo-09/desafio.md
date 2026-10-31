# Desafio do módulo 9: endurecer produção

O ambiente dev do CreditFlow está bom para estudar. A área de segurança de uma fintech leu o Terraform e devolveu três apontamentos para **prod**. Resolva os três sem quebrar o pipeline de CI.

::: desafio Os apontamentos
1. **"O API server do AKS está na internet."** Mesmo com Entra ID, querem o plano de controle sem endpoint público.
2. **"O Key Vault aceita conexão de qualquer IP."** Querem `default_action = "Deny"` e acesso só pela VNet.
3. **"A aplicação usa a senha do administrador do DocumentDB."** Querem um usuário com acesso só ao banco `creditflow`.

Para cada um: a mudança no Terraform (ou fora dele, se for o caso), o efeito no CI, no Argo CD e no ESO, e o que deixa de funcionar se você fizer só metade.
:::

## Critérios de aceite

- [ ] `terraform plan` de prod mostra as mudanças e você explica quais **recriam** recursos (e o que isso significa para os dados).
- [ ] Um diagrama (mermaid) de por onde o `terraform apply` da camada 20 alcança o API server depois da mudança 1.
- [ ] O ESO continua lendo o cofre depois da mudança 2 (prove com `kubectl get clustersecretstore azure-kv -o jsonpath='{.status.conditions}'`), e o job de apply do CI continua gravando segredos.
- [ ] Mudança 3: o novo usuário existe, o segredo `mongo-connection-string` aponta para ele, e você mostrou que ele **não** consegue ler outro banco.
- [ ] Um parágrafo de custo: quanto cada mudança acrescenta por mês.

::: dica Dica 1
Cluster privado e Key Vault com `Deny` têm o mesmo efeito colateral: o runner hospedado do GitHub, que está na internet, deixa de alcançar os dois. As saídas são um runner self-hosted dentro da VNet (por exemplo, em Azure Container Apps Jobs ou numa VM pequena), ou o comando `az aks command invoke` para o cluster. Escolha uma e justifique.
:::

::: dica Dica 2
O ESO roda **dentro** do cluster: com um Private Endpoint do Key Vault na `snet-endpoints` e a zona `privatelink.vaultcore.azure.net` ligada à VNet, ele continua chegando. Quem perde acesso é quem está fora.
:::

::: solucao Uma solução possível
1. `private_cluster_enabled = true` **recria o cluster** (dados no Kafka e PVs vão junto: faça antes de ter dados, ou restaure). Alternativa sem recriar: `api_server_access_profile { authorized_ip_ranges = [<IP do runner self-hosted/NAT>] }`, que restringe sem tornar privado. Para as camadas 20/30, runner self-hosted na VNet; o Argo CD não muda (ele está dentro).
2. `network_acls { default_action = "Deny", bypass = "AzureServices" }`, `public_network_access_enabled = false`, `azurerm_private_endpoint` com `subresource_names = ["vault"]` + zona `privatelink.vaultcore.azure.net`. O apply da 10 precisa rodar do runner na VNet (ele grava segredos).
3. Fora do Terraform (o provider só cria usuário Entra ID com `root`): um Job único com `mongosh` usando a credencial admin, `db.getSiblingDB("creditflow").createUser({user: "creditflow_app", pwd: ..., roles: [{role: "readWrite", db: "creditflow"}]})`, senha gerada e gravada no cofre; o segredo `mongo-connection-string` passa a ser composto pelo ExternalSecret (host + usuário + senha). Confira na documentação do DocumentDB os papéis suportados antes de usar.
Custo: Private Endpoint ~US$ 7/mês cada + dados; runner self-hosted o custo da VM/execuções.
:::
