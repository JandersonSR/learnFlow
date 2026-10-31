# 6.6 Lab de quebra: relay fora, mensagem duplicada, gateway caindo

Você vai quebrar três coisas de propósito e diagnosticar cada uma com as ferramentas que terá em produção: SQL na outbox, `kafka-consumer-groups.sh`, logs e o Kafka UI. Antes de cada experimento, **escreva o que espera ver**.

## Preparação

Dois processos do mesmo Host, como no cluster: um `api` com todos os módulos de API e um `worker` só com Pagamentos.

```bash
cd deploy/local && docker compose up -d   # postgres, kafka (cria tópicos e DLTs), kafka-ui, keycloak...
cd ../..

# terminal 1: a API (Clientes, Simulacao, Propostas, Pagamentos para consulta)
CREDITFLOW__PAPEL=api Pagamentos__CriarSchemaAoIniciar=true \
  dotnet run --project src/Host/CreditFlow.Host

# terminal 2: o worker de Pagamentos (outra porta só para as sondas)
CREDITFLOW__MODULOS=Pagamentos CREDITFLOW__PAPEL=worker ASPNETCORE_URLS=http://localhost:8090 \
  dotnet run --project src/Host/CreditFlow.Host --no-build
```

Atalhos que você vai usar o tempo todo:

```bash
# o lag dos grupos
alias lag='docker compose -f deploy/local/docker-compose.yml exec kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group'
# SQL no Postgres local
alias pg='docker compose -f deploy/local/docker-compose.yml exec -T postgres psql -U creditflow -d creditflow -c'
```

Rode um fluxo completo para ter linha de base (o k6 faz tudo: cliente, simulação, proposta, contrato, espera o desembolso):

```bash
k6 run -e TAXA=1 -e DURACAO=30s load/fluxo-completo.js
```

## Lab 1: o relay fora do ar

::: quebra Derrubar o Kafka e ver a outbox segurar
```bash
docker compose -f deploy/local/docker-compose.yml stop kafka
k6 run -e TAXA=1 -e DURACAO=30s -e ESPERA_MAXIMA_S=5 load/fluxo-completo.js   # ~30 contratos
pg "select topico, count(*) filter (where publicada_em is null) pendentes, max(tentativas) from propostas.outbox group by 1;"
docker compose -f deploy/local/docker-compose.yml start kafka
sleep 40
pg "select count(*) filter (where publicada_em is null) pendentes from propostas.outbox;"
pg "select status, count(*) from pagamentos.desembolsos group by 1;"
```

Antes de rodar: com o Kafka fora, os `POST /contratar` respondem? O que a coluna `tentativas` mostra? Quanto tempo depois da volta do Kafka os desembolsos aparecem, e por que não é instantâneo?
???
**Dica 1:** procure no log do terminal 1 por "Ciclo do relay da outbox" e veja o intervalo entre as linhas.

**Dica 2:** a linha de `tentativas` sobe porque cada ciclo tenta o primeiro evento de cada chave e para nela.
:::

::: solucao
- Os contratos respondem **200** normalmente: a API só grava no Postgres. É o ponto da outbox: o Kafka fora não derruba o caso de uso.
- `pendentes` = um `ContratoAssinado` por contrato (mais outros eventos de Propostas); `tentativas` cresce devagar porque o relay entra em **recuo exponencial** (0,5 s, 1 s, 2 s... até 30 s, com jitter).
- Quando o Kafka volta, o relay pode estar no meio de uma espera de até 30 s. Por isso a demora: é o preço de não martelar um broker que acabou de voltar. Depois disso, o lote cheio volta imediatamente (`TimeSpan.Zero` quando publicou algo) e a fila drena em segundos.
- Nada se perdeu, e a ordem por proposta foi mantida (a faixa de cada chave foi publicada em sequência).

Diagnóstico de produção: alerte em "pendentes mais velhas que N minutos" (`min(criada_em) where publicada_em is null`), não em contagem. Fila grande e andando é normal depois de um incidente; fila parada é incidente.
:::

## Lab 2: a mensagem duplicada

::: quebra Republicar o mesmo ContratoAssinado
Pegue uma mensagem real do tópico e publique de novo, idêntica (mesma chave, mesmos cabeçalhos, inclusive `cf-evento-id`). É o que o relay faz quando morre antes do COMMIT.

