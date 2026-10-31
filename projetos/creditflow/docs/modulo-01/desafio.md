# Desafio do módulo 1: o módulo Ofertas

Hora de juntar as lições 1.1 a 1.6 sem roteiro. Trabalhe num branch (`git switch -c desafio/modulo-ofertas`).

::: desafio O problema
O marketing quer mostrar ofertas pré-aprovadas para clientes que **consentiram em receber ofertas por e-mail**. Uma oferta é: cliente, valor máximo, prazo máximo e validade de 15 dias. A regra para gerar a oferta é simples por enquanto: valor máximo = 3× a renda mensal, limitado a R$ 50.000; prazo máximo = 48 meses; só para score ≥ 650.

Crie o módulo **Ofertas**, do zero:

1. `CreditFlow.Modules.Ofertas` e `CreditFlow.Modules.Ofertas.Contracts` na solução, seguindo as convenções de pasta e nome.
2. `POST /v1/ofertas/{clienteId}` gera a oferta (ou recusa com um erro de regra e código estável); `GET /v1/ofertas/{id}` devolve.
3. Ofertas lê o cliente **só** por `IConsultaDeClientes`. Se o contrato atual não tiver o que você precisa (o consentimento de ofertas, por exemplo), **mude o contrato**, não fure a fronteira, e explique a mudança no pull request.
4. Um perfil novo funciona: `CREDITFLOW__MODULOS=Ofertas` sobe só Ofertas e consegue consultar Clientes.
:::

## Critérios de aceite

- [ ] `dotnet test` verde, **inclusive** os testes de arquitetura, que passam a cobrir Ofertas sem você editá-los
- [ ] Um teste de unidade para cada regra (renda, teto, score, consentimento de ofertas)
- [ ] Erros em ProblemDetails com `code` `ofertas.*`; o OpenAPI do endpoint declara 201, 404 e 422
- [ ] `CREDITFLOW__MODULOS=Ofertas` sobe e o `/scalar` mostra só os endpoints de Ofertas
- [ ] `CREDITFLOW__MODULOS=Ofertas,Cobranca` **não** sobe, com mensagem clara
- [ ] O DTO público não expõe CPF nem nome
- [ ] Um parágrafo no README do módulo: por que o consentimento de ofertas é diferente do de análise de crédito (LGPD, finalidade)

::: dica Dica 1: por onde começar
Pelo domínio, sem HTTP nem DI: `Oferta`, `OfertaId`, a regra de geração e os testes. Depois o `OfertasModule`, depois o endpoint. Se o agregado precisa do contêiner de DI para ser testado, ele está acoplado demais.
:::

::: dica Dica 2: o contrato de Clientes
O `PerfilDeCreditoDto` tem só o consentimento de análise de crédito. Acrescentar um campo opcional no fim de um record posicional quebra quem constrói o DTO pelo construtor (o próprio Clientes), mas não quem só lê. Discuta no PR: campo novo no DTO existente ou um método novo no contrato?
:::

::: dica Dica 3: o teste de perfil
`PerfilDeExecucao.Ler` recebe um `IConfiguration`. Em teste, monte um com `new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["CreditFlow:Modulos"] = "Ofertas,Cobranca" }).Build()` e use `Assert.Throws<InvalidOperationException>`.
:::

::: solucao Um desenho possível
```text
src/Modules/Ofertas/
  CreditFlow.Modules.Ofertas.Contracts/   IConsultaDeOfertas (se alguém precisar), OfertaDto
  CreditFlow.Modules.Ofertas/
    OfertasModule.cs        IModule (sem IModuloComContratos enquanto ninguém consultar Ofertas)
    Domain/Oferta.cs        Gerar(perfil, agora) → Result<Oferta>; Validade = 15 dias
    Domain/OfertasErros.cs  ofertas.score_insuficiente, ofertas.sem_consentimento, ofertas.cliente_nao_encontrado
    Application/GerarOferta.cs, IOfertaRepositorio.cs
    Infrastructure/Memoria/OfertaRepositorioEmMemoria.cs
    Api/OfertasEndpoints.cs (RequireAuthorization: oferta é de um cliente identificado)
```

No contrato de Clientes, a mudança mais honesta é um método novo, `ObterPreferenciasDeContatoAsync`, em vez de engordar o `PerfilDeCreditoDto`: são finalidades diferentes, e um módulo que só decide crédito não deveria nem receber a preferência de marketing. O custo é mais uma ida ao repositório.

O teto: `Math.Min(renda × 3, 50_000)`, em `Dinheiro`. Score e consentimento são regras do domínio de Ofertas, não de Clientes: Clientes informa os fatos, Ofertas decide.
:::

**Depois:** [Perguntas de entrevista](perguntas-de-entrevista.md).
