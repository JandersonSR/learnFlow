# 8.2 CPU-bound × I/O-bound: escolher o sinal certo

Um autoscaler é um laço de controle: mede um sinal, compara com um alvo, ajusta réplicas. Se o sinal não sobe quando o serviço está sofrendo, o laço não faz nada. A pergunta desta lição é: **qual número sobe quando este perfil precisa de mais pods?**

## Onde cada perfil gasta o tempo

::: conceito
Uma carga é **CPU-bound** quando o tempo de cada requisição é dominado por cálculo: mais pedidos por segundo, mais CPU, até saturar. É **I/O-bound** quando o tempo é dominado por **espera**: banco, rede, outro serviço. A thread fica parada (num `await`), a CPU fica baixa, e o gargalo está em outro lugar.
:::

| Perfil | Uma unidade de trabalho | Onde o tempo vai | Classe |
|---|---|---|---|
| `api-simulacao` | Uma simulação: tabela Price/SAC de até 48 parcelas, IOF diário por parcela, CET por Newton-Raphson | Laços de `decimal` | **CPU** |
| `worker-pagamentos` | Um `ContratoAssinado`: 3 idas ao Postgres, gateway PIX (80 a 400 ms, com retries), mais 1 transação | Esperando gateway e banco | **I/O** |
| `api-geral` | CRUD com regra: uma consulta ou duas | Banco, mas rápido | misto, leve |

::: porque `decimal` deixa a Simulação ainda mais CPU-bound
`decimal` no .NET é aritmética de 128 bits feita em software, várias vezes mais lenta que `double`, que usa a FPU. O módulo 2 escolheu `decimal` porque dinheiro não tolera erro de arredondamento binário, e essa escolha tem preço em CPU. O Newton-Raphson do CET faz algumas iterações, cada uma somando 48 termos com potências. É exatamente o tipo de código em que a CPU é o limite.
:::

## Medindo, não adivinhando

Classificação por intuição erra com frequência ("chama banco, então é I/O"). Meça:

```bash
# no cluster: CPU por pod enquanto o k6 roda
kubectl top pods -n creditflow -l app.kubernetes.io/component=api-simulacao --containers
# na máquina, no processo local: contadores do runtime
dotnet-counters monitor -n CreditFlow.Host --counters System.Runtime
```

| O que olhar | CPU-bound | I/O-bound |
|---|---|---|
| CPU do pod sob carga | Perto do request, ou acima | Baixa, mesmo com fila crescendo |
| Latência quando a taxa dobra | Sobe com a CPU | Sobe com a dependência (banco/gateway) |
| `ThreadPool Queue Length` | Cresce (threads ocupadas calculando) | Baixo; a espera é assíncrona |
| Ajuda adicionar réplica? | Sim, até o limite de nós | Só se o gargalo não for a dependência |

::: previsao
O worker está com 1 réplica. Chegam 600 `ContratoAssinado` em um minuto. Cada um leva em média 350 ms (gateway 250 ms + banco 100 ms), processados um de cada vez por partição. Qual a CPU do pod? Um HPA com alvo 60% de CPU escalaria? E quanto tempo levaria para drenar com 1 réplica?
???
A CPU fica em poucos por cento: 350 ms de espera para alguns milissegundos de serialização e EF. O HPA vê CPU baixa e **não escala**.

Com 1 réplica, ela é dona das 6 partições, mas o `ConsumidorKafka` processa uma mensagem por vez: ~2,9 mensagens/s. 600 mensagens levam **~3,5 minutos**, e o último cliente espera isso tudo pelo dinheiro. Com 6 réplicas (uma por partição), ~17 mensagens/s: ~35 segundos.

O sinal que sobe quando o worker precisa de ajuda é o **lag** do grupo: 600 mensagens esperando. É o que o KEDA mede (lição 8.4).
:::

## O sinal de cada perfil

| Perfil | Sinal | Por que esse |
|---|---|---|
| `api-simulacao` | CPU média em % do **request** | É o recurso que satura; cresce linearmente com a taxa |
| `worker-pagamentos` | Lag do grupo `creditflow-pagamentos` em `creditflow.propostas.v1` | É literalmente o trabalho esperando; independe de onde o tempo é gasto |
| `api-geral` | CPU (alvo 70%) | Carga leve; CPU basta como proteção |
| `api-pagamentos` | Nenhum (fixo em 2) | Consultas raras e baixas de parcela; 2 réplicas são disponibilidade, não capacidade |

::: armadilha Escalar por lag quando o gargalo é a dependência
Se o gateway PIX está lento (2 s por chamada em vez de 250 ms), o lag sobe, o KEDA vai para 6 réplicas, e agora são 6 vezes mais chamadas simultâneas ao gateway, que fica mais lento ainda (ou começa a limitar por taxa). Escala automática amplifica o problema de quem está atrás de você. Por isso o teto (`maxReplicaCount`) não é só "partições": é também "quanto a dependência aguenta". E por isso o alerta de lag existe mesmo com KEDA: lag alto com réplicas no máximo é incidente, não escala.
:::

::: dica Métricas customizadas no HPA
Dá para escalar uma API por requisições por segundo ou por latência (via Prometheus Adapter ou KEDA com o scaler `prometheus`). Para a Simulação, CPU basta porque ela é proporcional à taxa. Para uma API I/O-bound com tráfego HTTP (não fila), RPS por pod é melhor que CPU.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que CPU é um mau sinal para escalar o worker de Pagamentos?
???
Porque o worker passa o tempo esperando gateway e banco: a CPU fica baixa mesmo com a fila crescendo, e o HPA não escala. O sinal que mede o trabalho pendente é o lag do grupo de consumidores.
:::

::: pergunta
Escalar por lag sempre resolve uma fila crescendo?
???
Não. Se o gargalo é a dependência (gateway, banco), mais réplicas só aumentam a pressão sobre ela. O teto de réplicas precisa respeitar a dependência, e lag alto com réplicas no máximo é sinal de incidente.
:::

**Próxima:** [8.3 HPA da Simulação](03-hpa-simulacao.md).
