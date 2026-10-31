# 8.6 Roteiro de entrevista staff usando o OrderFlow

Entrevistas de sênior avançado e staff costumam ter quatro conversas: **deep dive de projeto**
("conte um sistema que você construiu"), **system design**, **comportamental/liderança** e, às
vezes, **código**. O OrderFlow alimenta as três primeiras. Esta lição monta o roteiro.

## O que o entrevistador avalia (e não é o que parece)

| Parece que avalia | Avalia de verdade |
|---|---|
| quanta tecnologia você conhece | se você escolhe tecnologia por um **critério**, e sabe quando ela é a escolha errada |
| se a sua arquitetura é sofisticada | se ela é **proporcional** ao problema, e se você sabe o que muda com o volume |
| se você acertou tudo | se você **sabe onde errou**, como descobriu e o que mudou |
| se você fala bem | se você conduz: estrutura a conversa, faz perguntas, decide com informação incompleta |

## Deep dive: a narrativa de 5 minutos

Prepare uma versão de 5 minutos e saiba expandir qualquer parte. Estrutura:

1. **Contexto (30 s).** "Um sistema de pedidos e pagamentos orientado a eventos, com o serviço de
   pedidos em .NET e o de pagamentos em Java, integrados só por Kafka, rodando em AKS."
2. **O problema difícil (1 min).** Escolha **um**: "O mais interessante foi garantir que um
   pagamento nunca seja cobrado duas vezes num sistema em que toda peça pode repetir: o cliente
   repete o POST, o outbox pode publicar duas vezes, o Kafka entrega pelo menos uma vez."
3. **As decisões (2 min).** As três camadas de idempotência (ADR 0004), com o porquê de cada uma e
   o que foi rejeitado (exactly-once do Kafka não cobre o efeito no banco nem o adquirente).
4. **O que deu errado (1 min).** "Um teste de estresse mostrou que 50 requisições simultâneas
   gravavam um pagamento só, mas chamavam o adquirente até 50 vezes. A idempotência estava no
   lugar errado." (Módulo 1-J, lição 7.) **Toda boa narrativa tem um erro real.**
5. **O que mudaria (30 s).** "Para o volume que o sistema tem, um monólito modular com uma fila
   gerenciada seria mais barato. Eu sei qual número faria o desenho atual valer a pena."

::: porque Por que a parte do erro é a mais importante
Um projeto sem nenhum erro contado soa como projeto de tutorial, ou como alguém que não percebe os
próprios erros. O erro do gateway chamado 50 vezes tem tudo que o entrevistador procura: foi
encontrado por um **teste** que você escreveu, a causa é sutil (check-then-act), e a correção exige
entender concorrência. Conte com números.
:::

## As perguntas de aprofundamento, e onde está a resposta

O entrevistador vai puxar fios. Estes são os mais prováveis, com a lição que te prepara:

| Pergunta provável | Prepare com |
|---|---|
| "Por que Kafka e não uma fila?" | lição 8.3 (inclusive o argumento contra o seu Kafka) |
| "Como você garante a ordem dos eventos de um pedido?" | ADR 0002: chave por `orderId`; ordem só dentro da partição |
| "O que acontece se o processo cair entre salvar e publicar?" | ADR 0003, outbox |
| "Por que polling e não Debezium?" | ADR 0003 e lição 8.3, com o slot de replicação |
| "Como um campo novo no evento chega em produção sem quebrar o outro serviço?" | ADR 0005 e lição 7.7 (consumidor antes do produtor) |
| "Como você investiga um pedido lento?" | lição 7.4 (trace atravessando .NET e Java) |
| "Como é o deploy? E o rollback do banco?" | lições 7.6 e 7.7, ADR 0008 |
| "E com 100 vezes mais pedidos?" | lição 8.2, começando pela lei de Little |

## System design: usar o OrderFlow sem transformar tudo nele

Quando o enunciado for "projete um sistema de pagamentos" ou "de pedidos", o OrderFlow é um trunfo
e uma armadilha. O trunfo: você já pensou em idempotência, ordem, outbox, observabilidade. A
armadilha: despejar a arquitetura pronta sem perguntar os requisitos.

O roteiro de 45 minutos:

