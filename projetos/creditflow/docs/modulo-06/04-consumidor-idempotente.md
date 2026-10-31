# 6.4 O consumidor idempotente: inbox, retry, DLT

A outbox entrega "pelo menos uma vez". O tópico, portanto, **vai** ter duplicatas: no protótipo da lição anterior, de 2% a 5% das entregas eram repetidas. Esta lição é sobre transformar isso em "o efeito acontece exatamente uma vez", e sobre o que fazer quando o efeito falha.

O consumidor básico (laço, commit manual, `Close`) está na [lição 5.3 da Plataforma](../../../plataforma-dotnet/docs/modulo-05/03-consumidor.md). O [`ConsumidorKafka.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/Consumo/ConsumidorKafka.cs) do CreditFlow é a versão genérica, usada por Pagamentos e por Propostas.

## Usando: duas linhas por módulo

```csharp
services.AddConsumidorKafka(configuration, "creditflow-pagamentos", [Topicos.Propostas])
        .Manipular<ContratoAssinado, AoContratoAssinado>();
```

O nome do grupo é usado três vezes: `group.id` no Kafka, `consumidor` na inbox e o nome da DLT (`creditflow-pagamentos.dlt`). Um grupo = um time responsável = uma fila de mensagens mortas para esse time olhar.

## Os offsets: guardar depois, enviar em lote

```csharp
EnableAutoCommit = false,       // nada vai ao broker sozinho
EnableAutoOffsetStore = false,  // nem é "guardado" sozinho na entrega
...
var desfecho = await ProcessarComRetryAsync(consumidor, resultado, ct);
GuardarOffset(consumidor, resultado);   // StoreOffset: só depois do efeito
ComitarSeVenceu(consumidor);            // Commit() a cada 100 mensagens ou 1 s
```

::: porque Por que não `Commit(resultado)` a cada mensagem
Funciona e é o mais simples, mas cada `Commit` síncrono é uma ida e volta ao broker (alguns ms). Guardar com `StoreOffset` e enviar a cada 100 mensagens ou 1 segundo dá a **mesma garantia** (só é confirmado o que foi processado) com uma fração das idas ao broker. O custo: se o pod morrer, até 1 segundo de mensagens processadas volta a ser entregue. A inbox absorve isso. Os offsets também são enviados na revogação de partições e no `Close`.
:::

## A inbox

::: conceito
Uma tabela `(consumidor, evento_id)` com chave primária. Antes do efeito, o consumidor tenta inserir o par; se já existia, o evento já foi aplicado e é ignorado. O insert e o efeito estão na **mesma transação**: se o efeito falha, o registro some junto, e a reentrega processa de novo.
:::

O caso comum, em [`InboxDbContextExtensions.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/Consumo/InboxDbContextExtensions.cs):

```csharp
await db.ProcessarUmaVezAsync(contexto, async ct =>
{
    // efeito: mudar agregado, AdicionarAoOutbox...
}, relogio, ct);
```

Por dentro: `BEGIN` → `INSERT INTO inbox ... ON CONFLICT DO NOTHING` → se afetou 0 linhas, `ROLLBACK` e sai → senão, efeito, `SaveChanges`, `COMMIT`.

::: porque `ON CONFLICT DO NOTHING` em vez de `Add` + capturar a violação de chave
No Postgres, uma violação de constraint **aborta a transação inteira**: depois dela, qualquer comando falha com "current transaction is aborted". Você teria de abrir outra transação e ainda distinguir "duplicata" de outro erro pela mensagem. O `ON CONFLICT` transforma a duplicata num resultado normal: "0 linhas afetadas".
:::

::: previsao
Durante um rebalanceamento (o KEDA acabou de subir uma réplica), dois pods recebem o **mesmo** `ContratoAssinado` quase ao mesmo tempo. Os dois executam o `INSERT ... ON CONFLICT DO NOTHING` na inbox. O que cada um vê?
???
O primeiro insere e segue com o efeito, com a transação aberta. O segundo **espera**: a chave primária `(consumidor, evento_id)` está travada pela transação do primeiro (é como o índice único funciona no Postgres). Quando o primeiro faz COMMIT, o segundo acorda, vê o conflito, afeta 0 linhas e sai. Se o primeiro tivesse feito ROLLBACK, o segundo inseriria e aplicaria o efeito.

