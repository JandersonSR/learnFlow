# 7.2 Anatomia do chart `cep-api`

Abra a pasta [`charts/cep-api`](https://github.com/JandersonSR/aks-step-by-step/tree/main/charts/cep-api) do aks-step-by-step ao lado desta lição. O melhor jeito de aprender Helm é ler um chart real prevendo o que ele gera, e conferir com `helm template`.

```text
charts/cep-api/
  Chart.yaml              nome e versão do pacote
  values.yaml             todos os valores, com os padrões
  values-dev.yaml         só o que o ambiente dev muda
  templates/
    _helpers.tpl          pedaços reutilizáveis (não geram recurso sozinhos)
    deployment.yaml       a API
    service.yaml, ingress.yaml, configmap.yaml, escala.yaml (HPA e PDB) ...
    NOTES.txt             a mensagem que aparece depois do install
```

## `Chart.yaml`: duas versões que não são a mesma coisa

```yaml
name: cep-api
version: 0.17.0      # versão do CHART (do pacote de deploy)
appVersion: "v1"     # versão da APLICAÇÃO (informativa)
```

::: porque
O chart muda por motivos que não têm nada a ver com a aplicação (um probe novo, um Ingress), e a aplicação muda sem o chart mudar (código novo, mesma forma de deploy). Duas versões separadas permitem dizer "a v2 da API, empacotada com o chart 0.17". Neste projeto, quem manda na versão que roda é o `image.tag`; o `appVersion` é só um rótulo.
:::

## `values.yaml`: o contrato do chart

Leia o arquivo inteiro. Repare que **cada valor tem um comentário dizendo quando e por que mudar**. Isso é o que faz um chart ser usável por outra pessoa: o `values.yaml` é a documentação.

E o `values-dev.yaml` tem **só o que muda** em dev:

```yaml
image:
  tag: "0"
config:
  Documentacao__Habilitada: "true"
  LimiteDeRequisicoes__Limite: "5000"
```

::: porque
Se o arquivo de cada ambiente repetisse tudo, uma mudança no padrão (um novo limite de memória, por exemplo) precisaria ser feita em N arquivos, e um deles seria esquecido. Com só a diferença, o padrão muda num lugar e todos os ambientes herdam.
:::

## A linguagem dos templates em 6 construções

Os templates usam a linguagem de templates do Go com as funções da biblioteca Sprig. Para ler este chart, você precisa de seis coisas:

| Construção | O que faz | Exemplo no chart |
|---|---|---|
| `{{ .Values.x }}` | Lê um valor | `{{ .Values.hpa.min }}` |
| `{{- ... }}` | O `-` remove os espaços e a quebra de linha daquele lado | Quase todo `if` |
| `if` / `with` | Condição; `with` também muda o `.` para o valor | `{{- with .Values.imagePullSecret }}` |
| `define` / `include` | Cria e usa um pedaço reutilizável | `{{ include "cep-api.labels" . }}` |
| `toYaml` + `nindent N` | Converte um mapa para YAML e indenta N espaços, começando numa linha nova | `{{- toYaml .Values.resources \| nindent 12 }}` |
| `quote` | Põe aspas | `{{ .Values.image.tag \| quote }}` |

::: armadilha
`include` + `nindent` é o par mais usado e o que mais gera YAML quebrado. O número do `nindent` é a **coluna** em que o bloco deve começar no arquivo final, não "quantos espaços a mais". Errou por dois espaços, o YAML continua válido mas o campo vai parar no lugar errado, e o erro só aparece no `kubectl` com uma mensagem confusa. Sempre confira com `helm template`.
:::

## Previsões sobre o chart

Para cada uma, escreva o palpite, depois rode o comando e compare.

::: previsao
Na raiz do aks-step-by-step, sem passar nenhum valor:

```bash
helm template cep-api charts/cep-api
```

Gera o YAML ou dá erro? Se der erro, qual?
???
**Dá erro**, de propósito. O `values.yaml` vem com dois valores obrigatórios vazios, e o chart se recusa a gerar YAML sem eles. Dependendo da ordem em que o Helm renderiza os arquivos, você vê uma destas duas mensagens:

```text
Error: execution error at (cep-api/templates/ingress.yaml...):
ingress.host é obrigatório com o ingress ligado (ex.: --set ingress.host=cep.<ip-com-hifens>.sslip.io)

Error: execution error at (cep-api/templates/secretproviderclass.yaml...):
Com keyVault.enabled: keyVault.name, keyVault.tenantId e workloadIdentity.clientId são obrigatórios (niveis/06-key-vault.md)
```

As duas vêm da função `fail`: uma no próprio [`ingress.yaml`](https://github.com/JandersonSR/aks-step-by-step/blob/main/charts/cep-api/templates/ingress.yaml), outra no helper `cep-api.validarKeyVault` do `_helpers.tpl`.

Por que isso é bom: sem a validação, o chart geraria um Ingress sem host, ou um `SecretProviderClass` com nome vazio. O `helm upgrade` passaria e o problema apareceria depois, como pod preso em `ContainerCreating` ou certificado que nunca sai. O `fail` troca um erro confuso em produção por uma mensagem clara na hora do deploy.

Para gerar sem Key Vault e com um host de exemplo, que é o que os próximos exercícios usam:

```bash
helm template cep-api charts/cep-api --set keyVault.enabled=false --set ingress.host=cep.exemplo.com
```
:::

::: previsao
Abra [`_helpers.tpl`](https://github.com/JandersonSR/aks-step-by-step/blob/main/charts/cep-api/templates/_helpers.tpl). Existem dois conjuntos de rótulos: `cep-api.seletor` (nome e instância) e `cep-api.labels` (seletor + versão + chart). O `selector.matchLabels` do Deployment usa só o **seletor**, sem a versão.

O que aconteceria se alguém usasse `cep-api.labels`, com a versão, no `selector`, e depois rodasse um `helm upgrade` com uma tag nova?
???
O upgrade **falharia**:

```text
spec.selector: Invalid value: ...: field is immutable
```

O `selector` de um Deployment não pode mudar depois de criado. Com a versão dentro dele, cada tag nova mudaria o seletor, e o Kubernetes recusaria. Por isso o padrão dos charts é separar **rótulos de identidade** (estáveis, usados no seletor) de **rótulos informativos** (versão, chart), que só vão em `metadata.labels`.
:::

::: previsao
No `deployment.yaml`:

```yaml
spec:
  {{- if not .Values.hpa.enabled }}
  replicas: {{ .Values.replicas }}   # com HPA, quem decide as réplicas é ele
  {{- end }}
```

Se o `if` não existisse e o campo `replicas: 2` fosse sempre gerado, o que aconteceria num dia de pico, com o HPA tendo escalado para 7 pods, quando alguém rodasse um `helm upgrade` para trocar uma configuração?
???
O `helm upgrade` aplicaria `replicas: 2` e o Deployment **cairia de 7 para 2 pods em pleno pico**. Alguns segundos depois o HPA perceberia a CPU alta e subiria de novo, mas os usuários já teriam sentido.

Com HPA ligado, quem manda no número de réplicas é o HPA. O chart deixa o campo de fora para não brigar com ele.
:::

## O truque do checksum

```yaml
template:
  metadata:
    annotations:
      checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
```

::: porque
A API lê o ConfigMap como **variáveis de ambiente** (`envFrom`). Variável de ambiente é lida quando o processo começa. Se o ConfigMap muda e os pods não reiniciam, a API continua com os valores velhos, e ninguém percebe.

A anotação guarda o hash do ConfigMap renderizado. Mudou um valor, muda o hash, muda o template do pod, e o Deployment faz um rollout com pods novos. É uma linha que evita um incidente clássico ("mudei a config e não pegou").

Alternativa: montar o ConfigMap como arquivo e a aplicação recarregar sozinha (o projeto faz isso com o segredo do Key Vault). Funciona para o que a aplicação sabe recarregar; para o resto, o checksum.
:::

## Exercício: anotações extras nos pods

::: desafio
Times de plataforma costumam pedir anotações nos pods (para o coletor de métricas, por exemplo). Acrescente ao chart um valor `podAnnotations` (um mapa, vazio por padrão) que, quando preenchido, entra nas anotações do pod da API **junto** com o `checksum/config`.

**Critérios de aceite:**
- Com `podAnnotations` vazio, o `helm template` gera exatamente o mesmo YAML de antes
- Com `--set-string podAnnotations.exemplo/coleta=true`, a anotação aparece no pod, com a indentação certa
- `helm lint` sem avisos novos
:::

::: dica Dica
O padrão é `with` + `toYaml` + `nindent`. Descubra a coluna certa olhando onde fica o `checksum/config` no arquivo.
:::

::: solucao
No `values.yaml`:

```yaml
# Anotações extras nos pods da API (coletor de métricas, sidecars etc.)
podAnnotations: {}
```

No `deployment.yaml`, dentro de `template.metadata.annotations`, logo depois do checksum:

```yaml
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        {{- with .Values.podAnnotations }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
```

Por que funciona: `with` só entra no bloco se o mapa não estiver vazio, e dentro dele o `.` vira o próprio mapa. O `nindent 8` coloca cada anotação na coluna 8, a mesma do `checksum/config`.

Confira:

```bash
helm template cep-api charts/cep-api --set keyVault.enabled=false --set ingress.host=cep.exemplo.com \
  --set-string podAnnotations.exemplo/coleta=true | grep -A3 "annotations:"
```

Dois detalhes que derrubam muita gente:

- **`--set-string`, não `--set`.** Com `--set`, o `true` vira booleano, o `toYaml` escreve `exemplo/coleta: true` sem aspas, e o Kubernetes recusa o pod: anotação tem de ser texto. O `helm template` não pega isso, porque não valida contra o cluster; só o `install` falha. A lição 7.4 tem um lab com o mesmo problema no ConfigMap.
- **Ponto no nome.** A barra em `exemplo/coleta` funciona, mas um ponto (como em `prometheus.io/scrape`) seria lido como aninhamento. Escape (`--set-string podAnnotations.prometheus\.io/scrape=true`) ou use um arquivo `-f`.
:::

## Perguntas para responder sem olhar

::: pergunta
Qual a diferença entre `version` e `appVersion` no `Chart.yaml`?
???
`version` é a versão do pacote de deploy (o chart) e muda quando os templates mudam. `appVersion` é a versão da aplicação, informativa. Neste projeto, a versão que de fato roda vem do `image.tag`.
:::

::: pergunta
Por que o seletor do Deployment não pode ter a versão da aplicação?
???
Porque o `selector` de um Deployment é imutável. Com a versão dentro, cada upgrade mudaria o seletor e o Kubernetes recusaria com `field is immutable`. Rótulos de identidade vão no seletor; versão e chart, só nos rótulos informativos.
:::

::: pergunta
Para que serve a anotação `checksum/config` no template do pod?
???
Para reiniciar os pods quando o ConfigMap muda. A API lê a configuração como variável de ambiente, que só é lida na subida. O hash do ConfigMap na anotação faz o template do pod mudar junto, e o Deployment faz um rollout.
:::

**Próxima:** [7.3 Os comandos, e por que cada um](03-comandos-e-porques.md).
