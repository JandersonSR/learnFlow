# 5.3 O que cachear em crédito, e o que nunca

Em um blog de receitas, cache errado mostra a receita velha por 10 minutos. Em crédito, cache errado aprova uma proposta com a taxa de ontem, mostra um saldo que já foi pago, ou deixa um analista desligado continuar decidindo. A pergunta não é "isso é lido muito?", é **"quanto tempo este dado pode estar errado, e quem paga se estiver?"**.

## As quatro perguntas

Para cada dado candidato:

1. **Com que frequência é lido, e com que frequência muda?** Cache só ajuda quando lê-se muito mais do que muda.
2. **Quanto tempo pode estar desatualizado sem prejuízo?** Essa é a validade máxima, somando as camadas.
3. **Quem paga se estiver errado?** O cliente (cobrança errada), a empresa (perda), o regulador (reclamação)?
4. **Ele é dado pessoal?** Cache é mais uma cópia para proteger, expirar e apagar quando o titular pedir (LGPD).

## A classificação do CreditFlow

| Dado | Decisão | Por quê |
|---|---|---|
| Tabela de taxas por faixa | **Cachear** (L1 1 min, L2 10 min, invalidação por evento) | Lida em toda simulação, muda por decisão de comitê, igual para todos. A simulação **não é contrato**: a proposta copia as condições que o cliente viu (módulo 4), então 1 minuto de taxa velha numa simulação não muda nenhum contrato |
| Documento de descoberta e JWKS do Keycloak | **Já cacheado** (pelo JwtBearer, em memória) | Lição 3.4: muda quase nunca, e a rotação de chave é tratada pelo `kid` |
| Resultado de uma simulação, pelos mesmos parâmetros | **Não vale a pena** | O cálculo é CPU puro em microssegundos; a ida ao Dragonfly custaria mais que recalcular. E as entradas variam demais para dar acerto |
| Perfil de crédito (score, renda) | **Não** | Dado pessoal; e a análise tem de usar o valor **atual**: um score que caiu ontem não pode aprovar hoje |
| Status de proposta | **Nunca** | É a máquina de estados: decidir em cima de um status em cache é decidir sobre algo que pode já ter mudado. Quem garante a regra é o `xmin` no banco |
| Saldo, parcelas, situação de pagamento | **Nunca** | Mostrar "em aberto" o que já foi pago gera cobrança indevida, que no Brasil pode virar devolução em dobro (CDC, art. 42) |
| Chaves de idempotência de pagamento | **Nunca só no cache** | Se o cache for esvaziado (despejo por memória, restart), a mesma requisição seria processada duas vezes: pagamento duplicado. Fica no Postgres (módulo 6) |
| Tokens, sessões, roles do usuário | **Não** (na API) | A API valida o token localmente; cachear roles por usuário criaria uma segunda fonte de permissões que não expira junto com o token |

::: porque A regra que resume a tabela
Pode ir para cache o dado em que **o pior caso de estar desatualizado é aceitável e conhecido**, e que **não decide** nada sozinho. O que decide crédito, dinheiro ou permissão é lido da fonte da verdade, com as garantias dela (transação, `xmin`, índice único). O cache acelera; nunca é o juiz.
:::

::: previsao
O comitê baixa a taxa da faixa A de 1,49% para 1,29% às 14h00. A invalidação por evento falha (o Dragonfly estava reiniciando). Uma cliente simula às 14h05 numa réplica que tinha a tabela no L1 às 13h59, e às 14h12 cria a proposta. Que taxa aparece na simulação? E na proposta?
???
**Simulação às 14h05:** depende da réplica. O L1 daquela réplica foi preenchido às 13h59 e vale 1 min: às 14h05 ele já venceu, então ela foi ao L2. O L2 foi gravado às, digamos, 13h55 e vale 10 min: até 14h05 ainda pode estar lá, com **1,49%**. No pior caso (L2 gravado às 13h59m59s, L1 de uma réplica preenchido a partir dele um instante antes de vencer), alguém vê a taxa velha até ~14h11. Se a invalidação tivesse funcionado, no máximo 1 min.

**Proposta às 14h12:** usa **a taxa da simulação**, 1,49%, mesmo com a nova já valendo. E está certo: a cliente aceitou aquelas condições, e a proposta copia o que ela viu. Se a regra de negócio fosse "proposta sempre com a taxa vigente", a proposta teria de **recalcular** na criação, e o cache não poderia estar no caminho dessa decisão.

A conta do pior caso é sempre a **soma** das validades da cadeia (aqui, L2 + L1 ≈ 11 min) quando a invalidação falha. Escreva esse número no ADR e pergunte ao negócio se ele aceita.
:::

## E o "cachear tudo por 5 segundos"?

É uma tentação comum em pico: "um cache de 5 s em todas as consultas resolve". Para leituras de tela que todo mundo vê igual (uma lista pública de produtos), resolve. Para o que é **por usuário** e **muda com ação do próprio usuário** (minhas propostas), cria o bug clássico: a pessoa cancela a proposta, a tela recarrega e mostra a proposta ainda ativa. Ela clica de novo, recebe `409`, liga no suporte. Cache por usuário precisa de invalidação **na escrita**, e aí já não é "só 5 segundos".

## Perguntas para responder sem olhar

::: pergunta
Dê dois exemplos de dados que um sistema de crédito nunca deve servir do cache, e o motivo.
???
Status de proposta e saldo/situação de parcelas: decidem crédito e cobrança, e um valor desatualizado gera decisão errada ou cobrança indevida. Também chaves de idempotência de pagamento (o cache pode ser esvaziado e o pagamento duplicar) e dados pessoais como score e renda.
:::

::: pergunta
Como você calcula o pior caso de desatualização num cache em duas camadas?
???
Somando as validades da cadeia quando a invalidação falha: o L1 pode ter sido preenchido a partir de um L2 que já estava perto de vencer. Com L1 1 min e L2 10 min, cerca de 11 min. Com invalidação funcionando, o limite é o L1 das réplicas que não receberam o aviso.
:::

**Próxima:** [5.4 Invalidação por evento e cache fora do ar](04-invalidacao-e-cache-fora.md).
