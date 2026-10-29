# 5.3 O consumidor: ler, gravar, confirmar

Abra o [`ConsumidorCepConsultado.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.Cep.Worker/ConsumidorCepConsultado.cs). O laço principal é curto:

```csharp
while (!ct.IsCancellationRequested)
{
    var mensagem = consumidor.Consume(ct);
    var evento = Ler(mensagem);

    if (evento is not null)
        await GravarComNovaTentativa(evento, ct);

    consumidor.Commit(mensagem);
}
```

Ler, gravar, **só então** confirmar. Toda a robustez do worker está na ordem dessas linhas e no que acontece quando cada uma falha.

## A configuração do consumidor

```csharp
new ConsumerConfig
{
    GroupId = "cep-estatisticas",
    AutoOffsetReset = AutoOffsetReset.Earliest,
    EnableAutoCommit = false,
}
```

| Configuração | O que faz | Por quê |
|---|---|---|
| `GroupId` | Todos os pods do worker são o mesmo grupo e dividem as partições | Escalar = mais membros do grupo |
| `AutoOffsetReset = Earliest` | Um grupo que nunca leu começa do início do que está retido | O primeiro deploy do worker processa a última semana de eventos, em vez de começar do agora e perder o que já existia |
| `EnableAutoCommit = false` | O offset só é confirmado quando o código chama `Commit` | Com o automático, o cliente confirma de tempos em tempos **o que já foi entregue ao código**, processado ou não. Se o pod cair depois da confirmação e antes de gravar, o evento se perde |

::: porque Por que `Consume` roda numa thread própria
`Consume` bloqueia a thread enquanto espera mensagem. O `ExecuteAsync` do worker o coloca em `Task.Factory.StartNew(..., TaskCreationOptions.LongRunning)`, uma thread dedicada. Sem isso, o laço bloquearia a inicialização do host (e as sondas `/healthz` não subiriam) ou ocuparia uma thread do pool que deveria estar servindo outras tarefas.
:::

## As garantias de entrega

| Garantia | Significa | Como se obtém |
|---|---|---|
| No máximo uma vez | Pode perder, nunca repete | Confirmar **antes** de processar |
| **Pelo menos uma vez** | Nunca perde, pode repetir | Confirmar **depois** de processar (o projeto) |
| Exatamente uma vez | Nunca perde, nunca repete | Processamento e offset na mesma transação, ou processamento idempotente em cima do "pelo menos uma vez" |

::: previsao
O worker gravou a consulta no banco (o `INSERT ... ON CONFLICT` somou 1) e, antes de executar o `Commit`, o pod foi morto (o nó caiu, um `OOMKilled`). O que acontece quando outra réplica assume a partição? O ranking fica certo?
???
A outra réplica recomeça do **último offset confirmado**, que é anterior a esse evento. Ela lê o mesmo evento de novo e soma **mais 1**. O CEP fica com **uma consulta a mais** no ranking.

É o "pelo menos uma vez" funcionando como desenhado: nada se perde, mas pode repetir. O comentário no [`RegistradorDeConsultas`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/Features/Estatisticas/RegistradorDeConsultas.cs) assume isso: para estatística, aceitável.

Se a contagem precisasse ser exata, duas saídas:

1. **Guardar o offset processado no banco, na mesma transação da soma**, e ignorar eventos com offset menor ou igual ao guardado para aquela partição.
2. **Dar um id a cada evento** e guardar os ids processados numa tabela com chave única: o segundo `INSERT` do mesmo id falha, e o evento repetido é descartado.

As duas tornam o processamento **idempotente**: repetir não muda o resultado.
:::

## Quando o banco cai: travar ou pular?

O `GravarComNovaTentativa` repete o **mesmo** evento, com espera crescente (1 s, 2 s, 4 s... até 30 s), sem avançar o offset.

::: porque
Se o banco está fora, **nenhum** evento vai conseguir ser gravado. Pular o evento e seguir para o próximo só perderia todos eles, um por um. Esperar e tentar de novo o mesmo, sem confirmar, garante que nada se perde: quando o banco voltar, o worker continua de onde parou e drena o atraso.
:::

E uma mensagem que **nunca** vai dar certo, como um JSON inválido? Aí a lógica se inverte:

::: porque Por que pular a mensagem inválida
O `Ler` devolve `null` para uma mensagem que não é um `CepConsultado` válido, e o laço confirma o offset e segue. Se o worker tentasse de novo para sempre, uma única mensagem ruim **travaria a partição inteira**: todas as mensagens boas atrás dela esperariam. É o problema conhecido como *poison message* (mensagem envenenada).

Em produção, em vez de só registrar e pular, a mensagem iria para um **tópico de mensagens mortas** (DLT, *dead letter topic*), para alguém analisar depois. O worker do projeto só registra, e o guia do nível 16 lista o DLT como próximo degrau.
:::

| Tipo de falha | Exemplo | O que fazer |
|---|---|---|
| **Transitória** | Banco fora, timeout, rede | Tentar de novo o mesmo evento, sem avançar |
| **Permanente** | JSON inválido, versão de evento desconhecida, regra que nunca vai passar | Não tentar de novo: mandar para o DLT e seguir |

::: armadilha
Tratar toda exceção como transitória. Um bug no código do worker (um `NullReferenceException` para um tipo de evento novo) vira um laço infinito de novas tentativas, com a partição travada e o atraso crescendo. Classificar a falha é o trabalho de sênior aqui: o `catch` do `GravarComNovaTentativa` repete qualquer exceção do banco, o que é razoável **porque** ele envolve só a gravação, e a validação do evento acontece antes, no `Ler`.
:::

## Encerrando sem atrapalhar os outros

```csharp
finally
{
    consumidor.Close(); // sai do grupo na hora: as partições vão para outra réplica sem esperar timeout
}
```

Sem o `Close`, o grupo só percebe que o pod saiu depois do tempo de sessão expirar (dezenas de segundos), e as partições dele ficam paradas esse tempo todo. Com o `Close`, o grupo faz o **rebalanceamento** na hora. Num deploy ou numa redução de réplicas pelo KEDA, isso é a diferença entre um soluço e meio minuto sem processar.

## Labs

::: quebra Lab 1: o atraso que se resolve sozinho
Com o `docker compose up`:

```bash
docker compose stop worker
for i in $(seq 1 30); do curl -s localhost:8080/v1/cep/01001000 > /dev/null; done
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group cep-estatisticas
curl -s 'localhost:8080/v1/cep/mais-consultados?quantidade=3'

docker compose start worker
sleep 10
docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group cep-estatisticas
curl -s 'localhost:8080/v1/cep/mais-consultados?quantidade=3'
```

Antes de rodar: com o worker parado, a API funciona? O `LAG` vai a quanto? Ao voltar, alguma consulta se perde?
:::

::: solucao
Com o worker parado, **a API responde normalmente**: ela não sabe nem quer saber se alguém está lendo. O `LAG` da partição do CEP `01001000` sobe em 30 (os eventos estão no tópico, esperando). O ranking não muda.

Com o worker de volta, ele retoma do último offset confirmado, o `LAG` volta a 0 em segundos e o ranking soma as 30. **Nada se perdeu.** É o desacoplamento no tempo que o Kafka dá: produtor e consumidor não precisam estar de pé ao mesmo tempo.
:::

::: quebra Lab 2: a mensagem envenenada
Publique uma mensagem que não é um `CepConsultado` e veja o que o worker faz:

```bash
docker compose exec kafka bash -c \
  'echo "lixo:isto nao e json" | /opt/kafka/bin/kafka-console-producer.sh \
   --bootstrap-server localhost:9092 --topic cep.consultado --property parse.key=true --property key.separator=:'

docker compose logs worker --since 1m | grep -i "inválida"
curl -s localhost:8080/v1/cep/20040020 > /dev/null
sleep 3; curl -s 'localhost:8080/v1/cep/mais-consultados?quantidade=5'
```

O worker trava? As consultas seguintes entram no ranking?
:::

::: solucao
O log mostra **"Mensagem inválida pulada em cep.consultado [[n]] @offset"**, com a partição e o offset exatos (o `TopicPartitionOffset`), o que permite achar a mensagem depois. O worker confirma e segue, e a consulta seguinte entra no ranking normalmente.

Se você trocar mentalmente esse comportamento por "tentar de novo até dar certo", a partição onde caiu o `lixo` ficaria parada para sempre, e todos os CEPs com chave nessa partição deixariam de entrar no ranking.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que o worker desliga o commit automático?
???
Porque o automático confirma o que foi entregue ao código, processado ou não. Se o pod cair depois da confirmação e antes de gravar, o evento se perde. Com commit manual depois de gravar, a garantia é "pelo menos uma vez".
:::

::: pergunta
O que é "pelo menos uma vez", e o que isso exige do consumidor?
???
Nenhum evento se perde, mas um evento pode ser processado mais de uma vez (o pod cai entre processar e confirmar). Exige processamento idempotente, ou aceitar a duplicata quando o efeito tolera (como uma estatística).
:::

::: pergunta
Por que o worker tenta de novo para sempre quando o banco cai, mas pula uma mensagem inválida?
???
Banco fora é falha transitória que afeta todos os eventos: pular perderia todos; esperar e repetir o mesmo, sem confirmar, não perde nada. Mensagem inválida é falha permanente: tentar de novo travaria a partição inteira para sempre; o certo é registrar (ou mandar para um tópico de mensagens mortas) e seguir.
:::

**Próxima:** [5.4 Escalar pela fila com KEDA](04-keda-e-strimzi.md).
