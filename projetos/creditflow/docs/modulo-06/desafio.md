# Desafio do módulo 6: a quitação antecipada

::: desafio Quitar o contrato antes do prazo, sem roteiro
O cliente quer quitar o contrato inteiro de uma vez. Propostas calcula o valor de quitação (saldo devedor com desconto dos juros futuros, regra didática: some a amortização das parcelas em aberto). O cliente confirma, Pagamentos gera a cobrança, e quando o pagamento chega todas as parcelas em aberto são baixadas e a proposta vira `Quitada`.

Você decide: quem publica o quê, em qual tópico, com qual chave; se é coreografia ou se já vale um orquestrador; o que é compensação aqui (o cliente desistiu? o pagamento não chegou em 3 dias úteis?).

**Critérios de aceite**

1. Eventos de integração novos em `*.Contracts/Eventos`, com `[EventoIntegracao]`, valores em centavos, chave justificada por escrito.
2. Todo evento que muda estado sai pela outbox. Nenhum `ProduceAsync` em caso de uso.
3. O pagamento da quitação é idempotente por `Idempotency-Key` (como `PagarParcela`) **e** o consumidor que baixa as parcelas é idempotente (inbox ou estado, justifique).
4. Uma `ParcelaPaga` que chega **durante** a quitação (o cliente pagou a parcela do mês no mesmo dia) não pode gerar cobrança em dobro nem parcela negativa. Escreva o diagrama de sequência desse caso.
5. Um teste com Testcontainers que entrega a mesma mensagem duas vezes e prova que as parcelas são baixadas uma vez.
6. Um diagrama de sequência com o caminho feliz e pelo menos duas falhas (pagamento não chega; mensagem duplicada).
7. Um ADR curto (`docs/adr/00XX-quitacao-antecipada.md`) com a decisão coreografia × orquestração para este fluxo e a alternativa descartada.

**Não vale:** transação que toque dois schemas; chamar Propostas de dentro de Pagamentos para "conferir o saldo" sem passar por `*.Contracts`; retry sem classificar a falha.
:::

::: dica Por onde começar
Desenhe primeiro, codifique depois. Escreva os fatos no passado ("QuitacaoSolicitada", "QuitacaoPaga") e pergunte, para cada um: quem é o dono? quem precisa saber? se chegar duas vezes, o que acontece? se chegar antes do anterior, o que acontece?
:::

::: solucao Uma resposta possível (abra só depois de entregar)
- Propostas publica `QuitacaoSolicitada(propostaId, valorCentavos, validaAte)` em `creditflow.propostas.v1`, chave `PropostaId`. Pagamentos cria uma `Cobranca` (agregado novo) com índice único `(proposta_id, tipo='quitacao', status aberta)`.
- O pagamento chega por `POST /v1/pagamentos/cobrancas/{id}/pagamento` com `Idempotency-Key`. Na mesma transação: cobrança paga, **todas** as parcelas `Aberta` da proposta marcadas `Paga` com `ValorPagoCentavos` proporcional, e um único `QuitacaoPaga` na outbox (chave `PropostaId`).
- Item 4: a baixa de parcela e a quitação disputam as mesmas parcelas; a concorrência otimista (`versao`) em cada parcela faz uma das duas transações perder e reler. Se a parcela do mês foi paga primeiro, a quitação recalcula o valor e devolve 409 com o novo valor ("o saldo mudou, confirme de novo"). Se a quitação foi primeiro, `PagarParcela` recebe `parcela.ja_paga`.
- Coreografia continua bastando: dois participantes, compensação simples (cobrança vencida → `QuitacaoExpirada`, Propostas volta ao estado anterior). O ADR registra que, se entrar "reembolso de seguro prestamista proporcional", o fluxo ganha um terceiro participante com compensação cruzada e o orquestrador passa a valer.
:::
