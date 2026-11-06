# Perguntas de entrevista do módulo 11

Responda em voz alta antes de abrir. As perguntas de base (push x pull, `prune` e `selfHeal`, Argo CD x HPA, segredos fora do Git) estão nas [perguntas do módulo 11 da Plataforma](../../../plataforma-dotnet/docs/modulo-11/perguntas-de-entrevista.md).

::: entrevista
"Como você liga o Terraform ao Argo CD?"
???
Com uma ponte estreita: o Terraform cria o Secret de cluster do Argo CD com os fatos da infraestrutura em anotações (client ids, URL do cofre, FQDN do banco, domínio) e a Application raiz. O resto vem do Git: geradores e a raiz consomem as anotações. O Terraform não aplica nada da aplicação, e o Git não guarda nenhum fato que muda quando o ambiente é recriado.
:::

::: entrevista
"Suas sync waves num app-of-apps funcionam? Como você sabe?"
???
Só porque restaurei a verificação de saúde de Application no argocd-cm; sem ela, desde o Argo CD 1.8 a raiz considera cada filha saudável assim que existe, e as ondas não esperam nada. Sei porque o primeiro sync de um cluster vazio mostra as filhas ficando Healthy em sequência, e a aplicação só aparece depois do Kafka pronto.
:::

::: entrevista
"Onde você roda migrações num fluxo GitOps?"
???
Como hook de PreSync da Application (no nosso caso, hooks do Helm que o Argo CD traduz), com tudo que o Job precisa também sendo hook ou já existente, para não travar no primeiro sync. A versão nova só sobe se o Job terminar. E o DDL é idempotente e compatível com a versão anterior, porque rollback por git revert não desfaz schema.
:::

::: entrevista
"Como você promove de dev para prod?"
???
O CI só escreve em dev, por PR, com tag e digest. A promoção é um PR que copia o mesmo digest para os valores de prod, com aprovação obrigatória. Nada é reconstruído para prod, e a assinatura verificada no cluster é a mesma. O PR é o registro de quem promoveu o quê e quando.
:::

::: entrevista
"Uma Application vive OutOfSync, mas está tudo funcionando. O que você faz?"
???
Olho o diff: quase sempre é um campo que outro controlador mantém (réplicas pelo HPA, caBundle injetado em webhook, anotações de um operador). Ou tiro o campo do manifesto (o chart não declara réplicas com HPA) ou configuro ignoreDifferences, por Application ou globalmente no argocd-cm. Status sempre OutOfSync ensina o time a ignorar o status, e aí ele deixa de servir.
:::

::: entrevista
"ApplicationSet com gerador de clusters ou uma Application por ambiente?"
???
Com dois ambientes, as duas funcionam. O ApplicationSet evita cópia e transforma um ambiente novo em registrar um cluster com um rótulo; com o gerador de clusters, os fatos do ambiente vêm do Secret de cluster. O custo é um template a mais para depurar (status do ApplicationSet) e cuidado com dois motores de template quando o ApplicationSet é gerado por Helm.
:::

::: entrevista
"Um colega corrigiu um ConfigMap com kubectl edit em produção às 3 da manhã e a correção sumiu. Por quê, e qual o procedimento certo?"
???
O selfHeal reaplicou o Git em segundos. Procedimento: a correção é um PR (rápido, com aprovação de quem estiver de plantão); se não dá para esperar, desliga-se a sincronização automática só daquela Application, corrige-se no cluster, abre-se o PR e religa-se o automático depois do merge, registrando no incidente.
:::

::: entrevista
"Por que você não deixa prune ligado em tudo?"
???
Porque prune apaga do cluster o que sai do Git, e para recursos com estado (Kafka, bancos operados no cluster) um refactor que muda um nome vira uma indisponibilidade. Nesses, prune desligado: o recurso aparece como órfão e uma pessoa decide. Para recursos sem estado, prune ligado evita lixo.
:::
