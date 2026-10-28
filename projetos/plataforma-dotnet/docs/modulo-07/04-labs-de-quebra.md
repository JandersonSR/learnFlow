# 7.4 Labs de quebra

Cada lab quebra o deploy de um jeito que acontece de verdade em produção. Para cada um: **escreva o palpite, rode, diagnostique sozinho, só então abra as dicas**. No fim, você terá o material do runbook que é o entregável do módulo.

## Preparação (uma vez, uns 10 minutos)

Os labs rodam num cluster local, sem custo. Na raiz do [aks-step-by-step](https://github.com/JandersonSR/aks-step-by-step):

```bash
minikube start
kubectl create namespace cep

# Um PostgreSQL descartável, só para a readiness da API passar
kubectl run pg -n cep --image=postgres:17-alpine --env=POSTGRES_PASSWORD=lab --port=5432
kubectl expose pod pg -n cep --port=5432
kubectl create secret generic cep-db -n cep \
  --from-literal=conexao="Host=pg;Database=postgres;Username=postgres;Password=lab"

# Constrói a imagem dentro do minikube (sem registry)
minikube image build -t cep-api:lab .

# Valores para rodar local: sem Key Vault, Ingress, worker, HPA, Kafka e Dragonfly
VALORES="--set keyVault.enabled=false --set ingress.enabled=false --set worker.enabled=false \
  --set hpa.enabled=false --set image.repository=cep-api --set image.tag=lab \
  --set-string config.Kafka__BootstrapServers= --set-string config.ConnectionStrings__Cache="

helm upgrade --install cep-api charts/cep-api -n cep $VALORES --wait
kubectl get pods -n cep        # dois pods cep-api com READY 1/1
```

Esta é a revisão boa, a que você vai querer de volta nos labs.

::: previsao
Derrube o banco com `kubectl delete pod pg -n cep` e acompanhe com `kubectl get pods -n cep -w` por um minuto. O que acontece com os pods da API: ficam prontos, deixam de ficar prontos, ou reiniciam?
???
Em alguns segundos eles passam para **`READY 0/1`**, mas **não reiniciam** (a coluna `RESTARTS` não sobe).

A **readiness** (`/healthz/ready`) inclui o banco: sem ele, o pod sai do Service e não recebe tráfego. A **liveness** (`/healthz/live`) olha só o processo, que continua vivo: o Kubernetes não tem motivo para reiniciar.

É a separação desenhada no `CepModulo` ("banco fora tira o pod do tráfego, mas não o reinicia"). Se a liveness incluísse o banco, uma queda do PostgreSQL faria todos os pods reiniciarem em loop, o que não ajuda e atrasa a volta.

Recrie o banco antes de seguir (os pods voltam a `1/1` sozinhos):

```bash
kubectl run pg -n cep --image=postgres:17-alpine --env=POSTGRES_PASSWORD=lab --port=5432
```
:::

## Lab 1: o número que o Kubernetes não aceita

::: quebra
O jeito mais intuitivo de mudar uma configuração (e que já esteve no guia do nível 3) é este:

```bash
helm upgrade cep-api charts/cep-api -n cep $VALORES --set config.LimiteDeRequisicoes__Limite=50
```

Rode. O que acontece? Por que o `helm template` com o mesmo valor não reclama?
:::

::: dica Dica 1
Leia a mensagem até o fim. Ela cita um campo e um tipo.
:::

::: dica Dica 2
Rode `helm template cep-api charts/cep-api $VALORES --set config.LimiteDeRequisicoes__Limite=50 | grep -n Limite` e compare a linha do `50` com a do `"5000"` no `values-dev.yaml`. Repare nas aspas.
:::

::: solucao
O upgrade falha com algo como:

```text
Error: UPGRADE FAILED: ... ConfigMap in version "v1" cannot be handled as a ConfigMap:
json: cannot unmarshal number into Go struct field ConfigMap.data of type string
```

O `--set` interpreta `50` como **número**. O template faz `toYaml .Values.config`, que escreve `LimiteDeRequisicoes__Limite: 50` sem aspas. Mas o campo `data` de um ConfigMap só aceita **texto**, e o servidor da API do Kubernetes recusa. O `helm template` não pega porque não fala com o cluster: para ele, é YAML válido.

**Correção:** `--set-string config.LimiteDeRequisicoes__Limite=50`. Por isso o `values.yaml` do chart põe todos os números do `config` entre aspas.

O que levar para o runbook: erro de **tipo** em campo do Kubernetes (`cannot unmarshal number/bool into ... of type string`) quase sempre é `--set` onde deveria ser `--set-string`.

Prevenção de verdade: um `values.schema.json` no chart, que o Helm valida antes de renderizar. Com `"config": {"additionalProperties": {"type": "string"}}`, o erro aparece no `lint`, no PR, em vez de no deploy.
:::

## Lab 2: a imagem que não existe

::: quebra
Simule um pipeline que publicou uma tag errada:

```bash
helm upgrade cep-api charts/cep-api -n cep $VALORES --set image.tag=nao-existe --wait --timeout 90s
```

Antes de rodar, responda: durante esses 90 segundos, **a API fica fora do ar**?

Depois de rodar: o que o comando devolve, o que o `helm history` mostra e o que os pods mostram?
:::

::: dica Dica 1
`kubectl get pods -n cep` durante a espera. Quantos pods novos, quantos velhos?
:::

::: dica Dica 2
Releia a estratégia no `deployment.yaml`: `rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }`.
:::

::: solucao
**A API não sai do ar.** Com `maxUnavailable: 0`, o Kubernetes só remove um pod velho depois que um novo fica pronto. O pod novo fica em `ErrImagePull` e depois `ImagePullBackOff`, nunca fica pronto, e os dois velhos continuam atendendo. O deploy quebrado fica "pela metade" sem derrubar ninguém. Essa linha do chart vale ouro.

Depois de 90 s:

```text
Error: UPGRADE FAILED: context deadline exceeded
```

E o `helm history -n cep cep-api` mostra a última revisão como `failed`.

Diagnóstico, do geral para o específico:

```bash
helm history cep-api -n cep                  # qual revisão falhou
kubectl get pods -n cep                      # ImagePullBackOff no pod novo
kubectl describe pod -n cep <pod-novo>       # Events: o nome exato da imagem que ele tentou baixar
```

Correção: `helm rollback cep-api <última revisão deployed> -n cep --wait`, ou um novo upgrade com a tag certa. Com `--atomic` (`--rollback-on-failure` no Helm 4), o Helm teria voltado sozinho.
:::

## Lab 3: "another operation is in progress"

::: quebra
Rode de novo o upgrade com a tag errada e um timeout longo, e **interrompa com Ctrl+C** no meio da espera:

```bash
helm upgrade cep-api charts/cep-api -n cep $VALORES --set image.tag=nao-existe --wait --timeout 10m
# Ctrl+C depois de uns 15 segundos
```

Agora tente fazer um deploy correto:

```bash
helm upgrade cep-api charts/cep-api -n cep $VALORES --wait
```

O que acontece?
:::

::: dica Dica 1
Veja o `STATUS` da última linha do `helm history`.
:::

::: dica Dica 2
O Helm usa esse status como trava, para dois deploys não acontecerem ao mesmo tempo. Quem estava segurando a trava?
:::

::: solucao
O deploy correto pode ser recusado com:

```text
Error: UPGRADE FAILED: another operation (install/upgrade/rollback) is in progress
```

O `helm history` mostra a última revisão como **`pending-upgrade`**. O Helm marca a release como "em andamento" no começo do upgrade e só troca o status no fim. Você matou o processo no meio: a marca ficou, e o Helm acha que outro deploy ainda está rodando. Em pipeline, isso acontece quando o job é cancelado ou o agente cai durante o `--wait`.

Correção:

```bash
helm history cep-api -n cep                    # ache a última revisão "deployed"
helm rollback cep-api <essa revisão> -n cep --wait
```

O rollback grava uma revisão nova `deployed` e libera a trava. Depois, o upgrade correto passa.

Para o runbook: **antes** de fazer o rollback, confirme que não há mesmo outro deploy rodando (outro pipeline, outra pessoa). A trava existe para proteger desse caso.
:::

## Lab 4: mudei a configuração e não pegou

::: quebra
Abra `charts/cep-api/templates/deployment.yaml` e **apague** a anotação `checksum/config` (as duas linhas de `annotations:`). Depois:

```bash
helm upgrade cep-api charts/cep-api -n cep $VALORES
kubectl get pods -n cep                        # anote os nomes e a idade
helm upgrade cep-api charts/cep-api -n cep $VALORES --set-string config.Cep__ValidadeEmDias=7
kubectl get configmap cep-api-config -n cep -o yaml | grep Validade
kubectl get pods -n cep                        # mesmos nomes?
```

O ConfigMap mudou? Os pods mudaram? A API está usando 7 ou 30 dias?
:::

::: solucao
O ConfigMap mudou para `"7"`. Os pods **são os mesmos**, com a mesma idade. A API continua usando **30 dias**: as variáveis de ambiente foram lidas quando o processo subiu, e ninguém reiniciou o processo.

É o incidente "mudei a configuração e não pegou", que costuma levar horas para ser entendido, porque tudo parece certo: o ConfigMap está certo, o Helm disse que deu certo.

Coloque a anotação de volta e repita o upgrade: os pods são recriados, porque o hash do ConfigMap mudou o template do pod.

Para o runbook: depois de mudar configuração, confira se os pods foram recriados (`kubectl get pods` com a idade). Se não foram, `kubectl rollout restart deployment/cep-api -n cep` resolve na hora, mas o certo é o checksum no chart.
:::

## Limpeza

```bash
helm uninstall cep-api -n cep
kubectl delete namespace cep
git checkout charts/          # desfaz a remoção do checksum
```

## Entregável: o runbook

Escreva uma página **"O deploy com Helm falhou. O que eu faço?"** com uma linha por sintoma:

| Sintoma | Comando que diagnostica | Causa provável | Correção |
|---|---|---|---|
| `cannot unmarshal ... of type string` | | | |
| `context deadline exceeded` | | | |
| `another operation ... is in progress` | | | |
| Configuração mudou e a aplicação não percebeu | | | |

Preencha sem olhar esta página. Depois compare.

**Próxima:** [Perguntas de entrevista do módulo](perguntas-de-entrevista.md).