O lab [`labs/inbox-prototipo.mjs`](labs/inbox-prototipo.mjs) mostra exatamente isso com dois clientes Postgres: `pod-2: INSERT inbox -> 0 linha(s) após 259 ms` (o tempo que ele ficou esperando o `pod-1`).
:::

### Quando a inbox não é necessária

Em Propostas, o handler de `DesembolsoConcluido` ([`ReacoesAoDesembolso.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Propostas/CreditFlow.Modules.Propostas/Application/Integracao/ReacoesAoDesembolso.cs)) não usa inbox. `RegistrarDesembolsoConcluido` numa proposta já `Liberada` devolve `Ok` sem gerar evento e sem gravar nada. A segunda entrega é um no-op natural.

| Efeito | Se reconhece sozinho? | Inbox? |
|---|---|---|
| Transição de estado com guarda (`Contratada → Liberada`) | Sim | Não precisa |
| Criar registro com chave natural única (`desembolso` por proposta) | Sim, pelo índice | Ajuda, não é essencial |
| Somar, mandar e-mail, chamar gateway externo | **Não** | **Sim** (ou idempotência do outro lado) |

### A inbox tem prazo

O relay apaga registros da inbox com mais de **14 dias**. O tópico retém **7**. A inbox precisa lembrar por mais tempo que o tópico guarda: se alguém resetar os offsets do grupo para o início do tópico (reprocessamento), tudo o que ainda está retido precisa ser reconhecido como já processado.

## Retry: classificar antes de repetir

O coração do consumidor é a pergunta "**tentar de novo vai adiantar?**" ([`ClassificadorDeFalhas.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/Consumo/ClassificadorDeFalhas.cs)):

| Tipo | Exemplos | Política |
|---|---|---|
| **Transitória** | `DbException { IsTransient: true }` (rede, failover, deadlock), `TimeoutException`, `DbUpdateConcurrencyException`, `ErroTransitorioException` | Repete **para sempre**, com recuo de 0,5 s a 30 s. Nunca DLT |
| **Permanente** | `JsonException`, versão desconhecida, `ErroPermanenteException` (contrato sem chave PIX) | DLT **na primeira** falha |
| **Desconhecida** | `NullReferenceException`, `InvalidOperationException` qualquer | Repete; na **10ª** tentativa, DLT |

::: porque Por que três categorias e não duas
Com duas, você escolhe qual erro cometer. Tudo transitório: um bug (`NullReferenceException` para um campo novo) trava a partição para sempre, com o lag subindo e o KEDA subindo réplicas que vão travar igual. Tudo permanente: o Postgres faz failover por 40 segundos e você manda para a DLT todo `ContratoAssinado` que chegou nesse tempo; alguém vai ter de reprocessar contratos à mão. A categoria "desconhecida" dá ao bug a chance de ser algo passageiro (um deadlock que o Npgsql não marcou como transitório) sem deixar que ele trave a partição para sempre.
:::

O classificador **desce pelas `InnerException`**: o EF embrulha o erro do Npgsql em `DbUpdateException`, e o que decide é o de dentro.

## O detalhe que derruba consumidores: `max.poll.interval.ms`

Se o laço ficar mais de `MaxPollIntervalMs` (300 s) sem chamar `Consume()`, o cliente sai do grupo, as partições vão para outro membro, e quando ele volta não é mais dono do que estava processando. Um retry "para sempre" dentro do laço, com espera de 30 s, estoura isso em 10 tentativas.

```csharp
var espera = Recuo(tentativa);
if (esperadoNestaVolta + espera > _opcoes.JanelaDeRetryEmMemoria)   // 30 s
{
    consumidor.Seek(resultado.TopicPartitionOffset);  // a mesma mensagem volta no próximo Consume()
    return Desfecho.VoltarAoPoll;
}
```

O laço repete em memória até gastar 30 s de espera; depois faz `Seek` para o offset da própria mensagem e volta ao `Consume()`, que a devolve. O grupo vê um membro vivo, a contagem de tentativas continua num dicionário por offset, e a ordem se mantém (a mensagem seguinte da partição não passa na frente).

O protótipo [`labs/consumidor-prototipo.mjs`](labs/consumidor-prototipo.mjs) reproduz o laço com uma partição em memória e um relógio simulado:

