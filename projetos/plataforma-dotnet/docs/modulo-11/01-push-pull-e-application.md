# 11.1 Push contra pull, e a Application do Argo CD

Do nível 4 ao 10, o pipeline **empurra** a versão nova para o cluster com `helm upgrade`. Para isso, ele precisa da credencial do cluster. Dois problemas aparecem com o tempo:

- **A credencial do cluster mora fora dele.** Quem controla o pipeline (ou consegue roubar o que ele usa) consegue publicar qualquer coisa no cluster.
- **O cluster pode divergir do que foi publicado.** Alguém dá um `kubectl edit` numa emergência, e a mudança fica lá, sem registro, até o próximo deploy apagá-la (ou não).

::: conceito GitOps
Um jeito de operar em que o **estado desejado** do ambiente está declarado num repositório Git, e um agente **dentro** do ambiente compara continuamente o que está no Git com o que está rodando, e corrige a diferença. Os princípios: declarativo, versionado no Git, **puxado** pelo agente, e **reconciliado** continuamente.
:::

| | Push (níveis 4 a 10) | Pull com Argo CD (nível 11) |
|---|---|---|
| Quem aplica no cluster | O pipeline, de fora | O Argo CD, de dentro |
| Credencial do cluster fora dele | Sim, no pipeline | Não existe |
| Mudança manual no cluster | Fica até o próximo deploy | Desfeita em segundos (`selfHeal`) |
| Voltar uma versão | `helm rollback` | `git revert` do commit de deploy |
| "O que está rodando?" | Olhar o cluster | Olhar o Git |
| Histórico de quem publicou o quê | Logs do pipeline | `git log` |

::: video ArgoCD Tutorial for Beginners (TechWorld with Nana, em inglês)
https://www.youtube.com/watch?v=MeU5_k9ssrs
GitOps e Argo CD com uma demonstração completa. Se viu no módulo 0, reveja agora com o projeto na cabeça.
:::

## A Application, campo por campo

