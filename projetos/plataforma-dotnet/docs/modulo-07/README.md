# Módulo 7: Helm: empacotar, versionar e voltar um deploy

**Objetivo:** entender que problema o Helm resolve, ler o chart `cep-api` sabendo o que cada linha faz, escolher cada comando sabendo por que ele e não outro, e diagnosticar sozinho os erros mais comuns de um `helm upgrade`.

## Pré-requisitos

- Kubernetes básico: pod, deployment, service, configmap, secret. Se ainda não tem, faça os módulos 01 a 06 do [kub-learn-flow](https://github.com/JandersonSR/kub-learn-flow) antes.
- Helm instalado (`winget install Helm.Helm` no Windows, `brew install helm` no Mac, ou [as instruções oficiais](https://helm.sh/docs/intro/install/)).
- O [aks-step-by-step](https://github.com/JandersonSR/aks-step-by-step) clonado.

Quase tudo deste módulo roda **sem cluster**: `helm lint` e `helm template` só leem arquivos. Para os labs que instalam de verdade, um Minikube ou kind local basta.

## O que você vai conseguir fazer no fim

- Explicar o que o Helm resolve que YAML puro e `sed` não resolvem, e quando o Kustomize seria melhor
- Ler qualquer template do chart e prever o YAML que ele gera
- Explicar a ordem de precedência dos valores (`values.yaml`, `-f`, `--set`) sem consultar
- Usar `upgrade --install`, `--wait`, `history` e `rollback`, sabendo o que cada um faz por baixo
- Diagnosticar `another operation is in progress`, hook que falha e ConfigMap que não muda os pods

## Lições

| # | Lição | Tempo |
|---|---|---|
| 7.1 | [O problema: por que não só YAML](01-o-problema.md) | 40 min |
| 7.2 | [Anatomia do chart `cep-api`](02-anatomia-do-chart.md) | 75 min |
| 7.3 | [Os comandos, e por que cada um](03-comandos-e-porques.md) | 60 min |
| 7.4 | [Labs de quebra](04-labs-de-quebra.md) | 90 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Onde está a prática

O guia de comandos do [nível 3 do aks-step-by-step](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/03-helm.md) instala o chart no AKS. Este módulo explica o que está acontecendo em cada passo dele; faça os dois lado a lado.

::: armadilha Helm 3 ou Helm 4?
O Helm 4 saiu no fim de 2025. Os comandos deste módulo funcionam nos dois, com uma diferença: no Helm 4, `--atomic` virou `--rollback-on-failure` e `--force` virou `--force-replace` (os nomes antigos ainda funcionam, com aviso). Confira a sua com `helm version`.
:::

## Entregável do módulo

Um runbook de uma página para o time: **"O deploy com Helm falhou. O que eu faço?"**, com os três erros da lição 7.4, o comando que diagnostica cada um e a saída esperada.
