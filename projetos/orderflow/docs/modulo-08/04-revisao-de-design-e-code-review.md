# 8.4 Conduzir revisão de design e code review

Como sênior, você revisa código. Como tech lead ou staff, você **conduz** revisões: decide o que
merece revisão de design, organiza a conversa para chegar a uma decisão, e faz o code review do
time ensinar em vez de só barrar. Esta lição usa o próprio OrderFlow como material.

## Revisão de design: antes do código

::: conceito Revisão de design
Uma conversa estruturada, **antes** da implementação, sobre um documento curto (um ADR proposto
ou um design doc), para encontrar os problemas enquanto mudar custa uma edição de texto e não uma
reescrita. O produto é uma decisão registrada, não uma ata.
:::

### Quando exigir

Use o mesmo filtro dos ADRs (lição 8.1), mais duas situações que pegam times experientes:

| Exija revisão de design | Pode ir direto ao PR |
|---|---|
| muda um contrato entre serviços (campo em evento, endpoint público) | mudança interna a um serviço, coberta por testes |
| muda dados persistidos de forma não aditiva | migration só aditiva (expand) |
| nova dependência de infraestrutura (Redis, Connect, um SaaS) | nova biblioteca sem estado |
| altera garantia de entrega, ordem ou idempotência | refatoração sem mudar comportamento |
| afeta o plantão (alerta novo, runbook novo, modo de falha novo) | |

### O documento: uma página e meia

```markdown
# Proposta: <título>
## Problema           (com números: volume, latência, incidente que motivou)
## Proposta           (diagrama + o que muda em cada serviço)
## Alternativas       (pelo menos duas, com por que não)
## Riscos e modos de falha   (o que acontece quando X cai? e no rollback?)
## Plano de entrega   (em passos implantáveis separadamente; compatibilidade em cada passo)
## Perguntas em aberto       (o que o autor quer que os revisores decidam)
```

A seção **Perguntas em aberto** é o que separa uma revisão produtiva de uma apresentação: o autor
diz onde quer ajuda, e a reunião gasta tempo ali.

### A reunião

| Momento | O que o condutor faz |
|---|---|
| 48 h antes | manda o documento; comentários assíncronos no próprio PR do ADR |
| 0–5 min | **leitura silenciosa** para quem não leu (prática da Amazon; elimina "não li, mas acho que...") |
| 5–40 min | percorre as perguntas em aberto e os comentários de maior impacto, nessa ordem |
| últimos 10 min | decide: **aprovado**, **aprovado com mudanças** (listadas, com dono), ou **nova rodada** (com o que falta) |
| depois | o ADR vai a `Aceito` no merge, com as mudanças incorporadas |

::: armadilha A reunião que não decide
O modo de falha mais comum de revisão de design é terminar com "boa discussão, vamos pensar mais".
Duas semanas depois, alguém implementa do jeito que achava antes. O condutor existe para forçar uma
das três saídas acima. Se falta informação, a saída é "nova rodada" **com o que falta e quem traz**.
:::

### As perguntas que um staff faz, aplicadas ao OrderFlow

Uma lista para não depender de inspiração. Para cada uma, o exemplo de onde o OrderFlow já
respondeu (ou falhou):

| Pergunta | No OrderFlow |
|---|---|
| "O que acontece se a dependência X ficar fora 10 minutos? E 2 horas?" | Kafka fora: outbox segura (ADR 0003). Payments fora: lag cresce, nada se perde (lição 7.4) |
| "E se a mesma mensagem chegar duas vezes? E fora de ordem?" | ADR 0004 e chave por `orderId` (ADR 0002) |
| "Como se faz rollback deste passo?" | expand/contract (lição 7.7); contrato FULL_TRANSITIVE (ADR 0005) |
| "Qual o número que faz isto quebrar?" | lei de Little no consumidor (lição 8.2) |
| "Como saberemos que está quebrado, antes do cliente?" | alertas por SLO e lag (lição 7.5) |
| "Quem acorda às 3h, e o que ele lê?" | runbooks (lição 7.7) |
| "Qual a coisa mais simples que resolveria 80%?" | a pergunta que questiona o Kafka (lição 8.3) |

A última é a mais importante e a mais difícil de fazer sem soar como ataque. Formule sobre o
problema, não sobre a pessoa: "se a gente não tivesse Kafka, como resolveria isto?" funciona
melhor que "por que você não usou uma fila?".

## Code review: o que olhar, em que ordem

Um PR de 400 linhas revisado de cima para baixo vira revisão de estilo. A ordem que encontra os
problemas caros primeiro:

