# Módulo 1-J: Exercícios

Cada exercício é um commit. Os critérios de aceite dizem quando está pronto.

---

## Exercício 1: Rodar, verificar e quebrar

1. Gere o Maven Wrapper (lição 1J.1) e rode `./mvnw verify`. **A camada Spring deste módulo não foi
   compilada no ambiente onde o curso foi escrito**: se algo quebrar, investigue (leia o erro inteiro,
   confira a documentação do Spring Boot 4) e corrija. Anote no `NOTAS.md` o que quebrou e por quê.
2. Rode `./mvnw spring-boot:run` e execute todas as requisições do `java/payments/requests.http`.
3. Quebre de propósito e anote o resultado:
   - Tire o `@Valid` do `process(...)` no controller e mande a requisição 6 (payload inválido).
     O que acontece agora? Onde o erro aparece, se aparecer?
   - Suba com `PAYMENTS_EVENTQUEUECAPACITY=1`.
   - No `PaymentEventsWorker`, tire o `try/catch` de dentro do loop e faça o `handle` lançar exceção
     para `PaymentDeclined`. Mande um pagamento recusado e depois 3 aprovados. As notificações dos
     aprovados aparecem? Compare com o comportamento do .NET (lição 1.7).

**Aceite:** `./mvnw verify` verde e `NOTAS.md` com as três observações explicadas.

---

## Exercício 2: Estorno parcial

Hoje o estorno é sempre do valor total. Implemente `POST /payments/{id}/refund` com `amount` opcional.

**Aceite:**
- Sem `amount`: estorna o saldo restante (comportamento atual).
- Com `amount`: estorna parcialmente; a soma dos estornos nunca passa do valor pago (409 se passar).
- Status `PARTIALLY_REFUNDED` enquanto houver saldo; `REFUNDED` quando zerar.
- Cada estorno gera um `PaymentRefunded` com o valor **daquele** estorno.
- Regras no domínio, testes de unidade para cada uma (inclua o caso 0,01 de sobra).

<details><summary>Dica</summary>

Guarde a lista de estornos (um record `Refund(amount, reason, at)`) e calcule o saldo, em vez de
guardar só um "valor estornado". Use `compareTo` para comparar `BigDecimal`. E pense: o estorno
parcial repetido (retry) deveria ser idempotente? Como, se o corpo é igual mas são dois estornos
legítimos? (Resposta: `Idempotency-Key` no estorno também.)
</details>

---

## Exercício 3: Não chamar o gateway duas vezes (o mais importante do módulo)

A lição 1J.7 mostrou: 50 requisições simultâneas com a mesma chave geram **um** pagamento, mas
chamam o gateway até **50 vezes**.

1. Escreva um teste que **prova** o problema: um gateway que conta chamadas e espera alguns
   milissegundos, 50 threads virtuais com a mesma chave, e a asserção `assertEquals(1, chamadas)`.
   Ele deve falhar.
2. Corrija para que o gateway seja chamado **exatamente uma vez** por chave.

**Aceite:** o teste do passo 1 passa 20 de 20 vezes, e todos os testes existentes continuam verdes.
No `NOTAS.md`, explique como a sua solução funcionaria com **3 pods** do Payments (memória não é
compartilhada entre pods!) e o que muda quando o repositório for Postgres.

<details><summary>Dica</summary>

Reserve a chave ANTES de chamar o gateway. Uma forma: `ConcurrentHashMap<String, CompletableFuture<Payment>>`
com `computeIfAbsent`: quem chega primeiro cria o future e chama o gateway; quem chega depois espera o
mesmo future (`join()`). Com banco, a reserva vira um `INSERT` numa tabela de chaves com constraint
única e status `IN_PROGRESS`; quem perder a inserção espera ou recebe 409 "requisição em andamento".
Pense também: e se o processo morrer com a chave em `IN_PROGRESS`?
</details>

---

## Exercício 4: Concorrência no mesmo pagamento

Dispare 20 estornos simultâneos para o mesmo pagamento (com o estorno parcial do Exercício 2, cada
um de 10% do valor) e verifique que o total estornado nunca passa de 100%.

**Aceite:** o teste passa 20 de 20 vezes, **sem** `synchronized` no `PaymentService`. Explique no
`NOTAS.md` por que `synchronized` não resolveria com vários pods.

<details><summary>Dica</summary>

Mesma solução do Exercício 5 do Módulo 1 (.NET): versão no agregado e `ConcurrentHashMap.replace(id,
antigo, novo)`, que só troca se o valor atual for o esperado. Retry com recarga em caso de conflito.
</details>

---

## Exercício 5: `RestTestClient`

Reescreva o `PaymentApiIntegrationTest` usando o `RestTestClient` do Spring Framework 7 (no Boot 4
ele pode ser injetado num `@SpringBootTest`; consulte a documentação para o import e a anotação certos).

**Aceite:** os mesmos 7 cenários, com asserções sobre o JSON (`jsonPath`) em vez de `contains` em
string. No `NOTAS.md`: o que ficou melhor e o que ficou pior que a versão com `HttpClient`.

---

## Exercício 6: ADR da fiação

Escreva `docs/adr/0002-beans-explicitos-vs-component-scan.md` (o 0001 é do Módulo 1): o Payments
registra domínio, aplicação e infraestrutura com `@Bean` explícito, sem `@Service`. Defenda manter ou
mudar para component scan.

**Aceite:** contexto, opções consideradas (pelo menos 2), decisão, consequências positivas e
negativas. Se decidir mudar, faça a mudança no mesmo commit.

---

## Checklist de saída do módulo

- [ ] Explico em voz alta por que o escopo padrão do Spring (singleton) exige beans sem estado de requisição.
- [ ] Explico threads virtuais versus `async/await`, e quando threads virtuais **não** ajudam.
- [ ] Sei as três armadilhas do `BigDecimal` e a do `==` com `Integer`.
- [ ] Explico por que o `PaymentEventsWorker` precisa de `try/catch` por mensagem e de `volatile`.
- [ ] Explico o problema do gateway chamado N vezes e a solução do Exercício 3, inclusive com vários pods.
- [ ] Exercícios 1 a 4 commitados.

Próximo: [Perguntas de entrevista](perguntas-de-entrevista.md)
