# 6.3 O relay: SKIP LOCKED, faixas e a ordem por chave

O relay é um `BackgroundService` que roda em **todo pod** onde o módulo está carregado. Em Pagamentos, isso dá pelo menos 3 relays (2 réplicas de `api-pagamentos` e 1 a 6 de `worker-pagamentos`) lendo a mesma tabela ao mesmo tempo. Esta lição é sobre o que acontece quando vários processos disputam a mesma fila no Postgres, e sobre um bug de ordem que quase todo tutorial de outbox tem.

## O ingrediente: `FOR UPDATE SKIP LOCKED`

::: conceito
`SELECT ... FOR UPDATE` trava as linhas lidas até o fim da transação: outra transação que tentar `FOR UPDATE` nas mesmas linhas **espera**. Com `SKIP LOCKED`, ela **pula** as linhas travadas e pega as próximas livres, sem esperar. É a forma padrão de transformar uma tabela do Postgres numa fila com vários consumidores: cada um pega um pedaço diferente, ninguém bloqueia ninguém.
:::

A versão que aparece em quase todo material (e na [lição 5.2 da Plataforma](../../../plataforma-dotnet/docs/modulo-05/02-produtor.md)):

```sql
SELECT * FROM outbox WHERE publicada_em IS NULL
ORDER BY id LIMIT 50
FOR UPDATE SKIP LOCKED;
```

Nada se perde e nada é publicado por dois relays ao mesmo tempo. Mas olhe a ordem.

::: previsao
Relay A pega as linhas 1 a 50. Relay B, no mesmo instante, pula as travadas e pega 51 a 100. A linha 30 e a linha 70 são da mesma proposta: `DesembolsoSolicitado` e `DesembolsoConcluido`. Quem publica primeiro?
???
Não dá para saber. Os dois relays publicam em paralelo. Se A está mais lento (rede, GC, um lote maior), B publica a 70 **antes** da 30. No tópico, a partição da proposta recebe `DesembolsoConcluido` antes de `DesembolsoSolicitado`. E se A falhar na 30 e ela ficar para o próximo ciclo, a inversão é garantida.

O comentário da própria lição 5.2 avisa: "com vários pods e SKIP LOCKED, dois eventos do mesmo parceiro podem chegar fora de ordem". Aqui a gente resolve.
:::

## Medindo antes de acreditar

O protótipo [`labs/relay-prototipo.mjs`](labs/relay-prototipo.mjs) usa **o mesmo SQL** do `OutboxRelay.cs` contra um Postgres 16 de verdade: 2.000 eventos de 40 chaves, 4 relays concorrentes, 8% de falha de publicação e 3% de "pod morreu antes do COMMIT". O Kafka é um array; no fim ele confere, por chave, se a primeira ocorrência de cada evento chegou em ordem.

```bash
cd learnflow/projetos/creditflow/docs/modulo-06/labs
npm install
export DATABASE_URL=postgres://creditflow:creditflow@localhost:5432/creditflow   # o Postgres do docker compose
psql "$DATABASE_URL" -f <repo>/src/Modules/Pagamentos/CreditFlow.Modules.Pagamentos/Infrastructure/Persistencia/Sql/001_schema_pagamentos.sql

node relay-prototipo.mjs ingenuo backlog   # SKIP LOCKED nas linhas, fila acumulada
node relay-prototipo.mjs faixas backlog    # o desenho do CreditFlow
```

Resultado de uma execução real (Postgres 16, 4 relays):

| Modo | Entregues | Duplicatas | **Fora de ordem** | Perdidos |
|---|---|---|---|---|
| `ingenuo` (sem fila acumulada) | 2.062 | 62 | 0 | 0 |
| `ingenuo backlog` | 2.047 | 47 | **913** | 0 |
| `faixas backlog` | 2.066 | 66 | **0** | 0 |

