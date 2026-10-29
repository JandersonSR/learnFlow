# Perguntas de entrevista do módulo 5

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
Por que um cache lento é pior que um cache fora do ar?
???
Fora, as operações falham rápido e a aplicação segue pela origem. Lento, cada requisição espera, e a aplicação inteira fica lenta. Timeouts curtos transformam cache lento em cache ausente.
:::

::: pergunta
Como renomear uma coluna sem downtime?
???
Expand/contract: acrescenta a nova, grava nas duas e lê da nova com fallback, copia os dados, passa a usar só a nova e remove a velha quando nenhuma versão em uso ou candidata a rollback depende dela.
:::

## Mensageria

::: entrevista
"Kafka ou RabbitMQ?"
???
Depende do que trafega. Para fatos que vários sistemas querem saber, com volume alto e necessidade de reprocessar o passado, Kafka: é um log, ler não remove, cada grupo tem seus offsets. Para tarefas que devem ser executadas uma vez cada, com paralelismo livre e tratamento individual de mensagem com erro, uma fila como o RabbitMQ ou o Service Bus é mais simples. No Kafka, o paralelismo é limitado pelas partições e a ordem só existe por partição.
:::

::: entrevista
"Como garantir a ordem de eventos no Kafka?"
???
A ordem só existe dentro de uma partição, então uso como chave o identificador da entidade (o pedido, o cliente): todos os eventos dela caem na mesma partição e são lidos em ordem, por um consumidor do grupo. Do lado do produtor, idempotência ligada para reenvios não embaralharem a ordem. E aceito que eventos de entidades diferentes não têm ordem entre si.
:::

::: entrevista
"Como você publica um evento depois de gravar no banco sem perder nada?"
???
Padrão outbox: gravo o evento numa tabela do mesmo banco, na mesma transação do dado. Um processo separado lê as pendentes (com `FOR UPDATE SKIP LOCKED` se houver vários), publica esperando a confirmação e marca como publicadas. Nada se perde, mas pode haver duplicata se ele publicar e cair antes de marcar, então o consumidor precisa ser idempotente. Se perder alguns eventos for aceitável, como numa estatística, publico direto e assíncrono, sem outbox.
:::

::: entrevista
"Explique at-least-once e exactly-once."
???
At-least-once: confirmo o offset depois de processar; nada se perde, mas se o consumidor cair entre processar e confirmar, o evento é processado de novo. Exactly-once, na prática: at-least-once mais processamento idempotente, ou o offset gravado na mesma transação do efeito. Garantir exactly-once de ponta a ponta envolvendo sistemas externos, sem idempotência, não existe.
:::

::: entrevista
"Uma mensagem com erro está travando o seu consumidor. O que você faz?"
???
Separo falha transitória de permanente. Transitória (banco fora, timeout): repito a mesma mensagem com espera crescente, sem avançar o offset. Permanente (formato inválido, bug para aquele tipo de evento): não adianta repetir; mando para um tópico de mensagens mortas com o motivo, confirmo e sigo, para não travar a partição. E alerto pelo crescimento do DLT e pelo atraso do grupo.
:::

::: entrevista
"Como você escala consumidores de Kafka no Kubernetes?"
???
Pelo atraso do grupo, com KEDA, não pela CPU: um consumidor esperando I/O tem CPU baixa com a fila crescendo. O máximo de réplicas é o número de partições. Escala a zero quando não há atraso, sabendo que o primeiro evento espera o polling e a subida do pod. E sei que escalar não resolve dependência fora: com o banco caído, mais réplicas só tentam mais. Para isso, alerta pelo atraso.
:::

**Próximo módulo:** [Módulo 6: contêiner e Kubernetes do zero](../modulo-06/README.md).
