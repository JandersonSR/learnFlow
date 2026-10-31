# 8.5 Teste de carga com k6: lendo os números

Escala automática que nunca foi testada é uma hipótese. Esta lição roda os dois testes do CreditFlow e, principalmente, ensina a **ler** o que o k6 imprime, porque um teste de carga mal lido convence o time de coisas falsas.

## Modelo aberto × modelo fechado

::: conceito
**Modelo fechado**: N usuários virtuais em laço; cada um só faz a próxima requisição quando a anterior volta. **Modelo aberto**: requisições chegam numa **taxa** imposta (300 por segundo), independentemente de as anteriores terem terminado.
:::

::: previsao
A API leva 100 ms por requisição. Você roda 30 VUs em laço (modelo fechado). Aí a API degrada e passa a levar 1 s. O que acontece com a taxa de requisições do teste? E o que o relatório vai mostrar?
???
No modelo fechado, cada VU espera a resposta: com 100 ms, 30 VUs geram ~300 req/s; com 1 s, geram ~30 req/s. **O teste alivia a carga justamente quando a API sofre.** O relatório mostra latência mais alta, mas com 10 vezes menos tráfego do que você queria testar; a fila que existiria na vida real nunca se forma. É o chamado *coordinated omission*: o gerador de carga se coordena com o sistema testado e esconde o pior.

Clientes reais não esperam o anterior terminar para chegar. Por isso os dois testes do CreditFlow usam executores de **taxa de chegada** (`ramping-arrival-rate`, `constant-arrival-rate`).
:::

A documentação do k6 tem a explicação oficial em [Open and closed models](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/open-vs-closed/).

## Teste 1: a rajada na Simulação

