# 0002. Integração entre serviços só por eventos no Kafka, com `orderId` como chave

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** Janderson, revisão do time

## Contexto

O Payments precisa saber que um pedido foi criado; o Orders precisa saber que um pagamento foi
aprovado, recusado ou estornado. Uma chamada HTTP síncrona do Orders para o Payments acoplaria a
disponibilidade dos dois (o Payments fora = ninguém cria pedido) e a latência (a do adquirente
somada à do pedido). Os eventos de um mesmo pedido têm ordem que importa: `Created → Paid →
Cancelled` fora de ordem produz estado errado.

## Decisão

Os serviços **não se chamam**. Cada um publica eventos de domínio no seu tópico
(`orders.events`, `payments.events`) e consome o tópico do outro. A chave de toda mensagem é o
`orderId`, o que coloca todos os eventos de um pedido na mesma partição e garante a ordem por pedido.
Entrega *at-least-once*: o consumidor confirma o offset depois de processar, e é idempotente (ADR 0004).

## Alternativas consideradas

- **HTTP síncrono com retry e circuit breaker.** Mais simples de entender e depurar. Rejeitado
  pelo acoplamento de disponibilidade; aceitável se a integração fosse uma consulta, não um fato.
- **Fila simples** (Azure Service Bus, RabbitMQ). Atende ao volume atual com menos operação e tem
  DLQ e reentrega prontas. Rejeitado por três motivos: o log retido permite **reprocessar** e
  criar consumidores novos lendo o histórico (um serviço de conciliação amanhã); a ordem por chave
  é nativa; e Kafka é um objetivo de aprendizado do projeto. A comparação completa está na lição 8.3.
- **Azure Event Hubs com API Kafka.** Kafka gerenciado sem operar broker. Considerado no ADR 0006.

## Consequências

- Positivas: o Orders cria pedidos com o Payments fora; picos são absorvidos pelo tópico (o lag
  cresce e é drenado); um novo consumidor não exige mudança nos produtores.
- Negativas: consistência **eventual**: por alguns segundos (ou horas, num incidente), o pedido
  está pago no Payments e pendente no Orders. A interface precisa mostrar "processando". Depurar
  exige trace distribuído com propagação pelos headers (ADR 0007). Ordem só existe **dentro** da
  partição: aumentar partições depois redistribui as chaves.
- Obrigatório: todo consumidor idempotente; toda mensagem que não pode ser processada vai para um
  DLT, nunca trava a partição; contrato versionado (ADR 0005).

## Revisitar quando

- Surgir uma interação que é **consulta** e precisa de resposta imediata (ela vai por HTTP, não por evento); ou
- o custo de operar Kafka ficar desproporcional ao volume (sinal: um cluster de 3 brokers para
  dezenas de mensagens por minuto, sem replay nem novos consumidores em um ano).
