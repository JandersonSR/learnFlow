# Perguntas de entrevista do módulo 6

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
Por que o worker do Kafka escala com KEDA e não com HPA por CPU?
???
Porque um consumidor esperando I/O tem CPU baixa mesmo com a fila crescendo, e parado não desce a zero. O KEDA escala pelo atraso do grupo, até o número de partições.
:::

::: pergunta
O que garante a entrega "pelo menos uma vez" no worker?
???
Commit manual do offset só depois de gravar no banco. Se o pod cair antes do commit, o evento é lido de novo; nada se perde, mas pode repetir.
:::

## Contêineres e Kubernetes

::: entrevista
"Como você escreve um Dockerfile para uma API .NET em produção?"
???
Build em dois estágios: o SDK compila, a imagem final só tem o runtime e o resultado publicado. Copio os arquivos de projeto e faço o `restore` antes de copiar o código, para aproveitar o cache. Na imagem final, uma base mínima (chiseled), usuário sem root, porta 8080 e, se a subida importa para a escala, ReadyToRun. E o `.dockerignore` deixa de fora `bin`, `obj`, testes e segredos.
:::

::: entrevista
"Qual a diferença entre liveness, readiness e startup probes?"
???
Startup: dá tempo para a aplicação subir, sem as outras sondas rodarem. Readiness: diz se o pod pode receber tráfego; falhando, sai do Service sem reiniciar. Liveness: diz se o processo travou; falhando, reinicia. Dependência externa (banco) só entra na readiness: reiniciar não traz o banco de volta e reinícios em massa atrasam a recuperação.
:::

::: entrevista
"Como evitar erros durante um rolling update?"
???
`maxUnavailable: 0` e `maxSurge: 1`, para só tirar um pod velho quando um novo estiver pronto; readiness que reflita de verdade a capacidade de atender; e encerramento gracioso: um `preStop` de alguns segundos para a remoção dos endpoints propagar, a aplicação terminando as requisições em andamento depois do SIGTERM, e um `terminationGracePeriodSeconds` maior que a soma dos dois. Mais um PodDisruptionBudget para manutenções de nó.
:::

::: entrevista
"Requests e limits: como você define?"
???
Request é o que o pod reserva e o que o agendador e o HPA usam; limit é o teto. Começo medindo o uso real sob carga, coloco o request perto do uso típico e o limit de memória com folga sobre o pico. Sei que CPU acima do limit só estrangula e memória acima do limit mata (`OOMKilled`). Sem request de CPU, o HPA por CPU não funciona.
:::

::: entrevista
"Um pod não sobe. Como você investiga?"
???
`get pods` para ver o estado; `describe pod` e os Events, que respondem a maioria (agendamento, imagem, sondas, OOM); `logs --previous` se ele reiniciou; eventos do namespace; e, se o pod está bem e não recebe tráfego, endpoints e seletor do Service. Para olhar por dentro de uma imagem sem shell, `kubectl debug` com contêiner efêmero.
:::

::: entrevista
"Secret do Kubernetes é seguro?"
???
Não sozinho: os valores estão em base64, legíveis para quem pode ler Secrets no namespace, e às vezes vão parar no Git por engano. Para produção: segredos num cofre (Key Vault) montados no pod pelo driver CSI com identidade de carga de trabalho, RBAC restrito para leitura de Secrets e criptografia em repouso no etcd.
:::

**Próximo módulo:** [Módulo 7: Helm](../modulo-07/README.md).
