# 1.5 Erros previstos sem exceção: `Resultado<T>` e códigos estáveis

Em Node, você provavelmente lança `throw new NotFoundError()` e um middleware transforma em 404. Funciona, mas mistura duas coisas bem diferentes: o que **é esperado acontecer** (CEP que não existe, cota esgotada) e o que **não deveria acontecer nunca** (banco com a senha errada, `NullReferenceException`).

## Duas categorias de falha

| | Falha prevista | Falha inesperada |
|---|---|---|
| Exemplos | CEP mal formado, CEP inexistente, cota esgotada, fonte fora com cache disponível | Bug, configuração errada, banco inacessível de vez |
| Quem decide o que fazer | A regra de negócio e quem chamou | Ninguém: registra, alerta, responde 500 |
| Como representar | Um valor de retorno (`Resultado<T>`) | Exceção |
| Vai para o alerta? | Não. É o sistema funcionando | Sim |

::: porque Por que não usar exceção para tudo
- **A assinatura mente.** `Task<Endereco> Consultar(string cep)` não conta que pode não achar. `Task<Resultado<Endereco>>` conta, e o compilador obriga quem chama a olhar `Sucesso`.
- **Exceção é cara.** Montar o stack trace custa microssegundos; num endpoint com milhares de CEPs inválidos por minuto, aparece no perfil de CPU.
- **Polui o monitoramento.** Se "CEP não encontrado" é exceção, o painel de erros enche de ruído e o erro real se esconde no meio.

A alternativa descartada, exceções de domínio com um middleware, é comum e aceitável em sistemas pequenos. O projeto registrou a escolha no ADR-006.
:::

## O tipo `Resultado<T>`

Abra [`Resultado.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.SharedKernel/Resultado.cs). O essencial:

```csharp
public readonly record struct Resultado<T>
{
    public T? Valor { get; }
    public Erro? Erro { get; }

    [MemberNotNullWhen(true, nameof(Valor))]
    [MemberNotNullWhen(false, nameof(Erro))]
    public bool Sucesso => Erro is null;

    public static implicit operator Resultado<T>(T valor) => Ok(valor);
    public static implicit operator Resultado<T>(Erro erro) => Falha(erro);
}
```

::: porque Os detalhes que fazem diferença no dia a dia
- **`MemberNotNullWhen`**: depois de `if (!r.Sucesso) return ...;`, o compilador sabe que `r.Valor` não é nulo. Sem isso, você encheria o código de `!`.
- **Conversões implícitas**: no handler você escreve `return CepErros.NaoEncontrado;` ou `return endereco;` e o tipo vira `Resultado<T>` sozinho. O código de regra fica limpo.
- **`record struct`**: um resultado por requisição não deveria alocar no heap.
:::

## Código de erro estável

O [`Erro`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.SharedKernel/Erro.cs) tem um **código numérico** além do texto, em faixas: 1000 validação, 2000 negócio, 9000 sistema.

::: porque
O parceiro que integra com a API não deve tratar erro comparando texto. Texto muda ("CEP não encontrado" vira "Endereço não localizado") e quebra a integração dele sem ninguém perceber. O número **nunca muda de significado**: o 2001 será sempre "CEP inexistente". O texto é para pessoas; o código é para máquinas.
:::

## Só um lugar sabe o que é HTTP

O handler devolve `Erro` com um `TipoDeErro` (Validação, NãoEncontrado, Conflito, RegraDeNegocio, Indisponível). Quem traduz para status HTTP é **um único arquivo**, o [`ResultadoHttpExtensions.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.SharedKernel.Web/Http/ResultadoHttpExtensions.cs):

```csharp
public static int Status(TipoDeErro tipo) => tipo switch
{
    TipoDeErro.Validacao      => 400,
    TipoDeErro.NaoEncontrado  => 404,
    TipoDeErro.Conflito       => 409,
    TipoDeErro.RegraDeNegocio => 422,
    TipoDeErro.Indisponivel   => 503,
    _                         => 500
};
```

::: analogia
A regra de negócio fala "o que aconteceu". Cada borda fala a sua língua: o HTTP traduz para status, o consumidor do Kafka traduz para "confirma e segue", "tenta de novo" ou "manda para a fila de mortas". É como uma peça reprovada na inspeção: o inspetor registra o defeito; quem decide se volta para retrabalho ou vai para sucata é o setor seguinte.
:::

## Toda resposta de erro tem o mesmo formato

O projeto responde erros em `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)), sempre com `codigo` e `correlationId`. Isso vale também para 404 de rota, 405 e 429, configurado em [`ProblemDetailsExtensions.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.SharedKernel.Web/Http/ProblemDetailsExtensions.cs).

::: previsao
Com a API rodando (`docker compose up`), qual o status e o `codigo` de cada chamada?

```bash
curl -s localhost:8080/v1/cep/123
curl -s localhost:8080/v1/cep/99999999
curl -s localhost:8080/v1/rota-que-nao-existe
```
???
1. **`/v1/cep/123`**: 400, `codigo: 1001`. O filtro de validação ([`FiltroDeValidacao.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.SharedKernel.Web/Http/FiltroDeValidacao.cs)) roda antes do handler e usa o código do validador. O corpo traz também `errors` com o campo `Cep`.
2. **`/v1/cep/99999999`**: formato válido, mas o ViaCEP responde que não existe. 404, `codigo: 2001`.
3. **Rota inexistente**: 404 com `codigo: 1000`. Nenhum handler rodou; quem preencheu foi a configuração padrão do ProblemDetails, que dá 1000 para qualquer 4xx sem código.

Repare que as três respostas têm o mesmo formato e trazem `correlationId`. Com esse id, o suporte acha a requisição nos logs.
:::

## Lab de quebra: vazar detalhe interno

::: quebra
No `ConsultarCepHandler`, troque temporariamente a primeira linha do método `Handle` por:

```csharp
throw new InvalidOperationException("Connection string: Host=pg;Password=segredo123");
```

Chame `curl -s localhost:8080/v1/cep/01001000`. A senha aparece na resposta? E no log do contêiner?
:::

::: solucao
Na resposta, **não**: o [`TratadorGlobalDeExcecoes`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.SharedKernel.Web/Http/TratadorGlobalDeExcecoes.cs) responde 500 com `title: "Erro inesperado"` e `codigo: 9000`, sem a mensagem da exceção.

No log, **sim**: a exceção é registrada inteira, com a mensagem. Por isso mensagens de exceção nunca devem conter segredo, e por isso o acesso aos logs também é controlado.

Desfaça a alteração.
:::

## Perguntas para responder sem olhar

::: pergunta
Quando usar `Resultado<T>` e quando lançar exceção?
???
`Resultado<T>` para falha prevista, que faz parte do negócio e que quem chama deve tratar (dado inválido, não encontrado, regra violada, dependência fora com alternativa). Exceção para o que não deveria acontecer (bug, configuração errada), que vira 500, log de erro e alerta.
:::

::: pergunta
Por que o erro tem código numérico se já tem título?
???
Porque o título é texto para pessoas e pode mudar. O código é contrato para máquinas e nunca muda de significado: a integração do parceiro trata pelo número e não quebra quando o texto for melhorado.
:::

::: pergunta
Onde o projeto decide que "regra de negócio violada" vira 422? Por que ali?
???
Em `ResultadoHttpExtensions.Status`, no `SharedKernel.Web`. É o único lugar que conhece HTTP, então as regras de negócio não dependem de status code e o mesmo erro pode ser traduzido de outro jeito no consumidor Kafka.
:::

**Próxima:** [1.6 Como os módulos conversam](06-comunicacao-entre-modulos.md).
