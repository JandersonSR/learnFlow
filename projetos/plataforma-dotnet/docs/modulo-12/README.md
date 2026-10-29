# Módulo 12: projeto final: incidente simulado, post-mortem, ADRs e apresentação ao time

**Objetivo:** provar, para você e para o time, que sabe operar e defender a plataforma inteira: diagnosticar um incidente sem roteiro, escrever o post-mortem, registrar as decisões de arquitetura com trade-offs e ensinar o que aprendeu.

Este módulo não tem lição nova. Ele junta os outros 11 do jeito que o trabalho real junta: tudo ao mesmo tempo, sem dizer qual módulo é.

## As quatro partes

| # | Parte | Tempo | Entregável |
|---|---|---|---|
| 12.1 | [Game day: o incidente simulado](01-game-day.md) | 2 a 3 h por cenário | Diagnóstico e correção, com a linha do tempo anotada |
| 12.2 | [Post-mortem sem culpados](02-post-mortem.md) | 1 h | Um post-mortem de uma página |
| 12.3 | [ADRs: as decisões que você defende](03-adrs.md) | 3 a 4 h | Três ADRs |
| 12.4 | [Apresentação, entrevista simulada e autoavaliação](04-apresentacao-e-autoavaliacao.md) | 2 h | Apresentação ao time e a tabela do módulo 0 refeita |

## Como fazer com o time

O game day funciona melhor **em dupla**: uma pessoa é a **facilitadora**, que quebra o ambiente em segredo seguindo o roteiro do cenário, e a outra é a **plantonista**, que recebe só o sintoma, como chegaria num chamado. Depois trocam. Para quem lidera um time, este módulo é também um formato pronto para treinar plantão com as outras pessoas.

::: checkpoint
Antes de começar, confira que você consegue, sem consultar:

- Subir o ambiente local com `docker compose up --build` e o laboratório no Minikube da lição 7.4
- Explicar o caminho de uma requisição e de um deploy (módulo 0)
- Usar a escada de diagnóstico da lição 6.4

Se alguma faltar, volte ao módulo correspondente. O game day não ensina; ele mostra o que ficou.
:::
