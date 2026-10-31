# Módulo 2: Perguntas de entrevista

Responda **em voz alta** antes de abrir. Uma boa resposta cabe em 1 a 2 minutos. As respostas são o que
um sênior diria; elas citam o OrderFlow porque, em entrevista, um exemplo seu vale mais que uma definição.
Estas perguntas cobrem boa parte do núcleo da certificação **CCDAK** (Confluent Certified Developer for Apache Kafka).

::: entrevista 1. Como o Kafka garante a ordem das mensagens?
???
Só dentro de uma partição: é um log append-only, e o consumidor lê em ordem de offset. Entre partições
não há ordem. Para ordenar o que precisa de ordem, uso uma chave: no OrderFlow é o orderId, então todos
os eventos de um pedido caem na mesma partição. Do lado do producer, a idempotência mantém a ordem mesmo
com retries e várias requisições em voo. Do lado do consumer, processo uma mensagem por vez por
partição; se eu paralelizar dentro da partição, perco a ordem. E cuidado com aumentar partições: muda o
mapeamento das chaves para as mensagens novas.
:::

::: entrevista 2. O que é um consumer group e como você dimensiona o número de consumidores?
???
Um conjunto de consumidores com o mesmo group.id que dividem as partições: cada partição tem um dono
por vez, e o offset confirmado é guardado por grupo. O paralelismo máximo é o número de partições; mais
consumidores que partições ficam ociosos. Então dimensiono pelas partições: estimo o throughput de um
consumidor, divido o pico esperado, e deixo folga, porque aumentar partições depois tem custo. Sistemas
diferentes que querem os mesmos eventos usam grupos diferentes.
:::

::: entrevista 3. Explique at-most-once, at-least-once e exactly-once.
???
Depende de quando o offset é confirmado em relação ao processamento. Antes de processar: no máximo uma
vez, pode perder. Depois: pelo menos uma vez, pode repetir. Exatamente uma vez existe no Kafka para o
caso Kafka → Kafka, com transações (consome, produz e confirma o offset na mesma transação). Quando o
efeito é num banco, como no OrderFlow, o que se faz é pelo menos uma vez com consumidor idempotente:
deduplico pelo eventId numa tabela inbox, na mesma transação do efeito. O resultado é efetivamente uma vez.
:::

::: entrevista 4. Para que serve acks=all, e ele sozinho garante que não perco mensagens?
???
O líder só confirma depois que todas as réplicas em sincronia gravaram. Sozinho não basta: se o ISR
encolher para só o líder, acks=all vira acks=1 na prática. Por isso combino com min.insync.replicas=2 e
fator de replicação 3: com menos de 2 réplicas em dia, o broker recusa a escrita. E no producer,
idempotência ligada para o retry não duplicar. No .NET isso é explícito, porque o librdkafka não liga a
idempotência por padrão, ao contrário do cliente Java.
:::

::: entrevista 5. O que causa um rebalance e como você reduz o impacto?
???
Membro entrando, saindo, morrendo (sem heartbeat por session.timeout) ou travando (sem poll por
max.poll.interval), e mudança de partições. Para reduzir: assignor cooperativo, que só revoga as
partições que mudam de dono; Close() no shutdown para o rebalance ser imediato e não esperar o timeout;
processamento por mensagem curto, com retry limitado, para não estourar o max.poll.interval; static
membership quando o consumidor tem estado; e avaliar o protocolo novo do KIP-848, estável desde o Kafka
4.0, em que o broker calcula a distribuição de forma incremental.
:::

::: entrevista 6. Seu consumer está com lag crescendo. Como investiga?
???
Primeiro, é em todas as partições ou em uma? Em uma só, suspeito de chave quente ou de uma mensagem
travando a partição (retry infinito, poison message): olho o offset parado e os logs daquela partição.
Em todas, é capacidade: o consumidor é mais lento que o produtor. Aí meço o tempo por mensagem (o que é
lento: banco, chamada externa?), vejo se há membros ociosos (mais consumidores que partições) e se há
rebalances frequentes (logs de rebalance, max.poll.interval estourando). As saídas são otimizar o
processamento, processar em lote, ou aumentar partições e consumidores.
:::

::: entrevista 7. Dois serviços em linguagens diferentes produzem no mesmo tópico com a mesma chave. Que problema pode aparecer?
???
O particionador padrão é diferente: murmur2 no cliente Java, CRC32 (consistent_random) no librdkafka,
que é a base do .NET, Python e Go da Confluent. A mesma chave cai em partições diferentes, a ordem por
chave se perde e joins entre tópicos co-particionados param de funcionar. No OrderFlow, o .NET usa
Partitioner.Murmur2Random para ficar igual ao Java.
:::

::: entrevista 8. Como você desenha o contrato de um evento consumido por outro time, em outra linguagem?
???
Nunca serializo a classe de domínio: tenho um DTO de contrato e um mapeamento explícito, para um rename
no domínio quebrar o teste e não a integração. Tipos que se comportam igual em toda linguagem: dinheiro
como texto decimal, datas ISO-8601 em UTC, ids como texto. Um eventId para deduplicação, um eventType,
e a chave de particionamento pensada pela ordem que o consumidor precisa. Consumidor tolerante: ignora
campo e tipo desconhecidos. E, para não depender de disciplina, schema registrado com regra de
compatibilidade, que é o Módulo 3.
:::

::: entrevista 9. Por que usar eventos entre Orders e Payments em vez de uma chamada HTTP?
???
Desacoplamento no tempo e na disponibilidade: se o Payments cai, o Orders continua criando pedidos, e o
Payments processa o atraso quando volta. Com HTTP síncrono, a indisponibilidade de um vira a do outro,
e eu precisaria de retry, timeout e circuit breaker em cada chamada. O custo é consistência eventual: o
Payments pode não conhecer um pedido criado há 5 ms, e o desenho precisa decidir o que fazer nesse
caso. E corridas entre serviços passam a exigir compensações (uma saga), como o estorno automático
quando um pedido pago é cancelado ao mesmo tempo.
:::

::: entrevista 10. O que acontece com a mensagem se o seu handler demorar mais que max.poll.interval.ms?
???
O cliente sai do grupo, a partição vai para outro membro, que reprocessa a partir do último offset
confirmado: a mesma mensagem é processada duas vezes, possivelmente ao mesmo tempo. Quando o handler
original termina, o commit falha porque a partição não é mais dele. Por isso handlers têm timeout,
retry curto e são idempotentes.
:::

Próximo módulo: [3. Kafka em produção](../modulo-03/README.md).
