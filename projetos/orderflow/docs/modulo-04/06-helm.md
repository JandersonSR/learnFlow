# 4.6 Helm: um chart por serviço

Arquivos: [`deploy/helm/orders/`](../../deploy/helm/orders/), [`deploy/helm/payments/`](../../deploy/helm/payments/), [`deploy/helm/payments-streams/`](../../deploy/helm/payments-streams/)

Até aqui você poderia aplicar YAML puro. O problema aparece no segundo ambiente: o kind quer `image.tag: dev`, Secret criado na mão e 2 réplicas; o AKS (dev e prod) quer a imagem do ACR, Key Vault, Workload Identity, KEDA e uma HTTPRoute. Copiar os YAMLs e editar à mão é como manter dois `docker-compose.yml` que divergem em silêncio.

::: conceito Helm
Um gerenciador de pacotes para Kubernetes. Um **chart** é um diretório com templates de manifestos (Go templates) e um `values.yaml` com os valores padrão. `helm install`/`upgrade` renderiza os templates com os values do ambiente, aplica no cluster e guarda o resultado como uma **release** versionada (um Secret no namespace, com o manifesto de cada revisão). É isso que permite `helm rollback orders 3`.
:::

## A decisão: um chart por serviço, não um umbrella

| | **Um chart por serviço** (escolhido) | Umbrella (um chart pai com subcharts) |
|---|---|---|
| Deploy | cada serviço no seu ritmo: `helm upgrade orders` não toca no Payments | um `helm upgrade` atualiza tudo; mudar o Orders "re-aplica" o Payments |
| Rollback | isolado: `helm rollback payments` | da release inteira |
| Dono | o time do serviço (no futuro, o chart mora no repositório dele) | um time central |
| Duplicação | os templates se repetem nos três charts | os templates comuns ficam num lugar |
| Bom para | serviços independentes, times diferentes, CI por serviço | um produto que sempre sobe junto (um sistema de terceiros, um ambiente de demo) |

O OrderFlow é um sistema **orientado a eventos** justamente para os serviços evoluírem e falharem separados. Um umbrella reacoplaria no deploy o que a arquitetura desacoplou em tempo de execução. O custo, a duplicação de templates, é real: os três charts têm `_helpers.tpl`, `deployment.yaml` etc. quase iguais. A saída madura para isso é um **library chart** (um chart `type: library` só com named templates, usado como dependência pelos três), e é o desafio deste módulo.

::: porque Por que não Kustomize
Kustomize (embutido no `kubectl apply -k`) faz "YAML base + patches por ambiente", sem linguagem de template. É ótimo quando as diferenças entre ambientes são pequenas. Aqui elas são **estruturais**: no AKS aparecem objetos inteiros que não existem no kind (SecretProviderClass, ScaledObject, HTTPRoute) e o Deployment muda de forma (volume CSI, sem `replicas` quando há autoscaler). Com Helm isso é um `if` legível; com Kustomize seriam componentes e patches espalhados. E o Helm guarda histórico de releases para rollback. Muitas empresas usam os dois (Helm para empacotar, Kustomize por cima para ajustes de plataforma); saber ler ambos cai em entrevista.
:::

## Anatomia do chart

```
deploy/helm/orders/
├── Chart.yaml            nome, versão do chart, appVersion, kubeVersion mínima
├── values.yaml           padrões seguros para qualquer ambiente
├── values-kind.yaml      só o que muda no kind
├── values-dev.yaml       AKS, ambiente dev (pipeline do Módulo 7)
├── values-prod.yaml      AKS, ambiente prod
└── templates/
    ├── _helpers.tpl      named templates (nomes, labels): não gera manifesto
    ├── deployment.yaml   sempre
    ├── service.yaml      service.enabled
    ├── configmap.yaml    sempre (config:)
    ├── secret.yaml       só no kind (secret.create)
    ├── serviceaccount.yaml
    ├── secretproviderclass.yaml   keyVault.enabled (Módulo 6)
    ├── pdb.yaml          podDisruptionBudget.enabled
    ├── hpa.yaml          autoscaling.enabled (e sem KEDA)
    ├── scaledobject.yaml keda.enabled (Módulo 6)
    └── httproute.yaml    httpRoute.enabled (Módulo 6)
```

Os values se **sobrepõem** na ordem em que aparecem: `values.yaml` → `-f values-prod.yaml` → `--set-string image.digest=sha256:...`. O último vence.

## Ler um template

Um trecho do `deployment.yaml`, com o que cada pedaço faz:

```yaml
metadata:
  name: {{ include "orders.fullname" . }}
  labels:
    {{- include "orders.labels" . | nindent 4 }}
spec:
  {{- if not (or .Values.autoscaling.enabled .Values.keda.enabled) }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
```

