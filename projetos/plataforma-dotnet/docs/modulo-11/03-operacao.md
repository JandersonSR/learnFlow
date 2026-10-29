# 11.3 Operar: diagnóstico, ambientes e segredos

## Os dois status de uma Application

A Application tem **dois** status independentes, e confundir os dois é o erro mais comum de quem começa:

| Status | Pergunta | Valores |
|---|---|---|
| **Sync** | O cluster está igual ao Git? | `Synced`, `OutOfSync` |
| **Health** | O que está no cluster está funcionando? | `Healthy`, `Progressing`, `Degraded`, `Missing` |

`Synced` + `Degraded` é perfeitamente possível: o Argo CD aplicou exatamente o que está no Git, e os pods estão em `CrashLoopBackOff` porque a versão no Git está quebrada. O Argo CD faz o cluster ficar igual ao Git; ele não garante que o Git esteja certo.

```bash
kubectl get application -n argocd                     # SYNC STATUS e HEALTH STATUS
kubectl describe application cep-api -n argocd        # condições, erros de sincronização, último resultado
```

::: previsao
Depois de um merge, a Application fica `OutOfSync` e não sincroniza, com uma condição `ComparisonError: ... ingress.host é obrigatório ...`. Os pods antigos continuam rodando. O que aconteceu, e onde você corrige?
???
O Argo CD **não conseguiu renderizar** o chart: o `fail` do template do Ingress (lição 7.2) disparou porque o `ingress.host` chegou vazio. Sem conseguir gerar o YAML, ele nem compara com o cluster, então nada é aplicado, e os pods antigos continuam (o que é bom).

A correção não é no cluster: é onde o valor vem. No projeto, o `ingress.host` é um **parâmetro** da Application, vindo da variável `ingress_host` da camada 30 do Terraform. Um `terraform apply` da camada 30 sem essa variável deixaria o parâmetro vazio. Corrige-se no Terraform e aplica-se de novo.

É o mesmo `fail` que você viu no `helm template` local, agora aparecendo no Argo CD. Rodar `helm template` com os mesmos valores, na sua máquina, reproduz o erro em segundos.
:::

## Tabela de diagnóstico

| Sintoma | Onde olhar | Causa comum |
|---|---|---|
| `OutOfSync` com erro de repositório | `describe application` | Repositório privado sem a credencial de leitura (`TF_VAR_github_token`) |
| `ComparisonError` | `describe application`; reproduza com `helm template` | Valor obrigatório faltando, erro de template |
| `Synced` e `Degraded` | `kubectl get pods`, `describe pod` (módulo 6) | A versão no Git está quebrada: imagem, configuração, sonda |
| Sempre `OutOfSync` por um campo que você não mudou | A aba *Diff* na interface | Campo mudado por outro controlador; tire do manifesto ou use `ignoreDifferences` |
| Pods `ImagePullBackOff` logo depois de recriar o ambiente | `describe pod` | O registry novo ainda não tem a imagem: rode o pipeline |
| O deploy demorou 3 minutos para começar | — | Normal: o Argo CD consulta o Git a cada ~3 min. *Refresh* força na hora; um webhook do GitHub tornaria imediato |

## Mais de um ambiente

O laboratório tem um ambiente só (`values-dev.yaml`). Com homologação e produção, os padrões de mercado:

| Padrão | Como |
|---|---|
| **Um arquivo de values por ambiente** | `values-dev.yaml`, `values-hml.yaml`, `values-prd.yaml`, e uma Application por ambiente, cada uma com o seu arquivo |
| **Promoção por commit** | Publicar em produção é copiar a tag aprovada em homologação para o `values-prd.yaml`, num PR que alguém aprova |
| **ApplicationSet** | Um gerador que cria uma Application por ambiente (ou por cluster) a partir de um modelo, em vez de declarar cada uma à mão |
| **App of apps** | Uma Application que aponta para uma pasta de Applications, para gerenciar todas pelo Git |

::: porque Promoção por PR
O que muda entre homologação e produção é só a **tag**, que já foi testada. Promover vira um diff de uma linha, revisado por outra pessoa, com o registro de quem aprovou. É o mesmo fluxo de código, aplicado ao deploy.
:::

## Segredos não vão para o Git

GitOps diz "tudo no Git", e segredo é a exceção óbvia. No projeto:

- Os segredos de verdade (a connection string) vivem no **Key Vault** e chegam ao pod pelo driver CSI (módulo 8). O Git só tem o **nome** do cofre e da identidade, que não dão acesso sozinhos.
- Os IDs que mudam a cada recriação do ambiente entram como **parâmetros** da Application, vindos do Terraform, não do Git.
- O único Secret criado fora do cofre, o `harbor-pull`, é criado pelo Terraform, não pelo Argo CD.

Outras saídas comuns: **External Secrets Operator** (sincroniza do cofre para Secrets do Kubernetes) e **Sealed Secrets** (o segredo vai criptografado para o Git, e só o cluster descriptografa).

::: armadilha
"Vou só colocar a senha no `values-dev.yaml` para testar" é como segredos vão parar no histórico do Git, onde ficam **para sempre**, mesmo depois de um commit que os remove. Se acontecer, considere o segredo vazado: troque-o no cofre (a rotação sem reinício do módulo 8 ajuda), e só depois limpe o histórico.
:::

## Perguntas para responder sem olhar

::: pergunta
Qual a diferença entre o status Sync e o status Health de uma Application?
???
Sync diz se o cluster está igual ao Git; Health diz se o que está no cluster funciona. Uma Application pode estar `Synced` e `Degraded` quando a versão no Git está quebrada.
:::

::: pergunta
Como promover uma versão de homologação para produção em GitOps?
???
Com um commit (de preferência num PR aprovado por outra pessoa) que copia a tag testada em homologação para o arquivo de values de produção. O Argo CD do ambiente de produção aplica.
:::

::: pergunta
Como lidar com segredos num fluxo GitOps?
???
Fora do Git: num cofre (Key Vault) montado no pod pelo driver CSI, ou sincronizado por um operador como o External Secrets; ou criptografados com Sealed Secrets. O Git guarda só referências (nomes), que não dão acesso sozinhas.
:::

**Próxima:** [Perguntas de entrevista do módulo](perguntas-de-entrevista.md).
