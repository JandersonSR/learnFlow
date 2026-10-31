# Perguntas de entrevista do módulo 9

Responda em voz alta antes de abrir. Perguntas de base sobre Terraform (estado, drift, plan/apply, `prevent_destroy`) estão nas [perguntas do módulo 9 da Plataforma](../../plataforma-dotnet/docs/modulo-09/perguntas-de-entrevista.md).

::: entrevista
"Desenhe a rede de um AKS de produção com banco gerenciado. O que tem IP público?"
???
Só a entrada (um IP fixo do Load Balancer na frente do Gateway) e a saída (NAT Gateway com IP fixo). Nós numa sub-rede com NSG liberando 80/443; pods em overlay, fora da VNet; Postgres injetado numa sub-rede delegada, sem IP público; demais serviços (Mongo gerenciado, cofre, storage) por Private Endpoint em outra sub-rede; zonas DNS privadas ligadas à VNet. API server com Entra ID, e em prod privado ou com faixas autorizadas.
:::

::: entrevista
"Como um pod no AKS lê um segredo do Key Vault sem ter nenhuma senha?"
???
Workload Identity: o AKS emite um token OIDC para a ServiceAccount; o Entra ID tem uma credencial federada numa identidade gerenciada que confia naquele emissor e naquele subject; o pod (ou o ESO, no nosso caso) troca o token do Kubernetes por um token da Azure e chama o cofre, que autoriza por RBAC. O único segredo é a chave de assinatura do emissor, que nunca sai do AKS.
:::

::: entrevista
"Seu estado do Terraform tem senhas?"
???
O mínimo possível: senhas geradas com `ephemeral random_password` e enviadas por argumentos write-only (`administrator_password_wo`, `value_wo`, `data_wo`), que não vão para plano nem estado. O que não tem variante write-only (no nosso caso, a senha do DocumentDB) fica no estado, e por isso o estado mora num Storage sem chave de conta, só RBAC, com versionamento. E eu trato o arquivo de estado como segredo de qualquer forma.
:::

::: entrevista
"Por que dividir o Terraform em camadas? Não é burocracia?"
???
Ritmos de mudança e raio de explosão diferentes: rede e cluster mudam pouco, a plataforma muda todo mês; um erro num chart não deve travar uma mudança de rede. E há um motivo técnico: recursos de CRD (`kubernetes_manifest`) precisam da CRD instalada no momento do plan, o que só acontece se ela vier de uma camada aplicada antes. O custo é a ordem de aplicação e PRs em sequência quando uma mudança cruza camadas.
:::

::: entrevista
"Acesso privado do Postgres Flexible ou Private Endpoint?"
???
Acesso privado injeta o servidor numa sub-rede delegada e é escolhido na criação, sem volta. Private Endpoint coloca uma placa na sua sub-rede que encaminha para o serviço e pode ser adicionado depois. Para o Flexible, a escolha certa depende da topologia (hub-spoke, DNS central); para um ambiente novo e simples, o acesso privado é direto. O erro caro é começar público "por enquanto".
:::

::: entrevista
"Como você atualiza um AKS de produção sem derrubar a aplicação?"
???
Canal de patch automático e imagem de nó semanal numa janela de manutenção; versão menor atualizada por PR, primeiro em dev. Do lado da aplicação: PDBs, rolling update com `maxUnavailable: 0`, preStop e graceful shutdown, réplicas espalhadas por zona; do lado do pool: `max_surge` para subir nós antes de drenar e `drain_timeout` para um PDB mal configurado não travar tudo.
:::

::: entrevista
"Por que você não usou o add-on de App Routing do AKS?"
???
Porque a implementação NGINX dele só recebe correções críticas até novembro de 2026, depois que o ingress-nginx da comunidade foi aposentado em março. Fui de Gateway API com Envoy Gateway, que é a mesma peça no kind e no AKS; a API é padrão, então trocar para a implementação gerenciada (o App Routing com Gateway API) depois não muda as rotas.
:::

::: entrevista
"Quanto custa o seu ambiente, e como você reduziria?"
???
Dev na faixa de algumas centenas de dólares por mês ligado 24 h; prod de 1.500 a 2.500, puxado por nós, HA dos bancos (que dobra a computação) e o SLA do AKS. Reduzir em dev: Spot no pool de apps, desligar o cluster e o Postgres fora do horário, SKUs burstáveis. Em prod: reservas de 1 a 3 anos para os nós base, autoescala de nós, e conferir se o HA de cada componente compensa o RTO que ele compra.
:::

::: entrevista
"O que mudou no azurerm 5 que te pegou?"
???
`node_provisioning_profile` obrigatório no AKS, registro de provedores de recurso desligado por padrão (precisa listar), `rbac_authorization_enabled` obrigatório no Key Vault, `parent_id` removido da credencial federada, e várias propriedades renomeadas para `*_id`. Li o guia de atualização e deixei o `plan` mostrar o resto, com a versão fixada em `~> 5.12`.
:::