| Ordem | Pergunta | Exemplo real no OrderFlow |
|---|---|---|
| 1 | **O PR faz o que diz, e só isso?** | um PR "adiciona métricas" que também muda o publicador de eventos merece dois PRs |
| 2 | **Contratos e dados**: muda evento, API, esquema? É compatível com N-1? | campo novo obrigatório no `OrderCreated` quebra o consumidor Java antigo |
| 3 | **Concorrência e falha**: o que acontece com duas requisições juntas? E se cair no meio? | o bug real do Módulo 1-J: 50 chamadas ao gateway com um registro gravado |
| 4 | **Operação**: logs, métricas, traces; dá para diagnosticar em produção? | um consumidor novo sem `KafkaTracing.StartProcess` parte o trace (lição 7.4) |
| 5 | **Segurança**: entrada validada? segredo em log? permissão mínima? | `cardToken` nunca em log; `permissions: contents: read` no workflow |
| 6 | **Testes**: testam o comportamento, ou só a implementação? | teste de concorrência com threads reais, não mock |
| 7 | **Legibilidade e estilo** | o resto; e o que um linter pode pegar, o linter pega |

::: previsao
Um PR adiciona ao `MeteredPaymentEventPublisher` uma tag `customer` com o `customerId` "para o time
de produto ver aprovação por cliente". Os testes passam e o código está limpo. Você aprova?
???
Não, e o comentário explica por quê, porque é um erro que o autor vai repetir se só ouvir "não":
`customerId` como tag cria uma série por cliente no Prometheus (cardinalidade, lição 7.1); com 100
mil clientes, 300 mil séries só neste contador, e o backend de métricas cai ou a fatura explode.
O pedido de produto é legítimo, e a resposta certa é **outra ferramenta**: a análise por cliente
vem dos eventos (um consumidor de analytics, ou uma consulta no banco), ou de atributo de span se
for para investigação. Um bom comentário de revisão termina com a alternativa, não só com a recusa.
:::

### Como escrever o comentário

| Em vez de | Escreva | Por quê |
|---|---|---|
| "Isto está errado." | "Com duas réplicas, as duas leem a mesma linha do outbox aqui. `FOR UPDATE SKIP LOCKED` resolve; quer que eu mostre?" | aponta o cenário que quebra e o caminho |
| "Por que não usou X?" | "Considerou X? A vantagem seria Y; se descartou, vale um comentário no código." | pergunta de verdade, não acusação |
| (silêncio sobre o que está bom) | "Gostei do teste de concorrência com 50 threads, pegaria o bug do gateway." | reforça o comportamento que você quer ver de novo |
| comentário de estilo bloqueante | prefixo `nit:` (não bloqueia) | separa o que impede o merge do que é preferência |

Prefixos que o time combina e todo mundo entende: `bloqueante:`, `pergunta:`, `sugestão:`, `nit:`.
O autor sabe o que **precisa** mudar para o merge, e o revisor não esconde preferência atrás de autoridade.

::: porque Code review é a principal ferramenta de ensino do tech lead
Num time com um sênior e vários júniors e plenos, o code review é onde 90% do aprendizado técnico
acontece, todo dia, no contexto real. Por isso o comentário explica o **porquê** e aponta material
("ver lição 7.4 sobre trace partido"), e por isso o tech lead também pede revisão do próprio código
aos júniors: eles aprendem lendo código melhor, e às vezes acham o bug.
:::

::: armadilha O gargalo é você
Se todo PR espera a revisão do único sênior, o time anda na velocidade de uma pessoa. Sinais:
PRs abertos há mais de um dia esperando você; ninguém aprova sem você. Saída: CODEOWNERS por área
com pelo menos dois donos, checklist da ordem acima no template de PR, e a sua revisão reservada
para os itens 2 e 3 (contratos e concorrência), onde ela vale mais.
:::

## Perguntas para responder sem olhar

::: pergunta
Como você evita que uma revisão de design termine sem decisão?
???
O condutor força uma de três saídas no fim: aprovado, aprovado com mudanças (listadas, com dono) ou
nova rodada com o que falta e quem traz. Documento enviado antes, perguntas em aberto explícitas,
e o ADR muda de status no merge.
:::

::: pergunta
Em que ordem você revisa um PR grande, e por quê?
???
Escopo, contratos e dados, concorrência e falha, operação, segurança, testes, e só no fim estilo.
A ordem vai do mais caro de corrigir depois do merge para o mais barato; estilo um linter pega.
:::

**Próxima:** [8.5 Apresentar o OrderFlow ao time](05-apresentar-ao-time.md).
