# Módulo 5: Perguntas de entrevista

Responda **em voz alta** antes de abrir. Decisão, motivo e custo.

## Kafka no Kubernetes

::: entrevista
"Você colocaria Kafka dentro do Kubernetes?"
???
Depende de quem opera. Com um operador maduro como o Strimzi e um time que entende Kafka, sim: declaro cluster, tópicos e usuários em Git, o operador faz rolling restart seguro, certificados e usuários, e eu ganho custo menor em volume alto. Os cuidados: discos persistentes de boa classe, controllers e brokers em pools separados, réplicas em zonas diferentes com rack awareness, RF 3 com min ISR 2, PDBs, e monitorar lag e partições sub-replicadas. Sem um time para isso, prefiro gerenciado.
:::

::: entrevista
"Strimzi, Confluent Cloud ou Event Hubs: como você escolhe?"
???
Primeiro, se o código usa algo que só o Kafka real tem, como Kafka Streams com exactly-once, transações ou Connect: no Event Hubs isso está em preview e só nos tiers mais caros. Segundo, se existe time para operar Kafka 24x7: se não, gerenciado. Terceiro, volume: gerenciado é barato no começo e caro em escala. Para um time sem plataforma dedicada e com Streams, Confluent Cloud; com time de plataforma e volume alto, Strimzi; para ingestão simples com Entra ID e Private Link, Event Hubs. E registro a decisão num ADR com os números.
:::

::: entrevista
"Explique replication factor, min.insync.replicas e acks."
???
RF é quantas cópias cada partição tem. `acks=all` faz o líder só confirmar quando todas as réplicas em sincronia gravaram, e `min.insync.replicas` define o mínimo de réplicas em sincronia para aceitar escrita. Com RF 3 e min ISR 2, um broker pode cair sem parar escritas; com dois fora, o broker recusa escritas em vez de confirmar dado com uma cópia só. É consistência acima de disponibilidade, e o outbox segura os eventos enquanto isso.
:::

::: entrevista
"Como você gerencia permissões no Kafka?"
???
Um usuário por aplicação, autenticado (SCRAM ou mTLS, ou OAuth no gerenciado), com ACLs mínimas: Write no tópico que produz, Read e Describe no que consome, Read no próprio consumer group, e no Kafka Streams os prefixos dos tópicos internos e dos transactional ids. Tudo declarado (KafkaUser) e revisado em PR. A credencial chega ao pod por Secret gerado pelo operador, sem cópia manual. E sem `auto.create.topics`.
:::

::: entrevista
"Por que o número de partições é uma decisão difícil de desfazer?"
???
Partições só aumentam, e aumentar muda o mapeamento de chave para partição: eventos novos de uma chave podem ir para outra partição enquanto os antigos ainda estão sendo consumidos, e a ordem por chave se perde na transição. E o número limita o paralelismo de consumo, que aparece no máximo de réplicas do autoscaler. Escolho com folga no começo.
:::

## Kafka Streams

::: entrevista
"O que é Kafka Streams e quando você usaria em vez de um consumidor comum?"
???
Uma biblioteca Java para processar tópicos com estado: agregações, joins, janelas, com estado local em RocksDB, changelog no Kafka para tolerância a falhas, reparticionamento automático e exactly-once dentro do Kafka. Uso quando a lógica é de stream processing (contar, somar por janela, juntar dois tópicos, manter uma tabela derivada). Para "receber evento e chamar um serviço ou gravar num banco", um consumidor comum é mais simples e a transação do Streams não cobre o efeito externo.
:::

::: entrevista
"Como o Kafka Streams garante exactly-once, e onde a garantia acaba?"
???
Com `exactly_once_v2`, cada ciclo de ler offsets, atualizar estado via changelog e escrever saída é uma transação Kafka; se a instância cai, a transação aborta e o reprocessamento não duplica o resultado. A garantia acaba na borda do Kafka: chamadas HTTP ou escrita em banco no meio da topologia podem repetir, e quem lê a saída precisa de `isolation.level=read_committed`, senão vê dados de transações abortadas.
:::

::: entrevista
"Tempo de evento ou tempo de processamento numa agregação por janela?"
???
Tempo de evento, quase sempre: o resultado depende de quando as coisas aconteceram, não de quando chegaram. Com tempo de processamento, um atraso no produtor ou um reprocessamento joga tudo na janela atual. O custo é lidar com atraso: carência para eventos que chegam depois, descarte (e métrica) dos que chegam tarde demais, e o fato de que a janela só fecha quando o stream time avança, o que em tópico com pouco tráfego atrasa o resultado final.
:::

::: entrevista
"Uma aplicação Kafka Streams perdeu o estado depois de um deploy. O que pode ter sido?"
???
O mais comum: mudança na topologia sem nomes explícitos, que muda os nomes gerados dos state stores e tópicos internos, e a aplicação começa do zero sem erro nenhum. Outros: mudar o `application.id`, apagar os tópicos de changelog, ou retenção do changelog configurada como delete em vez de compactação. Previno com nomes explícitos em todos os operadores com estado, testes de topologia e, para mudanças incompatíveis, um application.id novo com reprocessamento planejado.
:::

::: entrevista
"Como você escala e faz health check de uma aplicação Kafka Streams no Kubernetes?"
???
O paralelismo máximo é o número de tarefas, ligado às partições de entrada e dos repartitions; instâncias além disso ficam ociosas. Standby replicas reduzem o tempo de failover. O estado fica em emptyDir quando é pequeno (o changelog é a cópia durável) ou em PVC com StatefulSet quando é grande. No health, o estado ERROR derruba a liveness (só reiniciar resolve) e REBALANCING conta como saudável, para não gerar tempestade de restarts em deploys.
:::

**Próximo módulo:** [6: AKS de verdade](../modulo-06/README.md)
