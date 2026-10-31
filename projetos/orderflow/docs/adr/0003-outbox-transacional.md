# 0003. Outbox transacional com relay por polling, e não CDC

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** Janderson, revisão do time

## Contexto

Salvar o pedido no Postgres e publicar `OrderCreated` no Kafka são duas operações em dois
sistemas, sem transação comum (*dual write*). Se o processo cai entre as duas, ou o banco tem o
pedido e o Payments nunca sabe (evento perdido), ou o evento sai e o pedido não existe (evento
fantasma). O Módulo 1 já marcava isso no comentário do `OrderService.ChangeAsync`.

## Decisão

Cada serviço grava o evento numa tabela de outbox (`outbox_messages`) **na mesma transação** que muda o estado. Um
relay em segundo plano (`BackgroundService` no .NET, thread virtual no Java) lê as linhas não
publicadas em ordem, publica no Kafka com produtor idempotente (`enable.idempotence=true`) e
marca como publicadas. Com várias réplicas, o relay usa `SELECT ... FOR UPDATE SKIP LOCKED` para
que duas réplicas não peguem a mesma linha. Linhas publicadas são apagadas por um job de limpeza.

## Alternativas consideradas

- **CDC com Debezium** lendo o WAL do Postgres (com ou sem a tabela outbox). Latência menor, nenhum
  polling no banco, e o padrão "outbox + Debezium" é maduro. Rejeitado **por enquanto**: exige
  Kafka Connect no cluster, slot de replicação lógica (que, esquecido, enche o disco do Postgres
  com WAL retido) e mais uma peça para o plantão operar. Comparação na lição 8.3.
- **Publicar e depois salvar, com compensação.** Rejeitado: troca um problema por outro (evento fantasma).
- **Transação distribuída (2PC/XA).** O Kafka não participa de XA. Fora de questão.
- **Kafka como fonte da verdade** (event sourcing). Mudança de modelo muito maior que o problema.

## Consequências

- Positivas: atomicidade entre estado e evento sem infraestrutura nova; o relay usa a mesma
  conexão e o mesmo esquema do serviço; testável com Postgres local.
- Negativas: latência extra de até um intervalo de polling (configurado em centenas de ms);
  carga de leitura constante no banco; a ordem global depende de o relay publicar em ordem de
  inserção e de **uma** réplica processar cada chave por vez; duplicatas são possíveis (o relay
  cai depois de publicar e antes de marcar), logo o consumidor precisa ser idempotente (ADR 0004).
- Obrigatório: métrica de "idade da linha mais antiga não publicada" com alerta, porque um relay
  parado é silencioso: a API responde 201 e nada chega ao outro serviço.

## Revisitar quando

- O polling aparecer entre as consultas mais caras do Postgres; ou
- a latência entre gravar e publicar precisar ficar abaixo de ~100 ms; ou
- o time de plataforma já operar Kafka Connect para outro sistema (o custo marginal do CDC cai muito).
