# 0004. Idempotência em duas camadas: `Idempotency-Key` na API e consumidor idempotente

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** Janderson, revisão do time

## Contexto

Duplicatas chegam por dois caminhos. Na **borda**: o cliente não recebe a resposta do
`POST /orders` (timeout de rede) e repete. No **Kafka**: a entrega é *at-least-once* (ADR 0002) e
o outbox pode publicar duas vezes (ADR 0003). Em pagamentos, duplicata é cobrança dupla. O
Módulo 1-J mostrou ainda que idempotência mal feita sob concorrência grava um registro só mas
chama o adquirente 50 vezes.

## Decisão

1. **API:** `POST /orders` e `POST /payments` aceitam o header `Idempotency-Key`. A chave é
   gravada com restrição de unicidade **na mesma transação** do recurso; um retry com a mesma chave
   devolve o resultado original (200) sem reexecutar. Chave reutilizada com corpo diferente é
   recusada (422). As chaves expiram em 24 h.
2. **Consumidores:** cada evento tem um `eventId` (UUIDv7). O consumidor grava o `eventId` numa
   tabela `inbox_messages` (inbox) com chave única, na mesma transação do efeito; um `eventId` repetido é
   descartado. O domínio também é idempotente onde for natural (marcar como pago um pedido já pago não faz nada).
3. **Adquirente:** a chave de idempotência é repassada ao gateway, para que um retry nosso não vire
   duas cobranças do lado dele.

## Alternativas consideradas

- **Exactly-once do Kafka** (transações do produtor + `read_committed`). Garante exatamente uma
  vez **dentro do Kafka** (ler-processar-escrever em tópicos). Não cobre o efeito no Postgres nem a
  chamada ao adquirente, que são justamente os que importam. Rejeitado como solução única.
- **Deduplicação só por estado do domínio** (checar o status antes). Funciona para algumas
  transições, falha sob concorrência sem trava, e não cobre efeitos externos.
- **Cache (Redis) para as chaves.** Rápido, mas não é transacional com o banco: o recurso pode ser
  criado e a chave não. Rejeitado como fonte da verdade.

## Consequências

- Positivas: retries seguros em todos os pontos do fluxo; o mesmo raciocínio nas duas stacks.
- Negativas: uma tabela e uma escrita a mais por requisição e por evento; um job de expiração; o
  cliente precisa gerar e guardar a chave por intenção (documentação da API e SDKs).
- Obrigatório: teste de concorrência (N requisições simultâneas com a mesma chave) para todo
  endpoint idempotente, contando também os efeitos externos (chamadas ao gateway), não só os registros.

## Revisitar quando

- O volume de chaves tornar a tabela um gargalo (particionar por data resolve antes de mudar o desenho); ou
- surgir um efeito externo que não aceite chave de idempotência (exige outro padrão, como reserva + confirmação).
