# 1.3 BuildingBlocks: o que é de todos (e o que não é)

O [`CreditFlow.BuildingBlocks`](https://github.com/JandersonSR/lending-plataform/tree/main/src/BuildingBlocks/CreditFlow.BuildingBlocks) é o único projeto que todos os módulos referenciam. Isso o torna perigoso: tudo que entra nele vira dependência de todo mundo, e mudar qualquer coisa ali exige pensar nos cinco módulos.

::: conceito Shared kernel
No DDD, o pedaço de modelo que contextos diferentes concordam em compartilhar. Aqui ele é pequeno de propósito: só o que é **igual para todos** e **quase nunca muda**.
:::

## O que tem dentro

| Pasta | Conteúdo | Por que é de todos |
|---|---|---|
| `Resultados/` | `Result`, `Result<T>`, `Erro`, `TipoErro` | Todo caso de uso falha de forma prevista do mesmo jeito |
| `ValueObjects/` | `Dinheiro`, `Cpf`, `Percentual` | Um CPF é um CPF em Clientes e em Propostas; dinheiro tem as mesmas regras em todo lugar |
| `Modulos/` | `IModule`, `IModuloComContratos`, `PerfilDeExecucao` | O contrato com o Host |
| `Api/` | `ResultadoHttp.ParaProblema()` | Uma tradução de erro para HTTP, não cinco |
| `Tempo/` | `Brasilia.Hoje(TimeProvider)` | "Hoje" do negócio é em Brasília, não em UTC |
| `Auth/`, `Mensageria/`, `Observabilidade/` | Infraestrutura transversal | Módulos 3, 6 e 12 |

E o que **não** entra, mesmo que pareça útil: `Cliente`, `Proposta`, qualquer regra de score, qualquer enum de status de um módulo, "helpers" de string. Se dois módulos precisam da mesma regra de negócio, provavelmente um deles é o dono e o outro consulta pelo `.Contracts`.

::: armadilha A pasta Utils
Todo shared kernel corre o risco de virar o depósito de "coisas que não sei onde pôr". Teste antes de adicionar: **isto mudaria pelo mesmo motivo em todos os módulos?** Se a resposta for "só em dois", duplique nos dois. Duplicação barata é melhor que acoplamento caro.
:::

## `Result` e `Erro`: falha prevista não é exceção

```csharp
public sealed record Erro(string Codigo, string Mensagem, TipoErro Tipo)
{
    public IReadOnlyDictionary<string, string[]>? Campos { get; init; }
    public static Erro Validacao(string codigo, string mensagem, string? campo = null) => ...
    public static Erro NaoEncontrado(string codigo, string mensagem) => ...
}
```

```csharp
public static Result<Dinheiro> Criar(decimal valor, string campo = "valor")
{
    if (valor < 0)
        return Erro.Validacao("dinheiro.negativo", "O valor não pode ser negativo.", campo);
    if (decimal.Round(valor, 2) != valor)
        return Erro.Validacao("dinheiro.casas", "O valor aceita no máximo 2 casas decimais (centavos).", campo);
    return new Dinheiro(valor);
}
```

Repare: o método devolve `Result<Dinheiro>`, mas o código retorna um `Erro` ou um `Dinheiro`. Funciona por causa de dois **operadores de conversão implícita** em `Result<T>`:

```csharp
public static implicit operator Result<T>(T valor) => Ok(valor);
public static implicit operator Result<T>(Erro erro) => Falha(erro);
```

::: porque Por que `Result` e não exceção
Exceção é para o que ninguém previu: banco fora, bug, disco cheio. "Valor abaixo de R$ 1.000" é previsto, acontece todo dia e faz parte da regra. Com exceção, a falha some da assinatura do método (quem chama não sabe que precisa tratar), o fluxo vira `try/catch` espalhado, e lançar exceção custa caro (captura a pilha inteira). Com `Result`, o compilador obriga quem chama a olhar `Sucesso`.

Visto a fundo, com comparação de custo, em [Plataforma, lição 1.5](../../../plataforma-dotnet/docs/modulo-01/05-erros-e-resultado.md).
:::

::: conceito `[MemberNotNullWhen]`
```csharp
[MemberNotNullWhen(false, nameof(Erro))]
public bool Sucesso => Erro is null;
```
Um atributo que ensina a análise de nulos do compilador: "se `Sucesso` for falso, `Erro` não é null". Depois de `if (!r.Sucesso)`, você usa `r.Erro.Codigo` sem `!` e sem aviso. É o equivalente a um *type guard* do TypeScript (`x is Erro`).
:::

## Value objects: se existe, é válido

O [`Cpf`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/ValueObjects/Cpf.cs) tem construtor **privado**. O único caminho é `Cpf.Criar(texto)`, que valida formato, dígitos repetidos e os dois dígitos verificadores (módulo 11). Consequência: qualquer método que recebe um `Cpf` sabe que ele é válido, e ninguém precisa validar de novo.

```csharp
public override string ToString() => Mascarado;   // "***.982.247-**"
```

::: porque Por que o `ToString` do CPF mascara
Um dia alguém escreve `logger.LogInformation("Cadastrado {Cpf}", cliente.Cpf)`. Com o `ToString` padrão de um record, o log ganharia `Cpf { Digitos = 52998224725 }`, e o CPF inteiro iria para o Elasticsearch, para o backup do Elasticsearch, para o terminal de quem estiver olhando. A LGPD trata vazamento de dado pessoal como incidente reportável. Fazer o caminho fácil ser o seguro custa uma linha.
:::

O [`Dinheiro`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/ValueObjects/Dinheiro.cs) é um `readonly record struct` sobre `decimal`, e o [`Percentual`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/ValueObjects/Percentual.cs) guarda a taxa como **fração** (2% = 0,02) com dois construtores nomeados, `DePontos(2)` e `DeFracao(0.02m)`. O módulo 2 explica por que `decimal` e onde arredondar.

::: previsao
`Percentual` tivesse um construtor público `new Percentual(2)`. Quanto valeria a parcela de um empréstimo de R$ 10.000 em 12 meses, se alguém escrevesse `new Percentual(2)` achando que eram 2%?
???
Seria uma taxa de **200% ao mês**: parcela de cerca de R$ 20.000 por mês. Nenhum teste de tipo pegaria, porque `2` é um `decimal` válido. Os dois nomes explícitos (`DePontos`, `DeFracao`) transformam a ambiguidade num erro de leitura óbvio no code review. É o mesmo motivo de existir `TimeSpan.FromMinutes(5)` em vez de `new TimeSpan(5)`.
:::

## `struct` ou `class`?

| | `readonly record struct` (Dinheiro, Percentual) | `sealed record` (Cpf, Erro) |
|---|---|---|
| Onde vive | Inline, sem alocação no heap | Heap |
| `default` | Existe (`Dinheiro` zero) e é válido | `null` |
| Bom para | Valores pequenos, muitos, sempre válidos no zero | Valores cujo "vazio" não faz sentido (não existe CPF zero) |

O motor de cálculo cria milhares de `Dinheiro` por simulação; como struct, isso não gera lixo para o coletor. Um `Cpf` padrão (`default`) seria inválido, por isso ele é classe.

## Perguntas para responder sem olhar

::: pergunta
Como decidir se algo entra no BuildingBlocks?
???
Se for igual para todos os módulos e mudar pelo mesmo motivo em todos. Regra de negócio de um módulo nunca entra. Na dúvida, duplique.
:::

::: pergunta
Por que `Cpf` tem construtor privado?
???
Para que a única forma de obter um seja `Criar`, que valida. Todo `Cpf` existente é válido; o resto do sistema não revalida.
:::

**Próxima:** [1.4 Fronteiras e testes de arquitetura](04-fronteiras-e-testes-de-arquitetura.md).
