# 1.4 Fronteiras, `.Contracts` e testes de arquitetura

Um monolito modular é tão modular quanto a regra que impede alguém de furar a fronteira numa sexta-feira à tarde. Esta lição mostra as duas camadas da fronteira no CreditFlow (o projeto `.Contracts` e os testes de arquitetura) e o que cada uma pega.

## Dois projetos por módulo

| Projeto | Contém | Quem pode referenciar |
|---|---|---|
| `CreditFlow.Modules.Clientes` | `Domain/`, `Application/`, `Infrastructure/`, `Api/`, `ClientesModule` | Só o Host (e os testes do módulo) |
| `CreditFlow.Modules.Clientes.Contracts` | `IConsultaDeClientes`, `PerfilDeCreditoDto`, eventos | Qualquer módulo |

O [contrato de Clientes](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Clientes/CreditFlow.Modules.Clientes.Contracts/IConsultaDeClientes.cs):

```csharp
public interface IConsultaDeClientes
{
    Task<PerfilDeCreditoDto?> ObterPerfilDeCreditoAsync(Guid clienteId, CancellationToken ct = default);
}

public sealed record PerfilDeCreditoDto(Guid ClienteId, int Score, long RendaMensalCentavos, bool ConsentimentoAnaliseDeCredito);
```

::: porque Por que o DTO não tem nome nem CPF
Simulação e Propostas precisam de score, renda e consentimento para decidir crédito. Não precisam de nome nem CPF. A LGPD tem um princípio para isso, o da **necessidade**: tratar o mínimo de dado pessoal necessário para a finalidade. O contrato público é o lugar mais barato para cumprir: o que não está no DTO não vaza para outro módulo, nem para os logs dele, nem para o cache dele.
:::

::: porque Por que dinheiro em centavos (`long`) no contrato
Dentro do módulo, `Dinheiro` (sobre `decimal`). No contrato entre módulos, um tipo primitivo sem ambiguidade: `long` em centavos não tem casas decimais para alguém arredondar diferente nem separador para alguém serializar diferente. É a mesma convenção dos eventos no Kafka (módulo 6).
:::

## A camada 1: o `.csproj`

O compilador só deixa usar o que está referenciado. Simulação referencia `Clientes.Contracts`; se alguém escrever `using CreditFlow.Modules.Clientes.Domain;`, não compila. Mas ninguém impede de mudar o `.csproj`. Por isso:

## A camada 2: testes de arquitetura

