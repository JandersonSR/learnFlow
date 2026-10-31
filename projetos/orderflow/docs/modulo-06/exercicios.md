# Módulo 6: Exercícios

Cada exercício é um commit. **Destrua o resource group ao fim de cada sessão.**

## Exercício 1: Do zero ao Gateway respondendo

Siga o roteiro do README do módulo com o **Bicep**. Depois destrua tudo e repita com o
**Terraform**.

**Aceite:** `curl http://<GW_IP>/orders?page=1` responde 200 nas duas vezes; `what-if` e `plan`
de uma segunda execução sem mudanças mostram **zero** alterações (anote no `NOTAS.md` qualquer
diferença que aparecer e a causa); a lista do que você precisou corrigir no IaC, se algo divergiu.

## Exercício 2: Provar que não há senha

Mostre, com comandos e saídas no `NOTAS.md`, que:

1. o ACR não tem usuário admin e o cluster não tem `imagePullSecrets`;
2. o pod do Orders recebeu `AZURE_CLIENT_ID` e `AZURE_FEDERATED_TOKEN_FILE` do webhook;
3. o token em `AZURE_FEDERATED_TOKEN_FILE` tem `sub=system:serviceaccount:orderflow:orders`
   (decodifique o JWT; **não** cole o token inteiro em lugar nenhum);
4. o Payments **não** consegue ler o segredo do Orders (dica: um pod com o SA `payments` e a
   CLI do Azure fazendo login com o token federado).

**Aceite:** os quatro itens comprovados.

## Exercício 3: Menor privilégio no Key Vault

Hoje cada identidade tem `Key Vault Secrets User` no vault inteiro. Mude para role assignments
no escopo de **cada segredo** (`Microsoft.KeyVault/vaults/secrets`), no Bicep e no Terraform.

**Aceite:** o Orders lê `orders-db-connection` e recebe 403 em `payments-db-password`; os dois
IaC continuam gerando o mesmo resultado.

## Exercício 4: Um usuário só para o KEDA

Crie um `KafkaUser` `keda` com apenas `Describe` em tópicos e grupos e troque o
`TriggerAuthentication` do chart para usá-lo.

**Aceite:** o KEDA continua escalando com lag (prove gerando pedidos com o Payments parado);
com as credenciais do `keda`, um `kafka-console-consumer` é recusado.

## Exercício 5: Postgres gerenciado com Entra ID

Acrescente um Azure Database for PostgreSQL Flexible Server ao IaC (Bicep e Terraform), com
autenticação pelo **Entra ID** para as identidades dos workloads (sem senha de banco), e aponte
os serviços para ele.

**Aceite:** nenhum segredo de banco no Key Vault; o Npgsql e o driver JDBC obtêm token pela
identidade federada; o `values-dev.yaml` sem `ConnectionStrings` com senha. No `NOTAS.md`: o
que mudou no código de cada stack e como o token é renovado.

---

## 🧩 Desafio sem roteiro: HTTPS com certificado do Key Vault e DNS

Exponha o OrderFlow em `https://orderflow.<seu-domínio>` usando a Gateway API do App Routing,
com o certificado guardado no Key Vault e o registro DNS numa zona do Azure DNS.

**Critérios de aceite:**

- Listener HTTPS no Gateway; HTTP redireciona para HTTPS (301) por uma regra da Gateway API,
  não pela aplicação.
- O certificado nunca passa pela sua máquina depois de criado no Key Vault (nada de
  `kubectl create secret tls` com arquivo local).
- Zona DNS e permissões no IaC (Bicep **ou** Terraform, sua escolha justificada).
- `curl -v` mostra a cadeia válida; um teste comprova que `/actuator` e `/health` continuam
  inacessíveis por fora.
- No `NOTAS.md`: como a renovação do certificado chega ao Gateway e quanto tempo leva, e o que
  você faria diferente com o Application Gateway for Containers.
