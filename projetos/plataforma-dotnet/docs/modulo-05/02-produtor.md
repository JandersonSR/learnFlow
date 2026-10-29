# 5.2 O produtor: publicar sem travar a API

Abra o [`PublicadorKafka.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/Eventos/PublicadorKafka.cs). Ele tem pouco código e muitas decisões.

## A configuração, linha a linha

```csharp
_produtor = new ProducerBuilder<string, string>(new ProducerConfig
{
    BootstrapServers = opcoes.Value.BootstrapServers,
    ClientId = "cep-api",
    Acks = Acks.All,
    EnableIdempotence = true,
    LingerMs = 5,
    MessageTimeoutMs = 5000,
}).Build();
```

| Configuração | O que garante | O custo |
|---|---|---|
| `Acks = Acks.All` | A mensagem só conta como entregue quando todas as réplicas em sincronia gravaram. Um broker que morre logo depois não leva a mensagem junto | Um pouco mais de latência por mensagem (que o `Produce` assíncrono esconde da API) |
| `EnableIdempotence = true` | Se o produtor reenviar por causa de uma falha de rede, o broker descarta a cópia. Sem duplicatas **causadas pelo produtor**, e ordem mantida na partição | Praticamente nenhum; é o padrão nas versões recentes do cliente |
| `LingerMs = 5` | Espera até 5 ms para juntar mensagens num lote. Menos requisições ao broker, mais vazão | Até 5 ms a mais até o evento chegar ao Kafka; a resposta da API não espera por isso |
| `MessageTimeoutMs = 5000` | Se não conseguir entregar em 5 s, desiste e avisa no callback | O evento se perde (decisão consciente, abaixo) |
| `ClientId = "cep-api"` | Identifica a aplicação nos logs e métricas do broker | — |

::: porque Um produtor por processo (singleton)
O produtor mantém conexões abertas com os brokers, uma fila interna e os lotes em montagem. Criar um por requisição abriria e fecharia conexões o tempo todo e jogaria fora o agrupamento em lotes. Ele é seguro para uso concorrente, então um por processo, registrado como singleton no `CepModulo`, é o certo.

O `Dispose` faz `Flush` com até 5 s: quando o pod recebe o sinal para encerrar, o que estiver no lote é entregue antes de sair.
:::

## `Produce` e não `ProduceAsync`

```csharp
_produtor.Produce(_topico, mensagem, relatorio =>
{
    if (relatorio.Error.IsError)
        LogFalhaNaEntrega(_log, evento.Cep, relatorio.Error.Reason);
});
```

::: previsao
Se o endpoint fizesse `await _produtor.ProduceAsync(...)` em vez de `Produce` com callback, o que mudaria para o parceiro num dia normal? E num dia em que o Kafka estivesse fora?
???
**Dia normal:** cada resposta esperaria a confirmação do Kafka, com `acks=all`: os 5 ms do `linger` mais a ida e volta até as réplicas. A latência da API subiria, à toa, porque o parceiro não precisa saber se o evento de estatística foi entregue.

**Kafka fora:** cada requisição ficaria pendurada até o `MessageTimeoutMs` (5 s) e então falharia ou responderia lenta. A API passaria a depender da disponibilidade do Kafka, que é exatamente o que o nível 15 quis evitar.

Com `Produce` + callback, a mensagem vai para a fila interna e a resposta segue na hora. Se a entrega falhar, o callback registra um aviso.
:::

::: armadilha
`Produce` também pode lançar exceção **na hora**: quando a fila interna do produtor enche (o Kafka está fora há algum tempo e as mensagens se acumularam). O código trata isso com o `catch (ProduceException)` que descarta o evento e registra. Sem esse `catch`, uma queda prolongada do Kafka viraria erro 500 nas consultas de CEP.
:::

## A decisão mais importante: o evento pode se perder

Repare no fluxo do endpoint: a API responde ao parceiro e, **depois**, enfileira o evento. Se o Kafka ficar fora por mais de 5 s, ou se o pod morrer antes de o lote sair, o evento se perde. E a consulta já foi respondida.

::: porque Por que isso é aceitável aqui
O evento alimenta uma **estatística**. Perder alguns eventos num incidente deixa o ranking um pouco impreciso. Em troca, a API não depende do Kafka para nada. A decisão está registrada na tabela do nível 15: "perder alguns eventos de estatística é aceitável".
:::

E se o evento **não pode** se perder? O caso clássico: o módulo Parceiros cobra por consulta, e o evento de faturamento tem de chegar, sempre. O problema é o **duplo registro**: gravar no banco e publicar no Kafka são duas operações em dois sistemas, e não existe transação entre eles.

| Ordem | O que pode dar errado |
|---|---|
| Grava no banco, depois publica | O processo morre entre os dois: o banco tem, o Kafka não. Evento perdido |
| Publica, depois grava no banco | O banco falha depois de publicar: o Kafka anuncia algo que não aconteceu |

::: conceito Padrão outbox
Gravar o evento **numa tabela do próprio banco, na mesma transação** que grava o dado. Um processo separado lê essa tabela e publica no Kafka, marcando o que já publicou. Se ele cair, retoma de onde parou. O banco vira a fonte da verdade também para os eventos.
:::

```mermaid
sequenceDiagram
  participant H as Handler
  participant DB as PostgreSQL
  participant R as Retransmissor (BackgroundService)
  participant K as Kafka
  H->>DB: BEGIN; UPDATE Parceiros; INSERT INTO Outbox; COMMIT
  loop a cada segundo
    R->>DB: SELECT ... FROM Outbox WHERE PublicadaEm IS NULL ... FOR UPDATE SKIP LOCKED
    R->>K: ProduceAsync (espera a confirmação)
    R->>DB: UPDATE Outbox SET PublicadaEm = now()
  end
```

::: porque Os detalhes que fazem o outbox funcionar
- **Mesma transação**: ou o dado e o evento são gravados juntos, ou nenhum dos dois.
- **`FOR UPDATE SKIP LOCKED`**: com vários pods rodando o retransmissor, cada um pega linhas diferentes sem esperar os outros.
- **Aqui sim `await ProduceAsync`**: o retransmissor não tem cliente esperando; ele precisa da confirmação para marcar como publicada.
- **Entrega pelo menos uma vez**: se o retransmissor publica e morre antes de marcar, a mensagem sai de novo. O consumidor precisa tolerar duplicatas (lição 5.3).
:::

## Desafio: o outbox do `CotaEsgotada`

::: desafio
No módulo Parceiros da lição 1.7, o agregado já registra o evento `CotaEsgotada` na lista `Eventos`. Faça esse evento chegar ao tópico `parceiros.cota-esgotada` sem nunca se perder.

**Critérios de aceite:**
- Tabela `parceiros."Outbox"` com id, tipo do evento, conteúdo (JSON), data de criação e data de publicação (anulável)
- O `SaveChanges` que grava o parceiro grava, na mesma transação, uma linha no outbox para cada evento da lista
- Um `BackgroundService` publica as linhas pendentes, em ordem de criação, e as marca como publicadas
- Teste: com o Kafka fora, as consultas continuam funcionando e as linhas ficam pendentes; com o Kafka de volta, são publicadas
- A chave da mensagem é o id do parceiro
:::

::: dica Dica 1: gravar o outbox no mesmo SaveChanges
Antes de chamar `SaveChangesAsync`, percorra as entidades `Parceiro` rastreadas pelo `ChangeTracker`, transforme cada evento da lista em uma linha `MensagemOutbox` e adicione ao `DbContext`. Como tudo vai no mesmo `SaveChanges`, o EF usa uma transação só. Um `SaveChangesInterceptor` deixa isso automático.
:::

::: dica Dica 2: ler sem disputar com outros pods
O EF não gera `FOR UPDATE SKIP LOCKED`. Use `FromSql` dentro de uma transação:

```csharp
var lote = await db.Outbox.FromSql($"""
    SELECT * FROM parceiros."Outbox"
    WHERE "PublicadaEm" IS NULL
    ORDER BY "CriadaEm"
    LIMIT 50
    FOR UPDATE SKIP LOCKED
    """).ToListAsync(ct);
```
:::

::: solucao O retransmissor
```csharp
internal sealed partial class RetransmissorDoOutbox(
    IServiceScopeFactory escopos, IProducer<string, string> produtor, ILogger<RetransmissorDoOutbox> log)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            var publicadas = 0;
            try
            {
                await using var escopo = escopos.CreateAsyncScope();
                var db = escopo.ServiceProvider.GetRequiredService<ParceirosDbContext>();
                await using var transacao = await db.Database.BeginTransactionAsync(ct);

                var lote = await db.Outbox.FromSql($"""
                    SELECT * FROM parceiros."Outbox" WHERE "PublicadaEm" IS NULL
                    ORDER BY "CriadaEm" LIMIT 50 FOR UPDATE SKIP LOCKED
                    """).ToListAsync(ct);

                foreach (var m in lote)
                {
                    await produtor.ProduceAsync(m.Topico,
                        new Message<string, string> { Key = m.Chave, Value = m.Conteudo }, ct);
                    m.PublicadaEm = DateTimeOffset.UtcNow;
                    publicadas++;
                }

                await db.SaveChangesAsync(ct);
                await transacao.CommitAsync(ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogFalha(log, ex); // as linhas não marcadas voltam no próximo ciclo
            }

            if (publicadas == 0)
                await Task.Delay(TimeSpan.FromSeconds(1), ct); // nada pendente: espera um pouco
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Falha ao publicar o outbox; nova tentativa no próximo ciclo")]
    private static partial void LogFalha(ILogger log, Exception ex);
}
```

Pontos para comparar com a sua versão:

- **A transação com `EnableRetryOnFailure`**: se o `DbContext` do Parceiros tiver a estratégia de repetição ligada (lição 3.1), esta transação explícita precisa ir para dentro de `CreateExecutionStrategy().ExecuteAsync(...)`.
- **Publicou e falhou ao marcar**: a transação é desfeita, as linhas voltam a ficar pendentes e serão publicadas de novo. É a duplicata esperada do "pelo menos uma vez". O consumidor usa o id da mensagem para descartar repetidas.
- **Ordem**: num pod só, o `ORDER BY` mantém a ordem de criação. Com vários pods e `SKIP LOCKED`, lotes diferentes saem em paralelo, e dois eventos do mesmo parceiro podem chegar ao Kafka fora de ordem. Se a ordem por parceiro importar, deixe um só retransmissor ativo de cada vez (por exemplo, com uma trava consultiva do PostgreSQL, `pg_try_advisory_lock`).
- **Limpeza**: linhas publicadas há mais de alguns dias podem ser apagadas por um job, para a tabela não crescer para sempre.

Existem bibliotecas que fazem tudo isso (MassTransit, Wolverine, CAP). Implementar uma vez à mão é o que faz você saber configurá-las e depurá-las.
:::

## Vídeo

::: video Outbox Pattern: Fixing event failures in an event-driven architecture (Drawing Boxes, em inglês)
https://www.youtube.com/watch?v=tQw99alEVHo
O problema do duplo registro e como o outbox resolve, com diagramas.
:::

## Perguntas para responder sem olhar

::: pergunta
O que `acks=all` e `EnableIdempotence` garantem, juntos?
???
`acks=all`: a mensagem só é confirmada quando todas as réplicas em sincronia gravaram, então a queda de um broker não a perde. Idempotência: reenvios do produtor por falha de rede não geram duplicatas, e a ordem na partição se mantém.
:::

::: pergunta
Por que a API usa `Produce` com callback e não `await ProduceAsync`?
???
Para a resposta ao parceiro não esperar o Kafka. Com `await`, a latência subiria em todo request e, com o Kafka fora, cada requisição ficaria pendurada até o timeout. O evento é informativo; a falha de entrega é registrada no callback.
:::

::: pergunta
Que problema o padrão outbox resolve, e qual garantia de entrega ele dá?
???
O duplo registro: gravar no banco e publicar no Kafka sem transação entre os dois, o que pode perder ou inventar eventos. O outbox grava o evento numa tabela na mesma transação do dado, e um retransmissor publica depois. A garantia é "pelo menos uma vez": nada se perde, mas pode haver duplicata, e o consumidor precisa tolerá-la.
:::

**Próxima:** [5.3 O consumidor](03-consumidor.md).
