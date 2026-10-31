# Perguntas de entrevista do módulo 5

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão do módulo 4

::: pergunta
O que é a coluna `xmin` e como ela vira concorrência otimista no EF Core?
???
Coluna de sistema do Postgres com o id da transação que gravou a versão atual da linha; muda a cada escrita. Uma propriedade `uint` com `IsRowVersion()` faz o Npgsql usá-la no `WHERE` do `UPDATE`; zero linhas = `DbUpdateConcurrencyException`.
:::

::: pergunta
Por que a proposta não guarda só o `simulacao_id`?
???
A simulação mora em outro banco, é temporária (TTL) e o cliente aceitou aquelas condições naquele momento. A proposta copia as condições e fica autossuficiente.
:::

## Cache

::: entrevista
"Por que Dragonfly e não Redis?"
???
Para o cliente, é o mesmo protocolo: trocar é trocar a imagem, e os testes de integração rodam contra a imagem escolhida. Por dentro, o Dragonfly é multithread com as chaves divididas entre threads, escala verticalmente sem cluster e faz snapshot sem `fork`. O custo: compatibilidade alta mas não total, e licença BSL, que eu confiro se o produto for oferecido como serviço. Redis 8 (AGPL) e Valkey são alternativas legítimas; a decisão é operacional, não de código.
:::

::: entrevista
"O que você nunca colocaria em cache num sistema financeiro?"
???
O que decide dinheiro, crédito ou permissão: status de proposta, saldo e situação de parcelas, chaves de idempotência de pagamento, roles do usuário. E evito dado pessoal. Esses vêm da fonte da verdade com as garantias dela. Cache é para o que pode estar desatualizado por um tempo conhecido e aceito, e não decide nada sozinho, como uma tabela de taxas usada numa simulação que não é contrato.
:::

::: entrevista
"Como você invalida um cache local em várias réplicas?"
???
Removo da camada distribuída e do local de quem mudou, e aviso as outras réplicas por pub/sub para apagarem o local. Pub/sub é no máximo uma vez, então a validade curta do local é o limite de divergência quando o aviso se perde. O gatilho da invalidação é o evento de mudança do dado (que, este sim, vai num canal confiável como o Kafka).
:::

::: entrevista
"O cache caiu. O que acontece com a sua API?"
???
Fica um pouco mais lenta, não fora. A conexão é criada sem abortar se o cache estiver fora, com timeouts curtos para cache lento virar cache ausente; o HybridCache trata erro de leitura como ausência e de gravação como log; o local continua servindo; e o cache não está na readiness, senão uma queda dele tiraria todos os pods do ar. O problema aparece em log e métrica para alguém agir.
:::

::: entrevista
"O que é cache stampede, e a proteção do HybridCache resolve entre pods?"
???
Muitas requisições pedem ao mesmo tempo uma chave ausente e todas vão à origem. O `GetOrCreateAsync` executa a fábrica uma vez por chave **por processo**; com N pods, até N idas. Se N for demais para a origem, trava distribuída ou renovação antecipada, com os custos delas. E confiro que o código não contorna a proteção (ler, se nulo buscar, gravar).
:::

::: entrevista
"Como você escolhe a validade de um cache?"
???
Pela pergunta "quanto tempo este dado pode estar errado e quem paga se estiver", não pela frequência de leitura. Com duas camadas, o pior caso sem invalidação é a soma das validades. Escolho o L2 pelo custo da origem e o L1 curto, porque é ele que limita a divergência entre réplicas e o atraso de uma invalidação que não chegou.
:::

::: entrevista
"Por que versionar a chave do cache?"
???
Porque o formato do valor muda com o código, e no rolling update convivem versões velhas e novas lendo o mesmo cache distribuído. Com a versão na chave, cada uma lê o formato que entende, e as chaves velhas vencem sozinhas.
:::

::: entrevista
"Que cuidado o cache exige com LGPD?"
???
Cache é mais uma cópia de dado: precisa de finalidade, prazo e exclusão. Evito guardar dado pessoal; quando preciso, guardo o mínimo derivado (a faixa em vez do score e da renda), de preferência só em memória, com validade curta, e garanto que a exclusão do titular apaga também o que está em cache.
:::

**Próximo módulo:** [Módulo 6: Kafka, outbox, saga de desembolso e consumidor idempotente](../modulo-06/README.md).
