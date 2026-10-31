# Módulo 6: Kafka no CreditFlow: outbox, saga de desembolso e consumidor idempotente

**Objetivo:** fazer o dinheiro sair **uma vez**, sem transação distribuída. Ao fim do módulo, um contrato assinado em Propostas vira um PIX em Pagamentos e volta como "Liberada" (ou como compensação), com vários pods publicando e consumindo ao mesmo tempo, e você sabe dizer exatamente o que acontece quando cada peça cai no meio do caminho.

O Kafka em si (log, partição, offset, grupo, `acks`) foi ensinado a fundo no [módulo 5 da Plataforma .NET](../../../plataforma-dotnet/docs/modulo-05/README.md). Aqui a gente usa esse conhecimento num problema com dinheiro, onde "pelo menos uma vez" deixa de ser detalhe técnico e vira pergunta de auditoria.

## O que você vai conseguir fazer no fim

- Separar evento de **integração** de evento de **domínio** e desenhar tópicos, chaves e versões de um contrato público
- Explicar o **dual write** e por que a outbox resolve, olhando a tabela e o `SaveChanges`
- Explicar `FOR UPDATE SKIP LOCKED` e por que, sozinho, ele **embaralha** a ordem com vários relays (e medir isso)
- Escrever um consumidor com inbox, commit manual, retry com recuo, classificação de falhas e DLT
- Comparar saga orquestrada e coreografada e defender a escolha do CreditFlow
- Desenhar a saga de desembolso com o caminho feliz e as falhas, incluindo o **timeout depois de processar**
- Quebrar o relay, duplicar mensagens e derrubar o gateway de propósito, e diagnosticar cada caso

## O que você constrói

- A Mensageria compartilhada: [`src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Mensageria/MensageriaServiceCollectionExtensions.cs) (produtor, outbox, relay, inbox, consumidor, DLT, rastreio W3C)
- O módulo Pagamentos: [`src/Modules/Pagamentos/`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Pagamentos/CreditFlow.Modules.Pagamentos/PagamentosModule.cs) (agregados Desembolso e Parcela, gateway PIX simulado, saga)
- O fim da saga em Propostas: [`Application/Integracao/ReacoesAoDesembolso.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Propostas/CreditFlow.Modules.Propostas/Application/Integracao/ReacoesAoDesembolso.cs)
- Os eventos de integração em `*.Contracts/Eventos`
- O ADR [`docs/adr/0006-outbox-e-saga.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0006-outbox-e-saga.md)
- Os protótipos executáveis da pasta [`labs/`](labs/) (Node + Postgres), que provam o comportamento com números

## Pré-requisitos

- Módulos 1 a 4 (solução rodando no `docker compose`, Propostas gravando no Postgres)
- [Plataforma .NET, módulo 5](../../../plataforma-dotnet/docs/modulo-05/README.md): pelo menos as lições 5.1 (log, partição, offset) e 5.3 (consumidor)
- Node.js 20+ e um Postgres 16 local para os labs (o do `docker compose` serve)

## Lições

| # | Lição | Tempo |
|---|---|---|
| 6.1 | [Eventos de integração, tópicos, chaves e versões](01-eventos-e-topicos.md) | 50 min |
| 6.2 | [Dual write e a outbox por dentro](02-dual-write-e-outbox.md) | 50 min |
| 6.3 | [O relay: SKIP LOCKED, faixas e a ordem por chave](03-relay-e-faixas.md) | 70 min |
| 6.4 | [O consumidor idempotente: inbox, retry, DLT](04-consumidor-idempotente.md) | 75 min |
| 6.5 | [A saga de desembolso: coreografia, gateway e compensação](05-saga-de-desembolso.md) | 75 min |
| 6.6 | [Lab de quebra: relay fora, mensagem duplicada, gateway caindo](06-lab-de-quebra.md) | 60 min |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |
| — | [Desafio: a quitação antecipada](desafio.md) | 3 a 5 h |

**Tempo estimado do módulo:** 8 a 10 horas, mais o desafio.

## Entregável

Uma apresentação de 20 minutos para o time: **"Como o CreditFlow garante que o PIX sai uma vez, e só uma"**, com o diagrama de sequência da lição 6.5 e os números dos labs.
