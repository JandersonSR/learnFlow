# Perguntas de entrevista do módulo 8

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
Por que o relay da outbox do CreditFlow usa faixas em vez de `FOR UPDATE SKIP LOCKED` direto nas linhas? (módulo 6)
???
SKIP LOCKED nas linhas evita que dois relays publiquem a mesma mensagem, mas não preserva a ordem por chave: com fila acumulada, relays diferentes publicam eventos da mesma proposta em paralelo. Com faixas (hash estável da chave), cada chave fica com um relay por vez.
:::

::: pergunta
Por que uma réplica nova do worker não processa mensagens repetidas depois de um rebalanceamento? (módulo 6)
???
Ela pode receber repetidas (os offsets não confirmados voltam), mas o efeito não se repete: a inbox na mesma transação do efeito, o índice único por proposta e a chave de idempotência no gateway descartam a repetição.
:::

## Escala

::: entrevista
"Como você escalaria só uma parte de um monolito?"
???
Perfis de execução: a mesma imagem sobe com uma lista de módulos e um papel (api ou worker), um Deployment por perfil, cada um com recursos e escala próprios, e o ingress roteando por caminho. A Simulação escala por CPU sem levar o resto junto; o worker escala pelo lag. Custa uma imagem para todos (sem deploy independente) e exige que os módulos não assumam que outro está no mesmo processo.
:::

::: entrevista
"Que métrica você usa para escalar um consumidor de fila?"
???
O lag do grupo de consumidores, com KEDA, não CPU: um consumidor I/O-bound tem CPU baixa com a fila crescendo. A conta é ceil(lag / lagThreshold), limitada ao número de partições, porque cada partição vai para um membro só. Mínimo e janela de descida pensados para não ficar rebalanceando; e alerta de lag com réplicas no máximo, porque aí o gargalo é a dependência.
:::

::: entrevista
"O HPA está configurado e mesmo assim o pico derruba a latência. Por quê?"
???
Escala automática leva tempo: perceber (coleta de métrica), agendar, subir o pod e passar a readiness; se faltar nó, minutos. Durante esse tempo, quem segura é a capacidade que já existe. Ajusto a folga: alvo de CPU mais baixo, mínimo maior (inclusive por horário, com cron), pods que sobem mais rápido, readiness honesta. E meço a fase de pico separada no teste de carga, porque a média esconde isso.
:::

::: entrevista
"Por que sua API CPU-bound não tem limite de CPU?"
???
Porque limite de CPU no Linux vira throttling do CFS, e a latência de cauda explode exatamente sob carga. O request garante a reserva e é a base do HPA; sem limite, o pod aproveita CPU ociosa do nó. O risco de vizinho barulhento eu trato com espalhamento por nó e, se precisar, um pool de nós dedicado. Memória, sim, tem limite.
:::

::: entrevista
"Como você testa carga de uma API?"
???
Com modelo aberto (taxa de chegada), porque no modelo fechado o gerador alivia quando a API degrada e esconde o problema. Cenários com linha de base, rampa mais rápida que o autoscaler e sustentação; thresholds que reprovam (p95, p99, taxa de erro, dropped iterations); métricas de negócio quando o fluxo é assíncrono, como o tempo até o desembolso. E cuidado para não medir o rate limiter em vez da API.
:::

::: entrevista
"O que um PodDisruptionBudget protege e quando ele atrapalha?"
???
Protege contra interrupções voluntárias, como dreno de nó em atualização ou o cluster autoscaler removendo nó: garante que sobrem N pods. Atrapalha quando é impossível de cumprir, como minAvailable 1 com uma réplica: o dreno trava. Para o worker com mínimo 1 uso maxUnavailable 1; o lag acumula no tópico e nada se perde.
:::

::: entrevista
"Quando você extrairia um microsserviço do monolito?"
???
Quando houver um problema que perfis não resolvem: time próprio com ritmo de deploy incompatível, stack diferente, isolamento de código ou dados por compliance, escala de dados que exige outro banco. Escala de processamento sozinha não justifica. E faria com strangler: primeiro corto chamadas síncronas dentro do monolito, depois mudo a imagem dos Deployments mantendo grupo Kafka, schema e rota, e por último, se precisar, movo os dados.
:::

::: entrevista
"Quantas réplicas do consumidor você pode ter?"
???
No máximo o número de partições do tópico para o grupo; acima disso, réplicas ociosas. Para crescer, mais partições, planejando a transição porque a chave passa a cair em outra partição para mensagens novas e a ordem por chave pode quebrar durante a troca. Também conto conexões: réplicas × pool contra o max_connections do banco.
:::

**Próximo módulo:** [Módulo 9: Azure com Terraform](../modulo-09/README.md).
