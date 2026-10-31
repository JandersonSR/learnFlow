# 9.3 Dados privados: Postgres Flexible e DocumentDB

Os dois bancos gerenciados do CreditFlow ficam **sem IP público**, mas por dois mecanismos diferentes. Entender a diferença evita uma tarde perdida com "o pod não conecta".

## Dois jeitos de um serviço gerenciado entrar na sua VNet

| | Injeção na VNet (Postgres Flexible "acesso privado") | Private Endpoint (DocumentDB, Key Vault, Storage...) |
|---|---|---|
| O que acontece | O **servidor** ganha uma placa de rede dentro de uma sub-rede sua, delegada a ele | Uma placa de rede na sua sub-rede encaminha para o serviço, que continua na rede da Microsoft |
| Sub-rede | Dedicada e delegada (`snet-postgres`) | Qualquer sub-rede comum (`snet-endpoints`), várias PEs juntas |
| DNS | Zona privada `*.postgres.database.azure.com` sua | Zona `privatelink.<serviço>` padronizada |
| Mudar depois | **Não dá**: acesso público ↔ privado é decisão de criação | Adiciona/remove PE a qualquer momento |
| Acesso de fora da VNet | Só por peering/VPN | Só por peering/VPN (com acesso público desligado) |

::: armadilha
O modo de rede do Postgres Flexible (público com firewall x privado por injeção) **não muda** depois da criação. Escolher "público, por enquanto" em dev e "privado" em prod significa ter dois ambientes que se comportam diferente justamente na parte que mais quebra. O CreditFlow usa privado nos dois.
:::

## O Postgres Flexible, linha por linha

