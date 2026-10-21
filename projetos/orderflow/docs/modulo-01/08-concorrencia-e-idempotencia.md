# 1.8 Concorrência e idempotência

Arquivo: `Infrastructure/InMemoryOrderRepository.cs`

## No .NET não existe event loop protegendo você

No Node, seu código JavaScript roda numa thread só: duas requisições nunca executam a linha
`pedidos.set(id, p)` exatamente ao mesmo tempo. No ASP.NET, o Kestrel distribui as requisições
entre várias threads do thread pool. **Duas requisições podem executar o mesmo método, no mesmo
objeto singleton, no mesmo instante.**

Por isso o repositório usa `ConcurrentDictionary`, e não `Dictionary`. Um `Dictionary` comum
acessado por várias threads pode corromper a estrutura interna (e já houve casos de loop infinito
consumindo 100% de CPU em produção por causa disso).

## Idempotency-Key: o cliente pode repetir sem medo

Redes falham. O app do cliente manda `POST /orders`, a resposta se perde no 4G, o app tenta de
novo. Sem proteção, o cliente recebe **dois pedidos e duas cobranças**.

O padrão de mercado (usado por Stripe, Adyen e afins): o cliente gera uma chave única por
intenção de compra e manda no header `Idempotency-Key`. O servidor:

- primeira vez com a chave → cria o pedido, responde **201 Created**;
- mesma chave de novo → **não cria nada**, devolve o pedido original com **200 OK**.

## O bug de corrida que este curso cometeu (e corrigiu)

A primeira versão do repositório guardava `chave → id`:

```csharp
var winnerId = _idempotencyKeys.GetOrAdd(key, order.Id);   // atômico
if (winnerId != order.Id)
    return (_orders[winnerId], false);                       // ❌ pode explodir
_orders[order.Id] = order;
```

Parece correto: `GetOrAdd` é atômico, só uma thread "ganha" a chave. Mas veja a sequência com
duas requisições simultâneas, A e B:

```
A: GetOrAdd → ganha a chave
B: GetOrAdd → perde, recebe o id de A
B: _orders[idDeA]          → KeyNotFoundException! A ainda não gravou o pedido
A: _orders[order.Id] = order
```

O teste manual com `curl`, uma requisição por vez, **nunca** pega isso. Só aparece sob carga,
em produção, às vezes. A correção foi guardar `chave → Order` (o próprio objeto):

```csharp
var winner = _idempotencyKeys.GetOrAdd(key, order);
if (!ReferenceEquals(winner, order))
    return (winner, false);   // ✅ a perdedora recebe o objeto da vencedora diretamente
```

A verificação usada no desenvolvimento deste curso: 50 requisições simultâneas com a mesma chave.

```bash
seq 50 | xargs -P 50 -I{} curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5279/orders \
  -H 'content-type: application/json' -H 'Idempotency-Key: corrida-1' \
  -d '{"customerId":"cli-002","items":[{"sku":"CABO-USB","quantity":1,"unitPrice":10}]}' | sort | uniq -c
#   49 200
#    1 201
```

Um único pedido criado. (No Windows, rode isso no Git Bash ou no WSL.)

**Lição para levar para a vida:** sempre que houver "verifica e depois age" (*check-then-act*)
sobre estado compartilhado, desconfie. E teste concorrência com concorrência de verdade.

## O problema que continua aberto: o mesmo pedido em duas threads

`ConcurrentDictionary` protege o **dicionário**, não o **objeto `Order`** lá dentro. Se chegarem
ao mesmo tempo um `cancel` e um `simulate-payment` para o mesmo pedido, as duas threads alteram o
mesmo objeto e o resultado depende de quem chega primeiro em cada linha. Pode até gerar os dois
eventos, `OrderPaid` e `OrderCancelled`.

Em memória você resolveria com `lock`. Mas em produção você tem **vários pods**, e `lock` só
protege dentro de um processo. A solução real, no Módulo 3, é **concorrência otimista no banco**:
cada pedido tem uma versão; o `UPDATE` só acontece `WHERE version = @versaoLida`; quem chegar
segundo recebe conflito e tenta de novo. O Exercício 5 pede para você pensar nisso antes.

## Idempotência em três camadas

| Camada | Proteção | Onde está |
|---|---|---|
| Entrada HTTP | `Idempotency-Key` | repositório + endpoint |
| Domínio | transições repetidas não fazem nada (`MarkAsPaid` duas vezes) | `Order.cs` |
| Mensageria | consumer idempotente (tabela de mensagens processadas) | Módulo 3 |

Em sistemas distribuídos, você **não consegue** garantir que uma mensagem chegue exatamente uma
vez. Você garante que processá-la mais de uma vez dá o mesmo resultado. Essa frase resume metade
das entrevistas de staff.

Próxima: [1.9 Health checks e logging estruturado](09-health-e-logging.md)
