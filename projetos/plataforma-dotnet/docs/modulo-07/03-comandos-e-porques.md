# 7.3 Os comandos, e por que cada um

O [guia do nível 3](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/03-helm.md) usa uma sequência de comandos. Aqui, cada um é aberto: o que ele faz por baixo, por que este e não um parecido, e o que olhar na saída.

## 1. Antes de tocar no cluster: `lint` e `template`

```bash
helm lint charts/cep-api -f charts/cep-api/values-dev.yaml
helm template cep-api charts/cep-api -f charts/cep-api/values-dev.yaml \
  --set keyVault.enabled=false --set ingress.host=cep.exemplo.com | less
```

::: porque
- **`lint`** confere a estrutura do chart e se os templates renderizam. Pega erro de sintaxe e `fail` de validação. Não fala com o cluster.
- **`template`** mostra o YAML **final**, exatamente o que seria aplicado. É a ferramenta número um para entender e depurar um chart. Também não fala com o cluster.

Os dois rodam no pipeline de PR (o `validar.yml` do nível 3) porque são rápidos, não precisam de credencial e pegam a maior parte dos erros antes do deploy.

O que **nenhum** dos dois pega: o que só o cluster sabe. Tipo errado num campo (o booleano na anotação, da lição 7.2), CRD que não existe, cota de recursos do namespace. Para isso existe `helm install --dry-run=server`, que pede ao cluster para validar sem aplicar.
:::

## 2. Instalar e atualizar: `upgrade --install`

```bash
helm upgrade --install cep-api charts/cep-api -n cep \
  -f charts/cep-api/values-dev.yaml \
  --set image.tag=v2 \
  --wait
```

::: porque Por que `upgrade --install` e não `install`
`helm install` falha se a release já existe. `helm upgrade` falha se ela **não** existe. `upgrade --install` faz o certo nos dois casos, e é **idempotente**: o mesmo comando serve para o primeiro deploy e para todos os seguintes. Num pipeline, isso elimina um `if` frágil.
:::

::: porque Por que `--wait`
Sem `--wait`, o Helm envia os manifestos e termina na hora, com sucesso, mesmo que os pods novos nunca fiquem prontos. O pipeline fica verde com a aplicação quebrada.

Com `--wait`, o Helm espera Deployments, StatefulSets e Jobs ficarem prontos (pelos `readinessProbe`), até o `--timeout` (padrão de 5 minutos). Se não ficarem, o comando falha e o pipeline fica vermelho. É a ligação entre "o YAML foi aceito" e "a aplicação está de pé".
:::

::: porque `--atomic` (Helm 3) ou `--rollback-on-failure` (Helm 4)
Com essa opção, se o upgrade falhar (inclusive no `--wait`), o Helm **volta sozinho** para a revisão anterior. Em produção sem GitOps, é o que impede um deploy quebrado de ficar no ar até alguém acordar.

Custo: você perde o estado quebrado para investigar. Em homologação, às vezes é melhor sem, para ver os pods com erro.
:::

## 3. De onde vem cada valor: a precedência

::: previsao
O `values.yaml` tem `config.Documentacao__Habilitada: "false"`. O `values-dev.yaml` tem `"true"`. Você roda:

```bash
helm template cep-api charts/cep-api --set keyVault.enabled=false --set ingress.host=x.com \
  -f charts/cep-api/values-dev.yaml \
  --set-string config.Documentacao__Habilitada=false \
  | grep Documentacao
```

Qual valor sai? E se você trocasse a ordem, colocando o `--set-string` **antes** do `-f` na linha de comando?
???
Sai **`"false"`**, nas duas ordens.

A precedência do Helm é por **tipo de origem**, não pela posição na linha:

1. `values.yaml` do chart (mais fraco)
2. Arquivos `-f`, na ordem em que aparecem (o último vence entre eles)
3. `--set`, `--set-string` e afins (mais forte)

Entre vários `-f`, a ordem importa: `-f base.yaml -f prod.yaml` faz o `prod.yaml` vencer. Mas qualquer `--set` vence qualquer `-f`, em qualquer posição.

Regra de bolso para pipelines: o que muda **por ambiente** vai em arquivo `-f` versionado; o que muda **a cada deploy** (a tag da imagem) vai por `--set`.
:::

Para ver os valores que uma release **está usando** no cluster:

```bash
helm get values cep-api -n cep          # só o que foi passado (-f e --set)
helm get values cep-api -n cep --all    # tudo, já mesclado com o values.yaml
helm get manifest cep-api -n cep        # o YAML que foi aplicado
```

## 4. Histórico e volta

```bash
helm history cep-api -n cep
helm rollback cep-api 1 -n cep --wait
```