[`postgres.tf`](https://github.com/JandersonSR/lending-plataform/blob/main/infra/terraform/10-azure/postgres.tf):

```hcl
resource "azurerm_postgresql_flexible_server" "pg" {
  version  = "17"
  sku_name = var.postgres.sku            # dev B_Standard_B1ms, prod GP_Standard_D2ds_v5

  delegated_subnet_id           = azurerm_subnet.postgres.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id
  public_network_access_enabled = false

  administrator_login               = "cfadmin"
  administrator_password_wo         = ephemeral.random_password.postgres_admin.result
  administrator_password_wo_version = var.versao_senhas

  dynamic "high_availability" {
    for_each = var.postgres.ha ? [1] : []
    content { mode = "ZoneRedundant" }
  }
  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
}
```

| Trecho | Por quê |
|---|---|
| Versão 17, igual no `docker compose` e no kind | Paridade: um comportamento do 18 que não existe no 17 não aparece só em produção |
| `B_Standard_B1ms` em dev | Burstável, ~1 vCore e 2 GiB: barato, com créditos de CPU. Aguenta o laboratório, não aguenta teste de carga |
| `GP_Standard_D2ds_v5` + HA `ZoneRedundant` em prod | Um réplica síncrona em outra zona; failover automático em 1 a 2 minutos. Dobra o custo de computação |
| `depends_on` do link DNS | O servidor valida a zona DNS na criação. Sem o link pronto, o `create` falha com um erro pouco claro |
| `administrator_password_wo` | **Write-only**: a lição 9.4 explica |
| `lifecycle.ignore_changes = [zone, ...]` | Depois de um failover, a zona primária troca. Sem isso, o próximo `plan` quer "corrigir" e forçar outro failover |

Três bancos no mesmo servidor (`azurerm_postgresql_flexible_server_database`): `creditflow` (um schema por módulo, módulo 4), `keycloak` e `harbor_registry`. Num ambiente maior, o Keycloak ganharia servidor próprio: um pico de logins não deveria competir com as propostas.

::: previsao
O B1ms tem um limite baixo de conexões. O CreditFlow em dev tem 4 perfis com 1 a 3 réplicas, cada pod com `Maximum Pool Size=40`, mais o Keycloak (pool de até 20 por instância) e o Harbor. O que acontece num pico, e o que você mudaria?
???
A soma dos pools **máximos** passa fácil do limite de conexões do servidor: 6 pods de aplicação × 40 já são 240. No pico, os pods abrem conexões até o servidor recusar com `too many connections`, e os erros aparecem nos perfis que abriram por último, não necessariamente nos que causaram. Saídas: reduzir `Maximum Pool Size` por perfil (o api-simulacao nem usa Postgres), um pooler (o **PgBouncer embutido** do Flexible Server, ativado por parâmetro do servidor) e, em prod, um SKU maior. Visto em detalhe na lição [3.4 da Plataforma](../../plataforma-dotnet/docs/modulo-03/04-concorrencia-e-conexoes.md).
:::

## O MongoDB: Azure DocumentDB

O CreditFlow usa MongoDB para o histórico de simulações e as notificações (ADR 0004). Na Azure, a decisão entre **Azure DocumentDB** (o antigo Cosmos DB for MongoDB vCore), **MongoDB Atlas** rodando na Azure e um **operador no cluster** está na [ADR 0010](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0010-mongodb-na-azure.md). Leia a ADR inteira; o resumo:

| Critério | Peso no CreditFlow | Vencedor |
|---|---|---|
| Operação (backup, upgrade, failover) para um time pequeno | alto | DocumentDB ou Atlas |
| Fatura e contrato únicos na Azure, mesmo provider Terraform | alto | DocumentDB |
| Compatibilidade total com o MongoDB | médio (só CRUD e índices) | Atlas ou operador |
| Custo em dev | médio | operador, depois DocumentDB M10/Atlas Flex |

```hcl
resource "azurerm_mongo_cluster" "mongo" {
  compute_tier           = var.documentdb.tier          # M10 dev, M30 prod
  high_availability_mode = var.documentdb.ha ? "ZoneRedundantPreferred" : "Disabled"
  version                = "8.0"
  public_network_access  = "Disabled"
}

resource "azurerm_private_endpoint" "mongo" {
  subnet_id = azurerm_subnet.endpoints.id
  private_service_connection {
    private_connection_resource_id = azurerm_mongo_cluster.mongo.id
    subresource_names              = ["MongoCluster"]
    is_manual_connection           = false
  }
  private_dns_zone_group {
    name                 = "docdb"
    private_dns_zone_ids = [azurerm_private_dns_zone.documentdb.id]
  }
}
```

O `private_dns_zone_group` faz a Azure criar e manter o registro A na zona `privatelink.mongocluster.cosmos.azure.com`. O nome público do cluster vira, por CNAME, um nome dessa zona, que dentro da VNet resolve para o IP do endpoint.

::: porque Por que o laboratório local continua com `mongo:8.0`
O código só fala o protocolo MongoDB pelo driver. Os testes de integração (Testcontainers) e o kind usam o MongoDB oficial. A diferença de compatibilidade do DocumentDB é coberta por um teste de fumaça contra o DocumentDB real no ambiente dev. Se um dia o código usar change streams ou Atlas Search, a ADR 0010 manda reavaliar.
:::

::: armadilha A senha do DocumentDB vai para o estado
`azurerm_mongo_cluster` não tem senha write-only, e a connection string exportada já vem com a senha. Ela fica no estado do Terraform. A mitigação é o estado num Storage sem chave de conta e com RBAC (lição 9.5); a correção é autenticação por Entra ID, que hoje o recurso de usuário do provider só oferece com papel `root`. A ADR registra isso como dívida conhecida, com o próximo passo.
:::

## Perguntas para responder sem olhar

::: pergunta
Qual a diferença entre o acesso privado do Postgres Flexible e um Private Endpoint?
???
No acesso privado o servidor é injetado numa sub-rede delegada e dedicada da sua VNet, e isso é definido na criação. No Private Endpoint uma placa de rede na sua sub-rede encaminha para o serviço, que continua fora; pode ser adicionado depois e várias PEs dividem a mesma sub-rede.
:::

::: pergunta
Por que o servidor Postgres tem `depends_on` no link da zona DNS?
???
Porque a criação do servidor com acesso privado valida a zona DNS ligada à VNet; sem o link pronto, o create falha.
:::

::: pergunta
Por que DocumentDB e não Atlas no CreditFlow?
???
Operação zero, mesma fatura e contrato da Azure, mesmo provider Terraform e mesma rede privada; o uso do CreditFlow (CRUD e índices simples) está no centro da compatibilidade do DocumentDB. Atlas seria a escolha com change streams, Search ou necessidade de compatibilidade total.
:::

**Próxima:** [9.4 Key Vault e Workload Identity por dentro](04-key-vault-e-workload-identity.md).