A `Application` é o recurso que diz ao Argo CD "mantenha **isto** do Git igual **naquele** lugar do cluster". No projeto, ela é criada pelo Terraform ([`argocd-app.tf`](https://github.com/JandersonSR/aks-step-by-step/blob/main/infra/30-app/argocd-app.tf)):

```hcl
spec = {
  source = {
    repoURL        = var.repo_url
    targetRevision = var.branch            # main
    path           = "charts/cep-api"
    helm = {
      valueFiles = ["values-dev.yaml"]     # tem a image.tag, gravada pelo pipeline
      parameters = [
        { name = "image.repository", value = "${var.harbor_host}/cep/cep-api" },
        { name = "ingress.host", value = var.ingress_host },
        { name = "keyVault.name", value = local.azure.key_vault_name },
        # ...
      ]
    }
  }
  destination = { server = "https://kubernetes.default.svc", namespace = "cep" }
  syncPolicy = {
    automated   = { prune = true, selfHeal = true }
    syncOptions = ["CreateNamespace=false"]
    retry       = { limit = 5, backoff = { duration = "10s", factor = 2, maxDuration = "3m" } }
  }
}
```

| Campo | O que faz | Por que assim |
|---|---|---|
| `source.path` + `helm.valueFiles` | O Argo CD renderiza o chart com o `values-dev.yaml` (equivalente a um `helm template`) | O chart do módulo 7 continua o mesmo; só muda quem aplica |
| `helm.parameters` | Valores extras, como um `--set` | São os IDs que mudam a cada recriação do ambiente (cofre, identidade, host). Vêm do Terraform, não do Git, porque não são decisões de versão |
| `destination` | O cluster (o próprio, `kubernetes.default.svc`) e o namespace | — |
| `automated` | Sincroniza sozinho quando o Git muda | Sem isso, alguém precisaria clicar em *Sync* a cada deploy |
| `prune: true` | Apaga do cluster o que foi **removido** do Git | Sem ele, um template apagado do chart deixaria o recurso órfão no cluster para sempre |
| `selfHeal: true` | Desfaz mudanças feitas direto no cluster | É o que torna o Git a fonte da verdade de fato |
| `CreateNamespace=false` | Não cria o namespace | O namespace é do Terraform, com os rótulos de Pod Security (lição 3.3). Se o Argo CD criasse, viria sem eles |
| `retry` | Tenta de novo, com espera crescente, se a sincronização falhar | Falhas temporárias (o cluster ocupado, um webhook lento) se resolvem sozinhas |

::: porque Por que o Argo CD roda sem exposição pública
O [`argocd.tf`](https://github.com/JandersonSR/aks-step-by-step/blob/main/infra/20-plataforma/argocd.tf) instala sem Ingress e sem SSO: o acesso é por `kubectl port-forward`. A interface do Argo CD tem poder de sincronizar e apagar recursos; expô-la na internet, sem SSO, seria abrir uma porta para o cluster. Para um time maior, o caminho é SSO com o Entra ID e acesso pela rede interna.
:::

## O Argo CD e o HPA

::: previsao
Com tudo sincronizado, alguém roda `kubectl scale deployment cep-api -n cep --replicas=1`. O guia do nível 11 diz que o estado volta. **Quem** devolve as réplicas: o Argo CD (pelo `selfHeal`) ou o HPA? E se a mudança manual fosse `kubectl edit configmap cep-api-config` trocando um valor?
???
**Réplicas: quem devolve é o HPA, não o Argo CD.** Lembra da lição 7.2? Com HPA ligado, o template do Deployment **não declara** `replicas`. Para o Argo CD, o número de réplicas não faz parte do estado desejado, então mudá-lo não é uma diferença a corrigir. O HPA vê 1 réplica, abaixo do mínimo de 2, e sobe de volta.

Se o chart declarasse `replicas: 2` com o HPA ligado, o Argo CD e o HPA **brigariam**: o HPA sobe para 6 num pico, o Argo CD vê diferença do Git e volta para 2, o HPA sobe de novo. O `if not .Values.hpa.enabled` do template evita essa briga.

**ConfigMap: quem devolve é o Argo CD.** O ConfigMap está declarado no chart; o valor editado à mão é uma diferença do Git. Em segundos, o `selfHeal` reaplica o valor do chart (e o checksum faz os pods voltarem ao valor correto, se tinham sido recriados). Uma correção feita "na mão" em produção some sozinha, e por isso correção de emergência também passa pelo Git.
:::

::: armadilha
Campos que outros controladores mudam de propósito (réplicas pelo HPA, anotações injetadas por webhooks, `caBundle` preenchido pelo cert-manager) aparecem como diferença eterna se estiverem no manifesto. Ou eles ficam **fora** do manifesto (o caso das réplicas), ou entram numa lista de `ignoreDifferences` da Application. Uma Application sempre `OutOfSync` por um campo desses ensina o time a ignorar o status, e o status deixa de servir para alguma coisa.
:::

## Perguntas para responder sem olhar

::: pergunta
Quais as vantagens do modelo pull (GitOps) sobre o push no pipeline?
???
A credencial do cluster não sai dele (o pipeline só grava no Git); o Git vira o registro do que roda e de quem publicou; mudanças manuais são desfeitas (`selfHeal`); voltar uma versão é um `git revert`.
:::

::: pergunta
O que `prune` e `selfHeal` fazem na Application?
???
`prune` apaga do cluster os recursos que foram removidos do Git. `selfHeal` desfaz mudanças feitas direto no cluster, reaplicando o que está no Git.
:::

::: pergunta
Por que o chart não declara `replicas` quando o HPA está ligado, e o que isso tem a ver com o Argo CD?
???
Porque com HPA quem decide as réplicas é ele. Se o manifesto declarasse um número, o Argo CD veria diferença a cada escala e voltaria ao valor do Git, brigando com o HPA. Fora do manifesto, o número de réplicas não é estado desejado para o Argo CD.
:::

**Próxima:** [11.2 O fluxo de um deploy, e a volta](02-fluxo-de-deploy.md).