::: porque Por que o ingênuo passa sem backlog
Com o produtor gravando devagar e os relays em dia, cada lote tem poucas linhas, quase nunca duas da mesma chave em relays diferentes. O bug só aparece quando **a fila acumula**: depois de um deploy, de o Kafka ficar fora 2 minutos, de o relay cair. Ou seja, exatamente quando você menos quer surpresa. Teste de concorrência que não cria backlog não testa nada.
:::

## A solução: faixas (lanes)

```mermaid
flowchart LR
  subgraph outbox["pagamentos.outbox (pendentes)"]
    direction TB
    L0["faixa 0: chaves X, Y"]
    L3["faixa 3: chave P (ids 30, 70)"]
    L9["faixa 9: chaves Q, R"]
  end
  subgraph faixas["pagamentos.outbox_faixas (16 linhas)"]
    F0[0] --- F3[3] --- F9[9]
  end
  A[Relay A] -- "FOR UPDATE SKIP LOCKED<br/>trava 0 e 3" --> faixas
  B[Relay B] -- "pula 0 e 3<br/>trava 9" --> faixas
  A -- "lê só faixas 0,3<br/>ORDER BY id" --> L3
  B -- "lê só faixa 9" --> L9
```

1. Cada chave cai sempre na mesma faixa: `faixa = FNV-1a(chave) % 16`, calculada ao gravar (`MensagemOutbox.FaixaDa`).
2. A tabela `outbox_faixas` tem 16 linhas e só existe para ser travada. O relay trava até 4 faixas livres:
   ```sql
   SELECT faixa FROM pagamentos.outbox_faixas ORDER BY random() LIMIT 4 FOR UPDATE SKIP LOCKED;
   ```
3. Lê as pendentes **só dessas faixas**, em ordem de id:
   ```sql
   SELECT ... FROM pagamentos.outbox WHERE publicada_em IS NULL AND faixa = ANY(@faixas) ORDER BY id LIMIT 200;
   ```
   Nenhum outro relay lê essas faixas até o COMMIT. Toda a fila de uma chave está com um relay só.
4. Publica agrupando por chave: chaves diferentes em paralelo (`Task.WhenAll`), a mesma chave **em sequência**, esperando o ack de cada uma. Se uma falha, as seguintes **da mesma chave** ficam para o próximo ciclo.
5. `UPDATE ... SET publicada_em = @agora WHERE id = ANY(@ids)` e COMMIT, que solta as faixas.

O SKIP LOCKED continua lá, mas trava a **faixa**, não a mensagem. É a diferença entre "nenhum evento é publicado por dois relays" e "nenhuma **chave** é publicada por dois relays".

::: porque Por que FNV-1a, e não `chave.GetHashCode()`
`string.GetHashCode()` no .NET Core é **aleatório por processo** (proteção contra ataques de colisão em dicionários). O pod A calcularia faixa 3 para a proposta P; o pod B, faixa 11. Precisamos de um hash estável entre processos, versões do .NET e linguagens: FNV-1a de 32 bits tem 6 linhas e é fácil de conferir. O teste `Faixa_e_estavel_entre_processos_e_linguagens` compara o C# com valores calculados pelo protótipo em Node.
:::

::: porque Por que `ORDER BY random()` nas faixas
Sem ele, todos os relays tentam a faixa 0 primeiro, depois a 1... O primeiro leva 0 a 3, o segundo 4 a 7, e as faixas altas só são servidas quando sobra relay. Com `random()`, a disputa se espalha. Não afeta a ordem: dentro de uma faixa, a ordem é sempre por `id`.
:::

::: armadilha Mudar o número de faixas com mensagens pendentes
`% 16` vira `% 32` e a proposta P muda da faixa 3 para a 19. Durante a transição, o relay A pode estar com as pendentes antigas de P (faixa 3) enquanto o relay B pega as novas (faixa 19). A ordem quebra por alguns segundos. Se precisar mudar: pare os relays, deixe drenar (`SELECT count(*) ... WHERE publicada_em IS NULL` = 0), mude, suba. Está no comentário de `NumeroDeFaixas`.
:::

## Dentro de uma transação, publicando no Kafka?

