# Perguntas de entrevista do módulo 7

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
Por que a liveness da API não inclui o banco, e a readiness inclui?
???
Readiness decide se o pod recebe tráfego: sem banco, ele não consegue responder, então sai do Service. Liveness decide se o processo deve ser reiniciado: reiniciar não traz o banco de volta, e todos os pods reiniciando juntos só pioram a recuperação.
:::

::: pergunta
Qual a diferença entre DDD estratégico e tático, e por qual se começa?
???
Estratégico: subdomínios, contextos delimitados, linguagem e relação entre contextos. Tático: entidade, objeto de valor, agregado, evento, repositório, dentro de um contexto. Começa-se pelo estratégico, que diz onde o tático vale a pena.
:::

## Helm

::: entrevista
"Por que usar Helm em vez de aplicar YAML com `kubectl apply`?"
???
Três coisas que o YAML puro não dá: valores por ambiente sem copiar arquivos, histórico de releases com rollback, e controle de ordem com hooks. Além disso, é o formato em que boa parte do ecossistema é distribuída (cert-manager, Argo CD, Strimzi), então saber Helm é necessário de qualquer forma. O custo é que template com lógica demais fica difícil de ler; para apps com pouca variação, Kustomize pode ser mais simples.
:::

::: entrevista
"Um deploy com Helm passou, mas a aplicação está quebrada em produção. Como isso é possível, e como você evitaria?"
???
Sem `--wait`, o Helm só garante que o cluster aceitou os manifestos, não que os pods ficaram prontos. Evito com `--wait` e um timeout, para o pipeline falhar se os pods não ficarem prontos; com `--atomic` (ou `--rollback-on-failure` no Helm 4), para voltar sozinho; com readiness probe que reflita de verdade a capacidade de atender; e com `maxUnavailable: 0` no rolling update, para os pods velhos só saírem quando os novos estiverem prontos.
:::

::: entrevista
"Como você passa segredos para um chart Helm?"
???
Não passo pelo Helm. Os valores de cada revisão ficam guardados em Secrets da release no namespace, então senha por `--set` fica exposta para quem lê Secrets e em todas as revisões. O segredo fica num cofre (Key Vault) e chega ao pod pelo driver CSI com identidade de carga de trabalho, ou por um Secret criado fora do chart (External Secrets, Sealed Secrets). O chart só referencia o nome.
:::

::: entrevista
"O que acontece com o histórico do Helm quando você passa a usar Argo CD?"
???
O Argo CD renderiza o chart e aplica o YAML ele mesmo, sem criar release do Helm. `helm list` e `helm history` deixam de mostrar a aplicação. O histórico passa a ser o do Git (cada deploy é um commit) e o do próprio Argo CD, e voltar uma versão vira `git revert`.
:::

::: entrevista
"Um colega mudou um valor no ConfigMap pelo Helm e a aplicação não percebeu. O que aconteceu?"
???
A aplicação lê a configuração como variável de ambiente, que só é lida quando o processo sobe. O ConfigMap mudou, mas os pods não foram recriados. A correção imediata é `kubectl rollout restart`; a definitiva é a anotação com o hash do ConfigMap (`checksum/config`) no template do pod, que faz o Deployment recriar os pods sempre que a configuração muda.
:::

::: entrevista
"Como você rodaria uma migração de banco num deploy com Helm?"
???
Dá para usar um hook `pre-upgrade` com um Job, que roda e precisa terminar antes de a aplicação nova subir. Mas em produção eu prefiro tirar a migração do Helm: um passo do pipeline com o script SQL revisado em PR, executado por um usuário com permissão de DDL que a aplicação não tem. E a migração precisa ser compatível com a versão anterior (expandir antes, contrair depois), porque `helm rollback` volta o código, não o schema.
:::

## Para treinar a fala

Explique o Lab 2 (imagem inexistente com `maxUnavailable: 0`) para alguém do suporte. Se a pessoa entender por que a API não caiu, você entendeu.

**Mapa do curso:** [voltar](../README.md).
