# Perguntas de entrevista do módulo 11

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
O que a política `deployment_security` do Harbor cobre que o scan no pipeline não cobre?
???
Imagens enviadas por fora do pipeline, CVEs publicadas depois do deploy (pods novos não sobem com a imagem) e o intervalo antes do scan terminar.
:::

::: pergunta
Por que o projeto divide o Terraform em camadas?
???
Os providers do cluster precisam de um cluster que só existe depois da camada da Azure; planos menores são revisáveis; camadas com ritmos diferentes ficam isoladas, e um erro numa não destrói recursos de outra.
:::

## GitOps

::: entrevista
"O que é GitOps e por que adotar?"
???
É declarar o estado desejado do ambiente no Git e ter um agente dentro do cluster (Argo CD, Flux) que compara o Git com o que roda e corrige a diferença. Ganho segurança, porque a credencial do cluster não sai dele; auditoria, porque o Git registra o que roda e quem mudou; consistência, porque mudanças manuais são desfeitas; e um jeito simples de voltar versão, o `git revert`. O custo é disciplina: tudo, inclusive correção de emergência, passa pelo Git.
:::

::: entrevista
"Como o pipeline publica uma versão sem acesso ao cluster?"
???
Ele constrói, analisa e publica a imagem no registry e, quando ela está pronta para rodar, grava a tag nova no arquivo de values do ambiente com um commit que não dispara o próprio pipeline (`[skip ci]`). O Argo CD percebe o commit e aplica. Em times maiores, os values ficam num repositório GitOps separado, e a promoção entre ambientes é um PR.
:::

::: entrevista
"Como você faz rollback com Argo CD?"
???
`git revert` do commit de deploy: o Argo CD aplica a versão anterior e o histórico registra a volta. Não volto direto no cluster, porque o `selfHeal` desfaria. O rollback da interface do Argo CD exige desligar a sincronização automática, então prefiro o revert. E lembro que o revert volta o código, não o banco: por isso as migrações são compatíveis com a versão anterior.
:::

::: entrevista
"Argo CD e HPA podem brigar? Como evitar?"
???
Podem, se o manifesto declarar `replicas`: o HPA muda, o Argo CD vê diferença do Git e volta. Evito deixando `replicas` fora do manifesto quando o HPA está ligado, para o número de réplicas não ser estado desejado. O mesmo vale para outros campos que controladores mudam de propósito: fora do manifesto, ou em `ignoreDifferences`.
:::

::: entrevista
"Sua Application está Synced, mas a aplicação está fora do ar. Como pode?"
???
Sync só diz que o cluster está igual ao Git. Se a versão no Git está quebrada (imagem errada, configuração inválida, sonda errada), o Argo CD aplica fielmente uma versão quebrada, e o Health fica `Degraded`. Investigo como qualquer problema de pod (estado, eventos, logs) e corrijo pelo Git, revertendo ou consertando.
:::

::: entrevista
"Como você trata segredos em GitOps?"
???
Fora do Git. Um cofre (Key Vault, Vault) como fonte, com os segredos chegando ao pod por driver CSI ou pelo External Secrets Operator; ou Sealed Secrets, criptografados para o Git e descriptografados só no cluster. O Git guarda referências. E segredo que vazou para o Git é tratado como vazado: troca primeiro, limpa o histórico depois.
:::

**Próximo módulo:** [Módulo 12: projeto final](../modulo-12/README.md).
