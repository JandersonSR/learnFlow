# Desafio do módulo 11: ambiente por pull request

O time quer testar cada PR de código num ambiente próprio, com URL própria, antes do merge: `pr-123.dev.exemplo.com.br`. Sem cluster novo (no cluster de dev), sem Kafka nem Postgres novos para cada PR (namespaces de PR usam os de dev com isolamento por nome), e apagado sozinho quando o PR fecha.

::: desafio O pedido
1. Um ApplicationSet novo, com gerador **`pullRequest`** (GitHub) combinado com o `clusters` (só o cluster `dev`), que cria `creditflow-pr-<número>` no namespace `creditflow-pr-<número>` usando a imagem do commit do PR.
2. O CI constrói e assina a imagem dos PRs **do próprio repositório** (não de forks) com tag `pr-<número>-<sha curto>`, sem promover nada.
3. Isolamento: banco `creditflow_pr_<n>` (ou schemas com sufixo), grupos de consumidor e tópicos com prefixo do PR, cache com prefixo de chave. Decida quais desses são realmente necessários e justifique.
4. Limpeza: PR fechado ⇒ Application, namespace e banco somem. Mostre.
:::

## Critérios de aceite

- [ ] Abrir um PR cria `creditflow-pr-<n>` em até 5 minutos (intervalo do gerador ou webhook), `Synced/Healthy`.
- [ ] `https://api-pr-<n>.<dominio>/v1/simulacoes` responde com a versão do PR (cabeçalho ou endpoint de versão).
- [ ] Dois PRs abertos ao mesmo tempo não consomem as mensagens um do outro (prove com o `kafka-consumer-groups.sh`).
- [ ] Fechar o PR remove tudo, inclusive o banco (um hook `PostDelete` ou um Job agendado: escolha e justifique).
- [ ] O policy-controller aceita a imagem do PR. Você precisou mudar a política? Explique o risco do que mudou.
- [ ] Um parágrafo de custo: quanto um PR aberto por uma semana custa a mais no cluster de dev.

::: dica Dica 1
O gerador `pullRequest` precisa de um token do GitHub com leitura de PRs (um Secret no namespace `argocd`) e expõe `number`, `branch`, `head_sha`, `head_short_sha`, `labels`. Filtre por rótulo (`labels: [preview]`) para não criar ambiente para todo PR.
:::

::: dica Dica 2
A identidade na assinatura de um PR é `ci.yml@refs/pull/<n>/merge`, não `@refs/heads/main`. Ou a política aceita esse padrão **só** para imagens com tag `pr-*` (duas políticas, globs diferentes), ou os PRs não são verificados. A segunda opção abre um buraco: pense em quem pode abrir PR.
:::

::: solucao Pontos que uma boa solução tem
- `matrix` de `clusters` (seletor `ambiente=dev`) com `pullRequest` (filtro por rótulo `preview`), `goTemplate`, nome `creditflow-pr-{{ .number }}`, `destination.namespace` idem e `syncOptions: [CreateNamespace=true]` + `managedNamespaceMetadata` com os rótulos de Pod Security e de política.
- Values: `imagem.tag: pr-{{ .number }}-{{ .head_short_sha }}`, `rotas.hosts[0]: api-pr-{{ .number }}.<dominio>`, réplicas mínimas, KEDA com `minimo: 0`.
- Grupo de consumidor e tópicos: com prefixo (`creditflow-pr-<n>-pagamentos`), senão dois PRs dividem partições. Tópicos novos por PR exigem `KafkaTopic` no namespace dos dados e ACL nova: muitas vezes é mais simples um Kafka efêmero por PR (Strimzi com 1 nó, ~1,5 GiB).
- Banco: `CREATE DATABASE` num hook PreSync e `DROP DATABASE` num hook `PostDelete` (suportado pelo Argo CD para limpar quando a Application é apagada).
- Política: segunda `ClusterImagePolicy` com glob `harbor.../creditflow/creditflow:pr-*`? Globs da política casam a **referência**; com digest a tag não aparece. Uma solução mais robusta é um projeto Harbor separado `creditflow-pr` com política própria, aceito só nos namespaces `creditflow-pr-*`.
:::