No Kafka UI (http://localhost:8085), abra `creditflow.propostas.v1`, filtre pelo cabeçalho `cf-tipo = ContratoAssinado`, abra uma mensagem e use **Produce to topic** copiando chave, valor e cabeçalhos. Depois:

```bash
lag creditflow-pagamentos
pg "select proposta_id, count(*) from pagamentos.desembolsos group by 1 having count(*) > 1;"
pg "select count(*) from pagamentos.pix_simulado;"
docker compose -f deploy/local/docker-compose.yml logs --since 2m 2>/dev/null; # e o log do terminal 2
```

Agora repita **mudando só o `cf-evento-id`** (gere um uuid novo). O que muda?
???
**Dica:** são três camadas de proteção diferentes: a inbox, o índice único `uq_desembolsos_proposta` e a chave de idempotência no gateway. Qual delas segura cada caso?
:::

::: solucao
**Mesmo `cf-evento-id`:** a primeira linha do manipulador (`JaProcessadaAsync`) encontra o evento na inbox e retorna. Nenhum desembolso novo, nenhuma chamada ao gateway, offset confirmado. O lag sobe 1 e volta a 0.

**`cf-evento-id` novo (mesmo conteúdo):** a inbox não reconhece (é "outro" evento). O manipulador procura o desembolso **pela proposta**, encontra o existente já `Concluido` (`Terminal`), pula o gateway e só registra a inbox. Continua um desembolso por proposta e uma linha em `pix_simulado`.

Essa é a defesa em profundidade: a inbox pega a reentrega; o índice único pega "a mesma proposta por outro caminho"; a chave do gateway pega o que escapasse dos dois. Num sistema de pagamentos, uma só não basta.
:::

## Lab 3: o gateway caindo

::: quebra Gateway fora e gateway mentiroso
Reinicie o worker (terminal 2) com o gateway fora em 70% das chamadas e perdendo a resposta em 20%:

```bash
CREDITFLOW__MODULOS=Pagamentos CREDITFLOW__PAPEL=worker ASPNETCORE_URLS=http://localhost:8090 \
Pagamentos__GatewayPix__TaxaDeIndisponibilidade=0.7 \
Pagamentos__GatewayPix__TaxaDeTimeoutAposProcessar=0.2 \
  dotnet run --project src/Host/CreditFlow.Host --no-build
```

```bash
k6 run -e TAXA=1 -e DURACAO=1m load/fluxo-completo.js
pg "select status, motivo_falha, count(*), avg(tentativas) from pagamentos.desembolsos group by 1,2;"
pg "select situacao, count(*) from pagamentos.pix_simulado group by 1;"
# confira: nenhum desembolso Falhou tem PIX processado
pg "select d.id from pagamentos.desembolsos d join pagamentos.pix_simulado p on p.chave_idempotencia = 'desembolso-' || replace(d.id::text,'-','') where d.status='Falhou' and p.situacao='processada';"
```

Por último, um contrato com a chave PIX `indisponivel@creditflow.dev` (sempre 503) e outro com `recusar@creditflow.dev`:

```bash
k6 run -e TAXA=1 -e DURACAO=5s -e CHAVE_PIX=indisponivel@creditflow.dev load/fluxo-completo.js
k6 run -e TAXA=1 -e DURACAO=5s -e CHAVE_PIX=recusar@creditflow.dev load/fluxo-completo.js
pg "select status from propostas.propostas order by criada_em desc limit 10;"
```

Antes de rodar: quantos desembolsos você espera `Falhou`? A última consulta SQL pode devolver alguma linha? O que a proposta mostra no fim de cada caso?
???
**Dica 1:** com 70% de indisponibilidade, a chance de 6 tentativas falharem seguidas é 0,7⁶ ≈ 12%.

**Dica 2:** procure no log "a consulta revelou que o PIX ... FOI feito".
:::

::: solucao
- A maioria conclui com `tentativas` entre 1 e 6. Cerca de 1 em 8 esgota as tentativas; para esses, o manipulador chama `ObterOuCancelarAsync`. Os que tinham sido **processados com a resposta perdida** concluem pela consulta (o log avisa); os outros viram `Falhou(GatewayIndisponivel)` e a chave fica `cancelada`.
- A consulta SQL do "Falhou com PIX processado" devolve **zero linhas**. Esse é o invariante do módulo: nunca existe compensação com dinheiro fora.
- `pix_simulado` tem uma linha `processada` por desembolso concluído, mesmo com 20% de respostas perdidas: os retries repetiram a chave e receberam a mesma transação.
- `indisponivel@`: 6 tentativas (~15 s de recuo), consulta, `DesembolsoFalhou`, e a proposta termina em `DesembolsoFalhou` (compensação). `recusar@`: falha na primeira tentativa (recusa é definitiva) e a mesma compensação.

E se você zerasse a consulta também (`TaxaDeIndisponibilidade=1`)? O desembolso **não** falharia: a exceção transitória faz o consumidor repetir, o lag de uma partição sobe, e o alerta de lag é o que chama alguém. Dinheiro em dúvida espera; não é compensado no chute.
:::

::: checkpoint
Monte uma tabela com as três quebras, o sintoma visível (o que o usuário vê), o sinal de diagnóstico (métrica, SQL ou log) e a proteção que segurou. É o esqueleto da apresentação do módulo.
:::

**Próxima:** [Perguntas de entrevista](perguntas-de-entrevista.md).