| Min | Etapa | O que você faz |
|---|---|---|
| 0–5 | Requisitos | pergunte: volume, pico, latência aceitável, consistência (pode mostrar "processando"?), o que é pior: cobrar duas vezes ou não cobrar |
| 5–10 | Estimativas | a tabela da lição 8.2: pedidos/s no pico, mensagens/s, bytes/dia. Em voz alta |
| 10–20 | Desenho de alto nível | o mínimo que atende; diga o que **não** colocou e por quê |
| 20–35 | Aprofundar | o entrevistador escolhe, ou você propõe a parte mais arriscada: idempotência e o adquirente |
| 35–45 | Evolução e operação | o que quebra em 10×/100×, como observa, como implanta |

::: entrevista
"Projete o backend de checkout de um e-commerce que processa 2 milhões de pedidos por dia."
???
Começo perguntando o pico (Black Friday?), a latência aceitável para confirmar o pagamento, e se o
cliente pode ver "processando". Estimo: 2 milhões/dia são 23 pedidos/s na média; com 10× de pico,
230/s; Black Friday, mais de mil. Com o adquirente a 300 ms, a lei de Little dá centenas de chamadas
simultâneas: esse é o ponto de projeto, não o banco.

Desenho: API de pedidos sem estado atrás de um balanceador, gravando pedido e evento na mesma
transação (outbox); um log de eventos (Kafka) com chave por pedido para ordem; o serviço de
pagamentos consome, grava "pagamento solicitado" e confirma rápido; um pool de workers chama o
adquirente com limite de taxa e idempotência repassada ao adquirente, e publica o resultado. Cliente
com `Idempotency-Key`, consumidores com tabela de eventos processados. Leitura de status por réplica
ou modelo de consulta. Falo do que deixei de fora (sharding, por exemplo, que 2.300 escritas/s não
exigem), de como observo (trace propagado pelos headers, SLO por taxa de queima) e de como implanto
sem downtime (expand/contract). Se der tempo, comparo com uma fila gerenciada no lugar do Kafka.
:::

## Comportamental: o OrderFlow como fonte de histórias

Perguntas comportamentais de staff giram em torno de **influência sem autoridade**, **decisão com
informação incompleta** e **lidar com desacordo**. Prepare cada história no formato STAR (situação,
tarefa, ação, resultado), com números:

| Pergunta | História do OrderFlow |
|---|---|
| "Conte uma decisão técnica que você tomou e depois mudou." | outbox por polling com gatilhos para CDC (ADR 0003): o que faria mudar, e por que não antes |
| "Conte quando você discordou de uma escolha popular." | argumentar contra o próprio Kafka para o volume atual (lição 8.3) |
| "Como você elevou o nível técnico do time?" | as três regras no template de PR; o code review que ensina (lições 8.4 e 8.5) |
| "Conte um incidente." | o game day do desafio do Módulo 7: o que o runbook não cobria e o que você mudou |

::: armadilha Inventar escala
Não diga que o OrderFlow roda em produção com milhões de pedidos se ele é um projeto de portfólio.
O entrevistador puxa um fio ("qual era o p99 do consumidor?") e a história cai. O correto é
apresentar como o que ele é, um sistema construído para estudar problemas reais de produção, e
mostrar a profundidade: os testes de concorrência, a medição de threads virtuais, as contas de
capacidade. Profundidade honesta vence escala inventada, sempre.
:::

## Checklist da semana da entrevista

- [ ] Narrativa de 5 minutos ensaiada em voz alta, cronometrada, nas duas línguas (português e inglês).
- [ ] O diagrama do README desenhado de memória num quadro, em 2 minutos.
- [ ] A tabela de estimativas da lição 8.2 refeita sem olhar.
- [ ] Os oito ADRs: uma frase de decisão e uma de trade-off para cada.
- [ ] Um trace real do OrderFlow em captura de tela, para mostrar se a entrevista permitir.
- [ ] As [perguntas de entrevista](perguntas-de-entrevista.md) deste módulo respondidas em voz alta.

## Perguntas para responder sem olhar

::: pergunta
Qual a estrutura de uma boa narrativa de deep dive de projeto?
???
Contexto curto, um problema difícil (só um), as decisões com alternativas rejeitadas, um erro real
com como foi descoberto e corrigido, e o que você mudaria hoje. Cinco minutos, com profundidade
disponível em qualquer parte.
:::

::: pergunta
No system design, por que perguntar requisitos antes de desenhar, se você já tem uma arquitetura pronta?
???
Porque a arquitetura certa depende do volume, da latência e da consistência que o problema pede, e
porque o entrevistador avalia o processo de decisão, não o desenho final. Despejar a arquitetura
pronta mostra memória, não julgamento.
:::

**Fim das lições.** Agora: [perguntas de entrevista](perguntas-de-entrevista.md) e o [desafio](desafio.md).
