# Módulo 1: Exercícios

Cada exercício é um commit no **seu** repositório. Faça na ordem. Os critérios de aceite dizem
quando está pronto; as dicas ficam escondidas para você tentar antes.

---

## Exercício 1: Rodar e quebrar (aquecimento)

1. Rode `dotnet build`, `dotnet test` e `dotnet run`. Execute todas as requisições do `requests.http`.
2. Quebre de propósito, uma de cada vez, e anote o erro que aparece:
   - Comente `builder.Services.AddValidation();` e mande o payload inválido (requisição 7).
   - Mova `app.UseExceptionHandler();` para depois de `app.MapOrderEndpoints();` e cancele um
     pedido pago. Ainda vem o 409 com ProblemDetails? Explique por quê (a lição 1.4 tem a pista).
   - Troque `FullMode = BoundedChannelFullMode.Wait` por `DropWrite`, coloque
     `EventQueueCapacity` = 10 e adicione um `await Task.Delay(1000)` no `HandleAsync` do worker.
     Crie 30 pedidos rápido. Quantas notificações aparecem no log?

**Aceite:** um arquivo `NOTAS.md` com o que aconteceu em cada quebra e **por quê**, nas suas palavras.

---

## Exercício 2: Endpoint de itens

Crie `POST /orders/{id}/items` que adiciona um item a um pedido `Pending`.

**Aceite:**
- Regra no domínio (`Order.AddItem`), não no endpoint.
- Pedido não `Pending` → 409. SKU que já existe no pedido → soma a quantidade (não duplica).
- Respeita `MaxItemsPerOrder`.
- Gera um evento novo `OrderItemAdded`, tratado no worker.
- Teste de unidade para cada regra + um teste de integração do caminho feliz.

<details><summary>Dica</summary>

Como `_items` é uma `List<OrderItem>` de records imutáveis, "somar quantidade" é substituir o
item: `_items[i] = existente with { Quantity = existente.Quantity + quantidade };`.
</details>

---

## Exercício 3: Idempotência de verdade

Hoje, se o cliente repetir a `Idempotency-Key` com um **corpo diferente**, a API devolve o pedido
original sem reclamar. Isso esconde bug no cliente.

**Aceite:**
- Mesma chave + mesmo corpo → 200 com o pedido original (como hoje).
- Mesma chave + corpo diferente → **422** com `code: "idempotency.key_reused"`.
- Teste de integração para os dois casos.

<details><summary>Dica</summary>

Guarde junto com a chave um hash do corpo da requisição (por exemplo, SHA-256 do JSON
normalizado). Pense: onde calcular esse hash? No endpoint ou no serviço? Justifique no commit.
</details>

---

## Exercício 4: OpenAPI e documentação

Adicione o pacote `Microsoft.AspNetCore.OpenApi`, chame `builder.Services.AddOpenApi()` e
`app.MapOpenApi()` (só em Development).

**Aceite:**
- `GET /openapi/v1.json` mostra os 5 endpoints com **todos** os status codes declarados nos
  `Results<...>`, sem você escrever nenhuma anotação extra.
- Explique no `NOTAS.md` por que o `TypedResults` permitiu isso.

---

## Exercício 5: Concorrência no mesmo pedido (pensar, depois codar)

Escreva um teste de integração que dispara, em paralelo, 20 `cancel` e 20 `simulate-payment`
para o **mesmo** pedido e verifica que o pedido termina em **exatamente um** estado final, com
**exatamente um** evento de transição.

1. Rode o teste. Ele passa sempre? Rode 10 vezes.
2. Corrija **sem** usar `lock` no serviço. (Dica: pense em versão.)

**Aceite:** o teste passa 10 de 10 vezes e o `NOTAS.md` explica por que um `lock` não serviria
com 3 pods no Kubernetes.

<details><summary>Dica</summary>

Adicione `Version` ao `Order`. No repositório, `UpdateAsync(order, expectedVersion)` usa
`ConcurrentDictionary.TryUpdate(id, novo, antigo)` e lança uma exceção de conflito se a versão
mudou. O serviço pode tentar de novo (recarregando o pedido) uma ou duas vezes.
É exatamente o modelo de concorrência otimista do EF Core no Módulo 3.
</details>

---

## Exercício 6: Result pattern (opcional, para debate sênior)

Reescreva `Order.Cancel` e `Order.MarkAsPaid` para retornar um `Result` em vez de lançar
`DomainException`, e ajuste serviço e endpoints.

**Aceite:** uma seção no `NOTAS.md` comparando as duas abordagens com prós e contras **que
você sentiu escrevendo o código**, não copiados da internet. Depois decida qual fica no projeto
e registre a decisão como seu primeiro ADR (`docs/adr/0001-erros-de-dominio.md`): contexto,
decisão, consequências.

---

## Checklist de saída do módulo

- [ ] Explico em voz alta, sem olhar, as duas fases do `Program.cs` e os três tempos de vida.
- [ ] Explico por que `ValidateOnStart` importa no Kubernetes.
- [ ] Explico a diferença entre liveness e readiness e o erro de pôr o Kafka na liveness.
- [ ] Explico o dual write problem com um exemplo.
- [ ] Exercícios 1 a 5 commitados.

Próximo: [Perguntas de entrevista](perguntas-de-entrevista.md)