[`load/simulacao-rajada.js`](https://github.com/JandersonSR/lending-plataform/blob/main/load/simulacao-rajada.js):

```javascript
rajada: {
  executor: "ramping-arrival-rate",
  startRate: BASE, timeUnit: "1s",
  preAllocatedVUs: 50, maxVUs: 600,
  stages: [
    { target: BASE, duration: "1m" },   // linha de base
    { target: PICO, duration: "10s" },  // 20 → 300/s em 10 s
    { target: PICO, duration: "3m" },   // sustenta
    { target: BASE, duration: "30s" },
    { target: BASE, duration: "5m" },   // assista a janela de scaleDown
  ],
},
thresholds: {
  http_req_failed: ["rate<0.01"],
  simulacao_latencia: ["p(95)<400", "p(99)<1200"],
  "simulacao_latencia{fase:pico}": ["p(95)<800"],
  simulacao_429: ["rate<0.001"],
  dropped_iterations: ["count<100"],
},
```

| Escolha | Por quê |
|---|---|
| Rampa de 10 s até o pico | Mais rápida que o HPA reage (lição 8.3): testa a **folga**, não só a escala |
| 3 minutos no pico | Tempo de o HPA chegar ao alvo e, se faltar nó, do cluster autoscaler agir |
| 5 minutos depois | Você vê a janela de 5 min do `scaleDown` acontecendo |
| Tag `fase` | O p95 do pico separado; misturado com 6 minutos de calma, ele some na média |
| `thresholds` | O teste **reprova**. Sem isso, vira um gráfico que ninguém lê |
| `dropped_iterations` | A demanda que o k6 não conseguiu nem enviar (faltaram VUs porque as respostas demoraram): é tráfego perdido |

```bash
k6 run load/simulacao-rajada.js                                   # local, contra localhost:8080
k6 run -e BASE_URL=https://api.exemplo.com.br -e PICO=500 load/simulacao-rajada.js
kubectl get hpa,pods -n creditflow -w                             # em outro terminal
```

::: armadilha Medir o rate limit em vez da API
A Simulação é pública e limita 30 requisições por minuto **por IP, por pod**. Um k6 rodando de uma máquina só é um IP: em segundos, quase tudo vira 429, e o teste "prova" que a API responde muito rápido (o 429 é baratíssimo). Por isso existe a métrica `simulacao_429` com limite de 0,1%. No ambiente de teste, suba `Simulacao__RequisicoesPorMinuto`, ou distribua o k6 por vários IPs. Se o 429 passar do limite, o teste reprova **e diz por quê**.
:::

## Lendo a saída

Um trecho de saída do k6 (formato real, números ilustrativos):

```
  █ THRESHOLDS
    dropped_iterations ............ ✓ 'count<100' count=37
    http_req_failed ............... ✓ 'rate<0.01' rate=0.21%
    simulacao_latencia ............ ✓ 'p(95)<400' p(95)=287ms
                                    ✗ 'p(99)<1200' p(99)=1.84s
    simulacao_latencia{fase:pico} . ✗ 'p(95)<800' p(95)=912ms
  █ TOTAL RESULTS
    simulacao_latencia ...: avg=118ms med=74ms p(90)=190ms p(95)=287ms p(99)=1.84s max=4.1s
    iterations ...........: 64870  163.7/s
    vus_max ..............: 412
```

| Linha | Leitura |
|---|---|
| `avg=118ms` | Quase inútil: média esconde a cauda. Não use para SLO |
| `med=74ms` vs `p(95)=287ms` | A maioria vai bem; 1 em 20 leva 4 vezes mais |
| `p(99)=1.84s` ✗ e `{fase:pico} p(95)=912ms` ✗ | **O problema está no começo do pico**: 2 pods segurando a rajada enquanto o HPA sobe |
| `vus_max=412` | O k6 precisou de 412 VUs para manter a taxa: as respostas demoraram (VUs = taxa × latência) |
| `dropped_iterations=37` | 37 simulações que um cliente real teria pedido e o k6 nem enviou |

::: porque O que fazer com esse resultado
O p95 geral passou e o do pico não: o problema é o **tempo de reação**, não a capacidade final. As alavancas, em ordem de custo: abaixar o alvo do HPA (60% → 50%, mais folga por pod); subir o mínimo (2 → 3) **no horário de campanha** (KEDA tem scaler `cron` para isso); acelerar a subida do pod (imagem menor, ReadyToRun, readiness honesta). Mudar uma de cada vez e rodar de novo: é o entregável do módulo.
:::

## Teste 2: o fluxo completo da saga

[`load/fluxo-completo.js`](https://github.com/JandersonSR/lending-plataform/blob/main/load/fluxo-completo.js) faz o caminho de um cliente: cadastrar, simular, criar proposta, aprovar (se cair na fila do analista, com `If-Match`), contratar, e **esperar o desembolso** consultando `/v1/pagamentos/desembolsos?propostaId=`.

```javascript
const tempoAteDesembolso = new Trend("tempo_ate_desembolso", true);
...
thresholds: {
  "http_req_failed{grupo:api}": ["rate<0.01"],
  tempo_ate_desembolso: ["p(95)<15000"],
  saga_nao_terminou: ["rate<0.005"],
},
```

::: porque A métrica que importa não é HTTP
O `POST /contratar` responde em dezenas de milissegundos: ele só grava na outbox. O que o cliente sente é o tempo até o dinheiro: relay de Propostas (até 500 ms ocioso) + fila no tópico (o lag) + processamento no worker + gateway (80 a 400 ms, mais retries) + relay de Pagamentos. `tempo_ate_desembolso` mede tudo isso, do 200 do contratar até o desembolso aparecer `Concluido` ou `Falhou`. É a métrica que mostra se o KEDA acompanha a demanda.
:::

```bash
k6 run load/fluxo-completo.js                                  # 2 contratos/s por 5 min
k6 run -e TAXA=10 -e DURACAO=10m load/fluxo-completo.js        # para ver o KEDA subir réplicas
kubectl get scaledobject,hpa,pods -n creditflow -w
```

| Detalhe do script | Por quê |
|---|---|
| Cliente novo por iteração (CPF sintético válido) | A regra "uma proposta ativa por cliente" bloquearia a segunda iteração do mesmo cliente |
| Tokens em `setup()` | O password grant do Keycloak é caro; uma vez por teste, não por iteração. O client `creditflow-testes` existe **só** no realm de desenvolvimento |
| Polling com recuo (0,25 s → 2 s) | Não martelar a API que você está medindo; as consultas têm a tag `grupo:polling`, fora do limite de erro da API |
| `saga_nao_terminou` | Sagas que não terminaram em 120 s. Uma é bug ou incidente, não latência |
| `-e CHAVE_PIX=indisponivel@creditflow.dev` | Força o caminho de falha (lição 6.6) e mede a compensação sob carga |

::: previsao
Você roda `TAXA=10` (10 contratos por segundo). Cada desembolso leva ~350 ms no worker, uma mensagem por vez por réplica. Com 1 réplica, o que acontece com o `tempo_ate_desembolso` ao longo do teste? E com o KEDA ligado?
???
Uma réplica processa ~2,9 por segundo e chegam 10: o lag cresce ~7 por segundo, e o `tempo_ate_desembolso` **sobe sem parar** durante o teste (o último contrato espera todos os anteriores). O p95 reprova.

Com o KEDA: em ~15 s o lag passa de 50 e ele pede réplicas; 6 réplicas fazem ~17 por segundo, mais que os 10 que chegam, e o lag volta a zero. O `tempo_ate_desembolso` tem um "morro" no começo (o tempo de reação) e depois fica estável em alguns segundos. Se mesmo com 6 réplicas não der conta (gateway mais lento, taxa maior), o lag cresce com réplicas no máximo: é o sinal da lição 8.2 de que a escala acabou e o gargalo está em outro lugar.
:::

::: checkpoint
Rode o fluxo completo duas vezes: com o worker fixo em 1 réplica e com o KEDA. Ponha lado a lado p50, p95 e p99 de `tempo_ate_desembolso` e o maior lag visto em `kafka-consumer-groups.sh --describe --group creditflow-pagamentos`. Esses três números e um gráfico são o relatório do entregável.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que usar taxa de chegada (modelo aberto) num teste de carga de API pública?
???
Porque clientes reais chegam independentemente das respostas anteriores. No modelo fechado, quando a API fica lenta o gerador manda menos requisições e esconde o problema (coordinated omission).
:::

::: pergunta
O que `dropped_iterations` mede?
???
Iterações que o k6 deveria iniciar para manter a taxa e não conseguiu, por falta de VUs (as respostas demoraram demais). É demanda que não foi atendida nem enviada: tráfego perdido.
:::

::: pergunta
Por que o teste do fluxo completo mede o tempo até o desembolso e não a latência do POST /contratar?
???
Porque o contratar só grava na outbox e responde rápido. O que o cliente sente é o tempo assíncrono da saga (relays, lag, worker, gateway), e é esse tempo que mostra se a escala por lag funciona.
:::

**Próxima:** [8.6 Quando extrair de verdade](06-quando-extrair.md).
