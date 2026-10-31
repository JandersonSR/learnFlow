# Desafio do módulo 4: a fila do analista sem briga

::: desafio Reserva de proposta na fila de análise
Hoje, duas analistas podem abrir a mesma proposta e uma delas perde o trabalho (recebe `409` ao decidir). O negócio quer que, ao **abrir** uma proposta da fila, a analista a **reserve** por 15 minutos: as outras veem "em análise por Carla" e não conseguem decidir; se a Carla sumir, a reserva expira sozinha.

Sem roteiro. Decida e justifique:

1. Onde mora a reserva: coluna na proposta (Postgres), documento no Mongo, chave com TTL no Dragonfly?
2. Como "reservar se ninguém reservou, ou se a reserva venceu" acontece **sem** `SELECT` + `UPDATE` com janela entre eles.
3. O que a fila (`GET /v1/propostas/fila-de-analise`) mostra, e se ela continua usando índice.

**Critérios de aceite**

- [ ] Teste de integração (Postgres de verdade) com duas reservas simultâneas da mesma proposta: exatamente uma vence
- [ ] Reserva vencida pode ser tomada por outra analista sem nenhum job de limpeza
- [ ] Decidir sem ter a reserva devolve um erro com código estável (não `500`, não `404`)
- [ ] A migração é um `002_*.sql` idempotente e **compatível com a versão atual do código** (expand)
- [ ] Um parágrafo no ADR 0004: por que você **não** guardou a reserva só no cache
:::

::: dica Dica 1
"Reservar se livre ou vencida" cabe num `UPDATE ... WHERE id = @id AND (reservada_por IS NULL OR reservada_ate < now()) RETURNING ...`. Zero linhas afetadas = alguém tem a reserva. É o comando atômico da [lição 3.4 do Plataforma .NET](../../../plataforma-dotnet/docs/modulo-03/04-concorrencia-e-conexoes.md), com a regra no `WHERE`.
:::

::: dica Dica 2
`now()` de quem? Se a condição de vencimento usar o relógio do pod, dois pods com relógios diferentes discordam. Use o relógio do **banco** no `WHERE`.
:::

::: solucao Um desenho possível
- **Onde:** colunas `reservada_por varchar(120) NULL` e `reservada_ate timestamptz NULL` na própria `propostas.propostas` (`002_reserva_de_analise.sql`, só `ADD COLUMN IF NOT EXISTS`: o código atual ignora as colunas, então é expand puro).
- **Reservar:** `ExecuteSqlInterpolatedAsync` (ou `ExecuteUpdateAsync` do EF) com o `UPDATE ... WHERE (reservada_por IS NULL OR reservada_ate < now() OR reservada_por = @eu)`. Zero linhas = `409 propostas.reservada-por-outra`. Reservar de novo a própria reserva renova o prazo.
- **Decidir:** o `AprovarManualmente`/`RecusarManualmente` recebe quem tem a reserva e confere; o `xmin` continua protegendo o resto.
- **Fila:** continua `WHERE status = 'EmAnalise' ORDER BY criada_em` (mesmo índice), e devolve `reservada_por`/`reservada_ate` para a tela mostrar.
- **Por que não só no Dragonfly:** a reserva decide **quem pode gravar** uma decisão de crédito. Cache pode cair ou ser esvaziado (módulo 5), e aí duas analistas decidiriam ao mesmo tempo. A verdade fica no banco que grava a decisão.
:::