::: previsao
A release tem as revisões 1 (tag v1), 2 (tag v2) e 3 (tag v3, com bug). Você roda `helm rollback cep-api 1`. O que o `helm history` mostra depois? A revisão 3 some?
???
Aparece uma **revisão 4**, com a descrição `Rollback to 1`, e ela fica como `deployed`. A 3 continua no histórico, como `superseded`.

O rollback não apaga nada nem "volta no tempo": ele cria uma revisão nova com o conteúdo da antiga. Isso preserva a auditoria (dá para ver que a v3 existiu e foi revertida) e permite "voltar do rollback" se for preciso.

O histórico guarda até 10 revisões por padrão (`--history-max` no upgrade muda isso). As mais antigas são apagadas.
:::

::: armadilha
`helm rollback` reverte **os manifestos**, não **os dados**. Se a revisão 3 rodou uma migração que apagou uma coluna, voltar para a 1 traz de volta uma API que espera a coluna, e ela não existe mais. Por isso migração de banco precisa ser compatível com a versão anterior da aplicação (expandir primeiro, contrair depois). É assunto do módulo 3.
:::

## 5. Hooks: rodar algo antes do deploy

No nível 3 do aks-step-by-step, a migração do banco virou um **hook** do Helm (veja com `git show $(git log --format=%h --grep='^nivel-03' | tail -1):charts/cep-api/templates/migracao-job.yaml`):

```yaml
annotations:
  helm.sh/hook: pre-install,pre-upgrade
  helm.sh/hook-weight: "0"
  helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded
```

::: porque
- **`pre-install,pre-upgrade`**: o Job roda e precisa **terminar com sucesso** antes de o Helm aplicar o resto. A API nova nunca sobe com o schema velho.
- **`before-hook-creation`**: apaga o Job da execução anterior antes de criar o novo. Resolve o "Job é imutável, apague à mão" do nível 2.
- **`hook-succeeded`**: apaga o Job quando dá certo. Se falhar, ele fica, para você ler o log.
:::

::: porque Por que o hook saiu no nível 9
No [nível 9](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/09-migracao-revisada.md), a migração deixou de ser hook e passou para o pipeline, com um script SQL revisado em PR (ADR-004 do gabarito). Motivos: a API em produção roda com um usuário **sem permissão de alterar o schema**, e o SQL que muda produção precisa ser lido por uma pessoa antes. O hook rodava a migração com a imagem da própria API, ou seja, com quem não deveria ter esse poder.

Hooks continuam úteis para o que é parte do deploy e não muda dados críticos: aquecer cache, registrar a versão num sistema externo, testes de fumaça (`helm test`).
:::

## Tabela de consulta

| Quero... | Comando | Fala com o cluster? |
|---|---|---|
| Ver se o chart está bem formado | `helm lint` | Não |
| Ver o YAML final | `helm template` | Não |
| Validar no cluster sem aplicar | `helm upgrade --install ... --dry-run=server` | Sim |
| Instalar ou atualizar | `helm upgrade --install ... --wait` | Sim |
| Ver o que mudaria antes de aplicar | `helm diff upgrade ...` (plugin [helm-diff](https://github.com/databus23/helm-diff)) | Sim |
| Ver as revisões | `helm history` | Sim |
| Voltar | `helm rollback <release> <revisão> --wait` | Sim |
| Ver valores e manifesto em uso | `helm get values` / `helm get manifest` | Sim |
| Remover tudo | `helm uninstall` | Sim |

## Perguntas para responder sem olhar

::: pergunta
Por que pipelines usam `helm upgrade --install` em vez de `helm install`?
???
Porque é idempotente: instala se a release não existe e atualiza se existe. O mesmo comando serve para o primeiro deploy e para todos os seguintes, sem `if` no pipeline.
:::

::: pergunta
Um `--set` antes de um `-f` na linha de comando: quem vence?
???
O `--set`. A precedência é por tipo: `values.yaml` < arquivos `-f` (o último vence entre eles) < `--set`. A posição na linha só importa entre arquivos `-f`.
:::

::: pergunta
O que `helm rollback` faz com o histórico, e o que ele **não** desfaz?
???
Cria uma revisão nova com o conteúdo da revisão escolhida; a revisão com problema continua no histórico. Ele não desfaz efeitos fora dos manifestos, como migrações de banco já aplicadas.
:::

::: pergunta
Sem `--wait`, o que um `helm upgrade` bem-sucedido garante?
???
Só que o cluster aceitou os manifestos. Não garante que os pods ficaram prontos. Com `--wait`, o comando só termina com sucesso quando os recursos ficam prontos dentro do timeout.
:::

**Próxima:** [7.4 Labs de quebra](04-labs-de-quebra.md).
