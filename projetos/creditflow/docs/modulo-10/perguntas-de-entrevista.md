# Perguntas de entrevista do módulo 10

Responda em voz alta antes de abrir. As perguntas de base (o que é SBOM, tag x digest, por que scan no CI) estão nas [perguntas do módulo 10 da Plataforma](../../../plataforma-dotnet/docs/modulo-10/perguntas-de-entrevista.md).

::: entrevista
"Como você garante que o que roda em produção foi construído pelo seu CI?"
???
Assinatura keyless com cosign no CI, por digest, com a identidade OIDC do workflow da main registrada no Fulcio e no Rekor; e um controlador de admissão (policy-controller ou Kyverno) que só aceita imagens do nosso registry com assinatura daquela identidade exata. O deploy usa digest, nunca só a tag. Complementos: SBOM e proveniência anexados à imagem, e o registry com imutabilidade de tags.
:::

::: entrevista
"Em março de 2026 o trivy-action foi comprometido. O que isso muda no seu pipeline?"
???
Tags de ações do GitHub são móveis; o atacante reescreveu quase todas as tags e todo workflow que usava a ação rodou o código dele com os segredos do job. Mudo três coisas: todas as ações fixadas por SHA (com Dependabot abrindo PR para atualizar), permissões mínimas por job (`permissions: {}` no topo) e, para ferramentas críticas, binário de versão fixa com checksum conferido em vez da ação. E reviso quais segredos cada job enxerga.
:::

::: entrevista
"Harbor ou ACR?"
???
ACR é gerenciado e integra com o AKS sem pull secret; o scan vem do Defender e não bloqueia pull por severidade nativamente. Harbor é open source, roda em qualquer lugar, tem Trivy embutido com bloqueio de pull por severidade, robôs por projeto, cache de proxy e retenção; em troca eu opero. Escolhi Harbor para ter a política no registry e portabilidade; numa empresa padronizada em Azure com Defender e Azure Policy, ACR seria razoável.
:::

::: entrevista
"O scan agendado do registry marcou a imagem de produção como vulnerável. O que acontece e o que você faz?"
???
Pods rodando continuam; pulls novos são recusados se o projeto bloqueia por severidade, o que quebra escalas e nós novos. Reconstruo a imagem com a base corrigida pelo fluxo normal (CI, assinatura, PR de deploy), com prioridade; como último recurso e com prazo curto, uma exceção para aquele digest no registry, registrada. Nunca desligo a política nem adiciono a CVE ao ignore se ela tem correção.
:::

::: entrevista
"Para que um cache de proxy no registry?"
???
Para não depender do limite de pulls anônimos do Docker Hub, que é por IP de saída e todos os nós do cluster compartilham; para continuar subindo pods com imagens já usadas quando a origem cai; e para escanear e controlar o que vem de fora. O custo é o registry virar dependência para subir pods.
:::

::: entrevista
"Qual a diferença entre uma assinatura e uma atestação?"
???
A assinatura diz "esta identidade assinou este digest". A atestação assina uma afirmação sobre o digest, com um tipo e um conteúdo: um SBOM, a proveniência SLSA (repositório, commit, workflow que gerou), o resultado de um scan. A política de admissão pode exigir atestações específicas, não só a assinatura.
:::

::: entrevista
"Como você daria acesso de pull ao cluster sem uma senha eterna?"
???
Robô do registry com permissão só de pull no projeto, com validade (90 dias), credencial no cofre e entregue ao namespace por External Secrets como `dockerconfigjson`. A rotação é regenerar o segredo do robô e gravar no cofre; o ESO atualiza o Secret sem deploy. Com ACR seria identidade gerenciada do kubelet com AcrPull, sem segredo nenhum.
:::

::: entrevista
"O webhook de verificação de imagens caiu. O cluster parou?"
???
Depende da `failurePolicy`: com `Fail`, pods novos nos namespaces cobertos não sobem; os existentes seguem. Por isso o webhook roda com réplicas e PDB, fora dos namespaces que protege, com material de confiança em cache, e com alerta próprio. `Ignore` seria trocar segurança por disponibilidade sem ninguém perceber.
:::