O projeto [`CreditFlow.ArchitectureTests`](https://github.com/JandersonSR/lending-plataform/blob/main/tests/CreditFlow.ArchitectureTests/FronteirasTests.cs) referencia o Host (o que traz todos os módulos para a pasta de saída) e verifica as regras de dois jeitos.

**Lendo os `.csproj`:**

```csharp
[Fact]
public void Csproj_de_modulo_so_referencia_BuildingBlocks_e_Contracts()
{
    foreach (var csproj in Solucao.CsprojsDeModulos())
        foreach (var referencia in Solucao.ReferenciasDeProjeto(csproj.FullName))
        {
            var permitida = referencia == "CreditFlow.BuildingBlocks"
                || (!ehContrato && referencia.StartsWith("CreditFlow.Modules.") && referencia.EndsWith(".Contracts"));
            if (!permitida) violacoes.Add($"{projeto} → {referencia}");
        }
}
```

**Lendo o código compilado, com NetArchTest:**

```csharp
[Theory]
[MemberData(nameof(Modulos))]
public void Domain_nao_depende_de_infraestrutura_nem_de_framework(string modulo)
{
    var resultado = Types.InAssembly(Solucao.AssemblyDoModulo(modulo))
        .That().ResideInNamespace($"CreditFlow.Modules.{modulo}.Domain")
        .ShouldNot().HaveDependencyOnAny("Microsoft.EntityFrameworkCore", "MongoDB", "Confluent.Kafka",
                                         "Microsoft.AspNetCore", /* ... */ $"CreditFlow.Modules.{modulo}.Infrastructure")
        .GetResult();
    Assert.True(resultado.IsSuccessful, Falhas(resultado));
}
```

::: conceito NetArchTest
Uma biblioteca que lê o IL (o código intermediário que o compilador gera) com o Mono.Cecil e responde perguntas como "algum tipo deste namespace usa algum tipo daquele?". A API é fluente: selecione tipos (`Types.InAssembly`, `That().ResideInNamespace`), declare a regra (`ShouldNot().HaveDependencyOnAny`) e peça o resultado (`GetResult()`, com `FailingTypeNames`).
:::

::: porque Por que as duas camadas
Elas pegam coisas diferentes.

- **O `.csproj`** pega a referência que existe mas ainda não é usada. O compilador **remove** do assembly final referências a projetos que nenhum código usa, então o NetArchTest não as veria. Mas uma referência proibida no `.csproj` é um convite: o próximo `using` compila.
- **O IL** pega dependência que chegou por outro caminho: um pacote NuGet que traz o EF Core transitivamente, ou um `using Microsoft.AspNetCore.Http` no domínio para usar `StatusCodes`. O `.csproj` do módulo pode até estar certo e o domínio estar contaminado.
:::

Os módulos não são listados à mão: o teste descobre as DLLs `CreditFlow.Modules.*.dll` na pasta de saída. Módulo novo entra nas regras sozinho. E um teste guarda o próprio teste:

```csharp
[Fact]
public void A_solucao_tem_os_modulos_esperados()
{
    Assert.Contains("Clientes", Solucao.Modulos);
    Assert.Contains("Simulacao", Solucao.Modulos);
}
```

::: previsao
Sem esse teste, o que aconteceria se alguém renomeasse as DLLs para `CF.Modules.*.dll`?
???
`Solucao.Modulos` voltaria vazio, todos os `[Theory]` rodariam com **zero casos** e o relatório mostraria tudo verde. É o pior tipo de teste: o que passa por não testar nada. O teste "sentinela" falha e avisa que a descoberta parou de funcionar.
:::

## As regras do CreditFlow

| Regra | Pega |
|---|---|
| Módulo só referencia BuildingBlocks e `*.Contracts` | Atalho para dentro de outro módulo |
| Contracts só referencia BuildingBlocks | Contrato que vaza tipo interno |
| Módulo não usa `Domain/Application/Infrastructure/Api` de outro | Uso indireto (via reflexão, via pacote) |
| Domain sem EF Core, Mongo, Kafka, ASP.NET, HTTP, OpenTelemetry, e sem Application/Infrastructure/Api do próprio módulo | Domínio contaminado por detalhe técnico |
| Application sem EF Core, Mongo, Redis, Kafka e sem Infrastructure | Caso de uso amarrado a uma tecnologia |
| BuildingBlocks não conhece módulo | Dependência circular |

::: quebra Lab: fure a fronteira e veja quem pega
1. No `.csproj` de Simulação, troque a referência a `Clientes.Contracts` pela de `CreditFlow.Modules.Clientes`. Não mude nenhum `.cs`. Rode `dotnet test tests/CreditFlow.ArchitectureTests`.
2. Desfaça. Agora, em `Domain/ValoresDaSimulacao.cs`, use `Microsoft.AspNetCore.Http.StatusCodes.Status400BadRequest` em qualquer lugar. Rode de novo.
3. Desfaça. Em `Application/CasosDeUso.cs`, troque o tipo do parâmetro `repositorio` por `SimulacaoRepositorioEmMemoria`. Rode de novo.

Para cada um: qual teste falhou e qual mensagem apareceu?
:::

::: solucao
1. Falha **`Csproj_de_modulo_so_referencia_BuildingBlocks_e_Contracts`** com `CreditFlow.Modules.Simulacao → CreditFlow.Modules.Clientes`. O NetArchTest **não** pega, porque nada usa o tipo e o compilador descartou a referência.
2. Falha **`Domain_nao_depende_de_infraestrutura_nem_de_framework(Simulacao)`** listando o tipo do domínio que usou `StatusCodes`. O `.csproj` estava certo (o módulo referencia o framework ASP.NET para a camada Api), por isso só o IL pega.
3. Falha **`Application_nao_depende_de_infraestrutura_concreta(Simulacao)`**: o caso de uso passou a depender da implementação em memória, e trocar por MongoDB no módulo 4 exigiria mexer no caso de uso.

Repare que nenhum dos três quebrou a compilação. Sem os testes, os três chegariam à branch principal.
:::

::: armadilha O que os testes não pegam
SQL escrito à mão lendo o schema de outro módulo (`SELECT * FROM propostas.propostas` dentro de Clientes) é uma string: nenhum teste de dependência vê. A defesa ali é de banco (um usuário por módulo, sem permissão no schema dos outros) e de revisão. Visto em [Plataforma, lição 1.2](../../../plataforma-dotnet/docs/modulo-01/02-anatomia-do-projeto.md).
:::

## `InternalsVisibleTo`: testes que veem por dentro

Os repositórios em memória e as implementações dos contratos são `internal`. O teste do módulo enxerga porque o `.csproj` declara:

```xml
<InternalsVisibleTo Include="CreditFlow.Modules.Simulacao.Tests" />
```

`internal` é o `export` que não existe em C#: visível no assembly, invisível fora. É mais uma camada de fronteira: mesmo que alguém referenciasse o projeto de outro módulo, os tipos internos continuariam fora de alcance.

## Perguntas para responder sem olhar

::: pergunta
Por que o teste de arquitetura lê os `.csproj` além do IL?
???
Porque o compilador remove do assembly referências a projetos não usados. Uma referência proibida que ainda não tem uso só aparece no `.csproj`.
:::

::: pergunta
Para que serve o teste `A_solucao_tem_os_modulos_esperados`?
???
É a sentinela da descoberta: se as DLLs deixarem de ser encontradas, os testes parametrizados rodariam vazios e passariam. Ele falha nesse caso.
:::

**Próxima:** [1.5 O ambiente local](05-ambiente-local.md).
