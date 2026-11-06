# Módulo 11: GitOps com Argo CD

**Objetivo:** fazer o cluster **puxar** do Git tudo o que roda nele, na ordem certa: operadores antes dos recursos deles, recursos antes da aplicação, migração antes da versão nova. Você liga o Terraform ao GitOps por uma ponte estreita (um Secret e uma Application), monta um **app-of-apps** com ondas de sincronização que de fato esperam, gera a aplicação de cada ambiente com um **ApplicationSet**, promove de dev para prod por pull request e volta uma versão com `git revert`.

## O que você vai conseguir fazer no fim

- Explicar o que o Terraform entrega ao Argo CD e por que nada além disso
- Ler o chart `gitops/raiz` e dizer em que ordem cada componente sobe, e por que a ordem só funciona com uma verificação de saúde que o Argo CD **não** tem por padrão
- Usar hooks (PreSync, Sync) e ondas juntos, e prever o que acontece no primeiro sync de um cluster vazio
- Gerar a Application de cada ambiente com o gerador `clusters` de um ApplicationSet, e lidar com dois motores de template no mesmo arquivo
- Promover o mesmo digest de dev para prod por PR, voltar uma versão, e diagnosticar drift e `OutOfSync` eterno

## O que você constrói

- A ponte: [`infra/terraform/30-app/main.tf`](https://github.com/JandersonSR/lending-plataform/blob/main/infra/terraform/30-app/main.tf)
- O app-of-apps: [`gitops/raiz/`](https://github.com/JandersonSR/lending-plataform/blob/main/gitops/raiz/templates/apps.yaml) e o [ApplicationSet da aplicação](https://github.com/JandersonSR/lending-plataform/blob/main/gitops/raiz/arquivos/applicationset-creditflow.yaml)
- Os valores por ambiente: [`gitops/ambientes/dev`](https://github.com/JandersonSR/lending-plataform/blob/main/gitops/ambientes/dev/creditflow.yaml) e `prod`
- Os workflows de promoção: o job `promover-dev` do [`ci.yml`](https://github.com/JandersonSR/lending-plataform/blob/main/.github/workflows/ci.yml) e o [`promover.yml`](https://github.com/JandersonSR/lending-plataform/blob/main/.github/workflows/promover.yml)
- A ADR [0009: GitOps com Argo CD](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0009-argo-cd.md)

## Pré-requisitos

- Módulos 9 (camadas 00 a 20 aplicadas) e 10 (Harbor com o projeto `creditflow` e os robôs)
- `argocd` CLI (opcional; tudo dá para fazer com `kubectl`)
- A base de GitOps (push x pull, a Application campo por campo, `prune` e `selfHeal`, fluxo de deploy e rollback) está no módulo 11 da Plataforma: [11.1](../../../plataforma-dotnet/docs/modulo-11/01-push-pull-e-application.md), [11.2](../../../plataforma-dotnet/docs/modulo-11/02-fluxo-de-deploy.md), [11.3](../../../plataforma-dotnet/docs/modulo-11/03-operacao.md). Leia antes: aqui o assunto é orquestrar **muitos** componentes e **dois** ambientes

## Lições

| # | Lição | Tempo |
|---|---|---|
| 11.1 | [A ponte e a raiz](01-a-ponte-e-a-raiz.md) | 50 min |
| 11.2 | [Ondas e hooks: a ordem que espera de verdade](02-ondas-e-hooks.md) | 60 min |
| 11.3 | [ApplicationSet e ambientes](03-applicationset-e-ambientes.md) | 50 min |
| 11.4 | [Promoção, rollback e drift](04-promocao-rollback-e-drift.md) | 60 min |
| — | [Desafio do módulo](desafio.md) | 2–3 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |

Tempo estimado: **7 a 8 horas**, contando o desafio.

## Entregável do módulo

Um cluster dev criado do zero (`terraform apply` das camadas e nenhum `kubectl apply` seu) chegando sozinho a todas as Applications `Synced/Healthy`, com a linha do tempo das ondas anotada (o horário em que cada uma ficou saudável), e um rollback feito por `git revert`.