Sim: o relay segura a transação (e as travas das faixas) enquanto espera o ack do Kafka.

| Alternativa | Problema |
|---|---|
| Ler, COMMIT, publicar, abrir outra transação para marcar | Entre o COMMIT e a marcação, outro relay lê as mesmas linhas: duplicata **garantida** e ordem perdida |
| Coluna "reservada_por/até" (lease) | Funciona, mas é mais código e mais um relógio para dar errado |
| **Transação aberta durante a publicação** (o CreditFlow) | Uma conexão presa por relay durante o lote (ms a poucos segundos). Com 3 a 8 relays, aceitável |

## O laço e o recuo

Do [`OutboxRelay.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/Outbox/OutboxRelay.cs):

```csharp
var espera = falhasSeguidas > 0
    ? RecuoExponencial(falhasSeguidas)                          // Kafka fora: 0,5 s, 1 s, 2 s... até 30 s, com jitter
    : resultado.Publicadas == 0 ? _opcoes.IntervaloOcioso       // nada pendente: 500 ms
                                : TimeSpan.Zero;                // publicou: volta já, pode haver mais
```

- **Jitter** (±20%): sem ele, 8 relays que falharam juntos voltam juntos e batem juntos no Kafka que acabou de voltar.
- **`CreateExecutionStrategy().ExecuteAsync`**: o `DbContext` de Pagamentos tem `EnableRetryOnFailure`; com ele ligado, transação explícita fora da estratégia lança `InvalidOperationException`. Se a estratégia repetir o bloco, o que já foi publicado é publicado de novo: duplicata, aceita.
- **Limpeza** a cada 10 minutos: apaga publicadas com mais de 3 dias e inbox com mais de 14, em lotes de 5.000. A outbox não é histórico: o histórico é o tópico.

## Rastreio W3C atravessando a outbox

A linha da outbox guarda o `traceparent` da requisição que a criou. O relay abre um span `creditflow.propostas.v1 publish` **filho** desse contexto e grava o próprio `traceparent` no cabeçalho Kafka; o consumidor abre `... process` filho do de publicação ([`Rastreamento.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/Rastreamento.cs)). No Jaeger ou no Application Insights, `POST /v1/propostas/{id}/contratar` aparece ligado ao consumo em Pagamentos, com o **tempo que o evento ficou parado** na outbox e no tópico visível como um buraco entre os spans. É o melhor diagnóstico de lag que existe: por mensagem, não por média.

::: video Outbox Pattern: Fixing event failures in an event-driven architecture (Drawing Boxes, em inglês)
https://www.youtube.com/watch?v=tQw99alEVHo
O problema do duplo registro e a outbox com diagramas. Repare que o vídeo não trata ordem com vários relays: é o que esta lição acrescenta.
:::

## Perguntas para responder sem olhar

::: pergunta
O que `FOR UPDATE SKIP LOCKED` faz, e qual problema ele NÃO resolve sozinho numa outbox com vários relays?
???
Trava as linhas lidas e faz as outras transações pularem as travadas em vez de esperar: cada relay pega um lote diferente. Não preserva a ordem por chave: dois relays com lotes diferentes podem publicar eventos da mesma chave em paralelo, invertendo a ordem, principalmente com fila acumulada.
:::

::: pergunta
Como as faixas preservam a ordem por chave sem um relay único?
???
Cada chave é mapeada por um hash estável numa faixa fixa. O relay trava faixas (com SKIP LOCKED) e só lê pendentes delas, em ordem de id. Toda a fila de uma chave fica com um relay por vez; chaves de faixas diferentes saem em paralelo.
:::

::: pergunta
Por que o relay não marca a mensagem numa transação separada depois de publicar?
???
Porque entre ler e marcar outro relay leria as mesmas linhas (já soltas) e publicaria de novo, fora de ordem. Manter a transação aberta durante a publicação segura as faixas até a marcação.
:::

**Próxima:** [6.4 O consumidor idempotente](04-consumidor-idempotente.md).
