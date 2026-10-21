# 1.10 Testes de unidade e de integração

Arquivos: `tests/OrderFlow.Orders.Tests/`

```bash
dotnet test
```

## A pirâmide neste projeto

```
        /\        poucos: integração (sobe a API em memória)   → Api/OrderEndpointsTests.cs
       /  \
      /____\      muitos: unidade (só o domínio)               → Domain/OrderTests.cs
```

## Testes de unidade do domínio

```csharp
[Fact]
public void MarkAsPaid_CalledTwice_IsIdempotent()
{
    var order = NewOrder();
    order.ClearPendingEvents();

    order.MarkAsPaid("pay-1", Clock);
    order.MarkAsPaid("pay-1", Clock);

    Assert.Equal(OrderStatus.Paid, order.Status);
    Assert.IsType<OrderPaid>(Assert.Single(order.PendingEvents));
}
```

- Sem DI, sem HTTP, sem banco: rodam em milissegundos.
- O nome segue `Metodo_Cenario_ResultadoEsperado`; quando falhar no CI, o nome já explica.
- Estrutura **Arrange / Act / Assert** separada por linhas em branco.
- O `FakeClock` controla o tempo. Repare no teste `Cancel_SetsUpdatedAtFromClock`: ele avança
  5 minutos e confere a data exata. Com `DateTime.Now` no domínio, esse teste seria impossível.

## Testes de integração com `WebApplicationFactory`

```csharp
public class OrderEndpointsTests(WebApplicationFactory<Program> factory)
    : IClassFixture<WebApplicationFactory<Program>>
```

O `WebApplicationFactory` (pacote `Microsoft.AspNetCore.Mvc.Testing`) sobe o seu `Program.cs`
**de verdade** em memória: pipeline, DI, validação, exception handler. Você recebe um `HttpClient`
que fala com ele sem abrir porta de rede. É o `supertest` do .NET.

Esses testes pegam o que o teste de unidade não pega: um middleware na ordem errada, um serviço
não registrado na DI, o JSON de enum saindo como número em vez de texto.

### Cuidado com estado compartilhado

`IClassFixture` sobe a API **uma vez** para a classe inteira, e o repositório em memória é
singleton. Ou seja: os testes compartilham dados. Por isso cada teste usa um `customerId` e uma
`Idempotency-Key` próprios, e nenhum teste depende da ordem de execução. No Módulo 3, com
Postgres, você vai usar **Testcontainers** para subir um banco real e descartável por execução.

## O que testar (e o que não testar)

| Testar | Não perder tempo testando |
|---|---|
| regras de negócio e transições de estado | getters e setters |
| idempotência e casos de borda (vazio, duplicado, limite) | o próprio framework (se o `[Range]` funciona) |
| contrato HTTP: status code, formato do erro, header `Location` | detalhes de implementação privados |

## Uma observação honesta sobre este repositório

O código da API foi compilado, executado e testado com requisições reais (inclusive o teste de
concorrência da lição 1.8), e os testes de domínio foram executados. Os testes de integração
compilam, mas foram escritos num ambiente sem acesso ao NuGet; **rode `dotnet test` na sua
máquina** como primeiro passo do Exercício 1. Se algo falhar, ótimo: é um bug real para você
investigar, e me traga o erro.

Próximo: [Exercícios](exercicios.md)