| Sintaxe | O que é |
|---|---|
| `{{ ... }}` | uma ação do Go template |
| `.` | o contexto: `.Values`, `.Release.Name`, `.Chart.Name`... |
| `{{-` / `-}}` | remove espaços e quebras de linha **antes**/**depois** (o pesadelo de indentação do Helm é quase sempre isto) |
| `include "x" .` | executa o named template `x` com o contexto `.` e devolve **texto** (pode ir num pipe) |
| `\| nindent 4` | quebra a linha e indenta cada linha com 4 espaços |
| `default a b` | `b` se não vazio, senão `a` |
| `required "msg" v` | falha o render com `msg` se `v` estiver vazio |

::: porque Por que `replicas` some quando há autoscaler
Se o Deployment declara `replicas: 2` e o HPA escalou para 5, o próximo `helm upgrade` reaplica `replicas: 2`: o Kubernetes derruba 3 pods no meio do pico, e o HPA sobe de novo um minuto depois. Sem o campo no template, o Helm não opina e o autoscaler é o único dono do número.
:::

::: armadilha O selector é imutável
`spec.selector.matchLabels` de um Deployment **não pode mudar** depois de criado. Por isso o helper `orders.selectorLabels` tem só `name` e `instance`, que nunca mudam, e a versão fica nos labels completos. Colocar `app.kubernetes.io/version` no selector faz o segundo deploy falhar com `field is immutable`.
:::

## Instalar, inspecionar, desfazer

```bash
# o que SERIA aplicado (sem cluster): leia sempre antes do primeiro install
helm template orders deploy/helm/orders -f deploy/helm/orders/values-kind.yaml

# lint: erros de template e boas práticas
helm lint deploy/helm/orders -f deploy/helm/orders/values-kind.yaml

# instalar ou atualizar (idempotente)
helm upgrade --install orders deploy/helm/orders -n orderflow --create-namespace \
  -f deploy/helm/orders/values-kind.yaml --wait --atomic --timeout 3m

helm -n orderflow history orders          # revisões
helm -n orderflow get values orders       # os values efetivos da revisão atual
helm -n orderflow rollback orders 1       # volta para a revisão 1
```

- **`--wait`**: o comando só termina quando os pods ficam Ready (as probes da lição 4.4 viram o critério de sucesso do deploy).
- **`--atomic`**: se não ficar Ready no `--timeout`, faz rollback automaticamente. Num pipeline, é a diferença entre "deploy falhou e ficou quebrado" e "deploy falhou e voltou". No **Helm 4** a opção se chama `--rollback-on-failure` (o nome antigo ainda funciona, depreciado); o pipeline do Módulo 7 usa o nome novo.

::: porque Um arquivo por ambiente, autossuficiente
O pipeline do Módulo 7 roda `helm upgrade -f values-<ambiente>.yaml --set-string image.digest=...` e mais nada. Por isso `values-dev.yaml` e `values-prod.yaml` trazem **tudo** do ambiente, inclusive os IDs que saem do Bicep/Terraform (client IDs, nome do Key Vault). São identificadores, não segredos: podem ir para o Git, e o diff de um PR mostra exatamente o que muda em produção. Repetição entre dev e prod é aceitável aqui: a diferença entre os dois arquivos **é** a documentação do que difere entre os ambientes.
:::

::: previsao
Você roda `helm upgrade --install orders ... --set config.Orders__MaxItemsPerOrder=0 --wait --atomic --timeout 2m`. O `OrdersOptions` tem `[Range(1, 1000)]` em `MaxItemsPerOrder` e `ValidateOnStart`. O que acontece com o tráfego, com os pods e com a release?
???
O hash da configuração muda, o Deployment cria um ReplicaSet novo e sobe **1** pod (maxSurge 1, maxUnavailable 0). Esse pod falha na subida (`OptionsValidationException`), entra em `CrashLoopBackOff` e nunca fica Ready. Os 2 pods antigos continuam atendendo: **zero impacto no tráfego**. Depois de 2 minutos, o `--atomic` faz rollback: a release volta para a revisão anterior, o ConfigMap volta ao valor antigo e o ReplicaSet novo é descartado. `helm history` mostra a revisão com status `failed` e uma nova revisão de rollback. Três mecanismos de três módulos diferentes (ValidateOnStart, readiness/rollout, Helm atomic) se somaram.
:::

::: video Helm Charts Explained: Beginner to Advanced (em inglês)
https://www.youtube.com/watch?v=-Si3j4t_zyc
Estrutura de um chart, templates, values e o ciclo de vida de uma release, para rever o que esta lição mostrou no código.
:::

## Como este curso validou os charts

O ambiente onde os charts foram escritos não tinha o binário do Helm. Eles foram renderizados por um renderizador Go mínimo (o `text/template` da biblioteca padrão com as funções usadas nos templates) e os manifestos resultantes passaram no `kubeconform -strict` com os schemas do Kubernetes 1.34 e dos CRDs (KEDA, Gateway API, Secrets Store CSI). Rode `helm lint` e `helm template` na sua máquina como primeiro passo do Exercício 1: se algo divergir do Helm real, corrija e anote no `NOTAS.md`.

## Perguntas para responder sem olhar

::: pergunta
Um chart por serviço ou um umbrella chart? Defenda a sua escolha.
???
Para serviços independentes, um chart por serviço: deploy e rollback isolados, dono claro, CI por serviço. Umbrella acopla o ciclo de deploy de serviços que foram desenhados para evoluir separados. A duplicação de templates se resolve com um library chart compartilhado. Umbrella faz sentido quando o conjunto sempre sobe junto, como um produto de terceiros ou um ambiente efêmero de demonstração.
:::

::: pergunta
O que `--wait --atomic` fazem e por que usar num pipeline?
???
`--wait` espera os recursos ficarem prontos (pods Ready, segundo as probes); `--atomic` faz rollback automático se não ficarem dentro do timeout. Num pipeline, o deploy falho volta sozinho ao estado anterior em vez de deixar uma release quebrada para alguém consertar.
:::

::: pergunta
Por que o Deployment do chart não declara `replicas` quando há HPA ou KEDA?
???
Porque cada `helm upgrade` reaplicaria o número fixo e brigaria com o autoscaler, derrubando pods no meio de um pico. O autoscaler deve ser o único dono do número de réplicas.
:::

**Próximo:** [Exercícios do módulo](exercicios.md) e [perguntas de entrevista](perguntas-de-entrevista.md)