```
ok    envenenada vai para a DLT na 1ª tentativa
ok    partição não trava: a e b processados em ordem
ok    transitória nunca vai para a DLT
ok    ordem preservada depois que o banco volta
ok    poll continua acontecendo (maior intervalo entre polls 30005 ms <= janela de 30 s, longe do max.poll.interval.ms de 300 s)
ok    desconhecida vai para a DLT após 10 tentativas (atravessando seeks)
ok    depois segue
ok    reentrega de b não repete o efeito (inbox)
ok    desconhecida passageira não vai para a DLT
```

::: armadilha Retry no lugar × tópicos de retry
Uma alternativa popular é mandar a mensagem que falhou para `topico.retry.1`, `topico.retry.2`... e seguir. Não trava a partição, mas **quebra a ordem**: o `DesembolsoConcluido` vai para o retry e o `ParcelaPaga` seguinte passa na frente. No CreditFlow a ordem por proposta importa, então o retry é no lugar. Quando a ordem não importa (notificações, estatística), tópicos de retry são uma boa escolha.
:::

## A DLT

Mensagem que vai para a DLT é publicada em `<grupo>.dlt` com a **mesma chave e o mesmo corpo**, e cabeçalhos a mais:

| Cabeçalho | Exemplo |
|---|---|
| `cf-dlt-motivo` | `Permanente` |
| `cf-dlt-excecao` / `cf-dlt-mensagem` | `CreditFlow...ErroPermanenteException` / `ContratoAssinado ... sem chave PIX` |
| `cf-dlt-topico-origem`, `-particao-origem`, `-offset-origem` | `creditflow.propostas.v1`, `2`, `1487` |
| `cf-dlt-tentativas`, `cf-dlt-em` | `1`, `2026-10-30T12:00:03Z` |

Mesmo corpo e mesmos cabeçalhos originais (inclusive `cf-evento-id`) significam que **reprocessar é republicar** no tópico de origem depois de corrigir o problema. A inbox garante que, se a mensagem já tinha sido aplicada por algum motivo, nada se repete.

::: dica Alerta, não log
DLT que ninguém olha é lixeira. Alerte em `creditflow.mensageria.consumidor.dlt` > 0 (a métrica que o consumidor emite) e no lag do grupo. Uma mensagem na DLT de Pagamentos é um contrato assinado sem desembolso: é chamado de suporte amanhã.
:::

::: armadilha A DLT fora do ar
Se o produtor não consegue publicar na DLT, o consumidor **não** confirma o offset: trata como transitória e tenta de novo. Confirmar sem ter gravado a mensagem em lugar nenhum seria perdê-la.
:::

## Liveness: o laço está vivo?

Um laço travado num `await` que nunca volta não derruba o processo: o pod fica `Running`, a readiness responde, e o lag sobe. `AddMensageria` registra o health check `mensageria-consumidores` (tag `live`) que olha o **batimento** do laço: sem uma volta há mais de 2 minutos, a liveness falha e o kubelet reinicia o pod. Dois minutos ficam acima do pior caso legítimo (30 s de retry em memória mais as novas tentativas do gateway dentro do manipulador).

## Perguntas para responder sem olhar

::: pergunta
Por que a inbox precisa estar na mesma transação do efeito?
???
Se estivesse antes (transação própria), um crash entre registrar e aplicar faria a reentrega ser tratada como duplicata e o efeito nunca aconteceria. Se estivesse depois, um crash entre aplicar e registrar repetiria o efeito. Na mesma transação, os dois acontecem ou nenhum.
:::

::: pergunta
Como o consumidor repete uma mensagem "para sempre" sem ser expulso do grupo?
???
Limita a espera em memória a 30 s; depois faz `Seek` para o offset da mensagem e volta ao `Consume()`, que a devolve. O `Consume()` frequente mantém o membro no grupo (abaixo do `max.poll.interval.ms`), e a tentativa é contada por offset.
:::

::: pergunta
Por que falha desconhecida vai para a DLT depois de 10 tentativas, e transitória nunca?
???
Transitória afeta todas as mensagens (banco fora): mandar para a DLT só criaria trabalho manual; esperar não perde nada. Desconhecida pode ser bug ligado àquela mensagem: repetir para sempre travaria a partição. Dez tentativas dão chance a algo passageiro sem bloquear para sempre.
:::

**Próxima:** [6.5 A saga de desembolso](05-saga-de-desembolso.md).
