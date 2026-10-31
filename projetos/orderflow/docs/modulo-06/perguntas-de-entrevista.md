# Módulo 6: Perguntas de entrevista

Responda **em voz alta** antes de abrir. Decisão, motivo e custo.

::: entrevista
"Como uma aplicação no AKS acessa o Key Vault sem guardar senha?"
???
Com Workload Identity. O cluster tem um emissor OIDC; crio uma identidade gerenciada e uma credencial federada que confia em tokens desse emissor para o subject `system:serviceaccount:<ns>:<sa>`. O ServiceAccount do pod é anotado com o client-id e o pod rotulado; o webhook injeta o token projetado, e o SDK ou o CSI driver troca por um token do Entra ID. A identidade tem só `Key Vault Secrets User`, de preferência no escopo do segredo. Nenhum segredo existe para proteger o acesso aos segredos.
:::

::: entrevista
"CSI driver do Key Vault ou SDK na aplicação?"
???
CSI quando quero a aplicação igual em qualquer ambiente, lendo variáveis ou arquivos, principalmente com várias stacks. Custos: com secretObjects o valor também fica num Secret do Kubernetes, e variável de ambiente não acompanha rotação sem restart. SDK quando preciso recarregar em tempo real ou não quero o segredo no etcd; custo: código e configuração por linguagem, e a subida depende do Key Vault.
:::

::: entrevista
"Bicep ou Terraform?"
???
A diferença central é o estado: o Bicep compara com o próprio Azure, sem arquivo; o Terraform mantém um estado que precisa de backend remoto com lock e contém segredos, mas apaga o que sai do código, gerencia outras nuvens e SaaS e tem um ecossistema enorme. Bicep tem suporte a recursos novos no dia do lançamento; no Terraform às vezes preciso do azapi. Só Azure e time .NET: Bicep. Multi-nuvem, GitHub e DNS externos ou empresa já padronizada: Terraform. Consistência com o que o time já usa pesa mais que preferência.
:::

::: entrevista
"Que ingress você usaria num AKS novo hoje?"
???
Não o ingress-nginx: o projeto da comunidade foi aposentado em março de 2026, e o App Routing NGINX só tem patches críticos até novembro de 2026. Uso a Gateway API: a implementação do App Routing (gerenciada, baseada em Istio, sem sidecar) para o caso comum, ou o Application Gateway for Containers se precisar de WAF e L7 fora do cluster. Gateway com `allowedRoutes` restrito, uma HTTPRoute por serviço, e health checks fora das rotas.
:::

::: entrevista
"Como o AKS puxa imagens do ACR, e como você garante que roda o que foi testado?"
???
O kubelet tem uma identidade gerenciada com AcrPull no registry, sem imagePullSecrets e sem usuário admin. O pipeline faz push com outra identidade federada, só com AcrPush. E o deploy é por digest, não por tag: a tag é mutável, o digest é o hash do conteúdo, então o que vai para produção é exatamente a imagem que passou nos testes.
:::

::: entrevista
"Como você daria acesso de deploy a um pipeline do GitHub no AKS?"
???
Federação OIDC do GitHub com uma identidade gerenciada, sem client secret. A credencial federada aceita um subject específico, como `repo:org/repo:environment:prod`, então só jobs daquele environment (que pode exigir aprovação) obtêm o token. A identidade recebe o mínimo: Cluster User Role para obter o kubeconfig e RBAC Writer para criar objetos nos namespaces, sem poder alterar RBAC. Uma identidade por ambiente; a de dev não tem papel em prod.
:::

::: entrevista
"Como você escala um consumidor Kafka no AKS?"
???
KEDA com o scaler de Kafka: escala pelo lag do consumer group, que é o sinal certo, porque consumidor esperando I/O tem CPU baixa com a fila crescendo. Máximo de réplicas igual ao número de partições, mínimo maior que zero se o serviço também atende HTTP, um gatilho de CPU junto para o tráfego HTTP, e descida lenta, porque cada mudança de réplicas causa rebalanceamento. E alerta de lag, porque escalar não resolve dependência lenta: com o banco sofrendo, mais réplicas pioram.
:::

::: entrevista
"Para que serve uma NetworkPolicy de saída, e qual o erro clássico?"
???
Limita o que um pod comprometido alcança: só DNS e as dependências declaradas (Kafka, banco, telemetria). O erro clássico é esquecer o DNS, e tudo falha com erros enganosos. Outros: testar no kind sem motor de política, onde a política é ignorada; e mudar um namespace de dependência sem atualizar a política, o que corta a telemetria em silêncio.
:::

::: entrevista
"Como você evita sustos de custo num laboratório na nuvem?"
???
Infraestrutura por código, para criar e destruir em minutos; budget com alerta por e-mail no resource group (sabendo que ele avisa com atraso e não desliga nada); `az aks stop` entre sessões curtas e `az group delete` no fim do dia; e conferir o resource group de nós e recursos órfãos, como discos e IPs públicos, no Cost Management no dia seguinte.
:::

**Próximo módulo:** [7: Operação](../modulo-07/README.md)
