# Módulo 11: GitOps com Argo CD: o cluster puxa, o Git é a fonte da verdade

**Objetivo:** entender a troca do modelo push (o pipeline aplica no cluster) pelo modelo pull (o cluster aplica o que está no Git), ler a `Application` do Argo CD campo por campo, e operar o dia a dia: publicar, voltar uma versão, entender um `OutOfSync` e não brigar com o HPA.

## O que você vai conseguir fazer no fim

- Explicar os princípios do GitOps e o que muda em segurança e auditoria em relação ao push
- Explicar cada campo da `Application` do projeto, inclusive `prune`, `selfHeal` e as `sync-waves`
- Explicar o fluxo completo de um deploy, do `git push` ao pod novo, e por que o commit do bot tem `[skip ci]`
- Voltar uma versão com `git revert` e explicar por que isso é melhor que `helm rollback` aqui
- Diagnosticar uma Application `OutOfSync` ou `Degraded`

## Lições

| # | Lição | Tempo |
|---|---|---|
| 11.1 | [Push contra pull, e a Application do Argo CD](01-push-pull-e-application.md) | 60 min |
| 11.2 | [O fluxo de um deploy, e a volta](02-fluxo-de-deploy.md) | 50 min |
| 11.3 | [Operar: diagnóstico, ambientes e segredos](03-operacao.md) | 45 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Onde está a prática

[Nível 11](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/11-gitops-argocd.md) do aks-step-by-step, com a `Application` em [`infra/30-app/argocd-app.tf`](https://github.com/JandersonSR/aks-step-by-step/blob/main/infra/30-app/argocd-app.tf).

## Entregável do módulo

Uma apresentação de 20 minutos para o time: **"Como publicamos e como voltamos uma versão"**, com o fluxo da lição 11.2 desenhado e uma demonstração de `git revert`.
