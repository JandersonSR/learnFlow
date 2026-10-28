# 1.7 Desafio: o módulo Parceiros

Hora de juntar as lições 1.1 a 1.6 sem roteiro. Você vai criar um segundo módulo no [aks-step-by-step](https://github.com/JandersonSR/aks-step-by-step), com regra de negócio de verdade, e ligar o módulo Cep a ele sem furar a fronteira.

Trabalhe num branch seu (`git switch -c desafio/modulo-parceiros`). Cada critério de aceite pode virar um commit.

::: desafio O problema de negócio
A API de CEP passa a ser vendida para parceiros, em planos:

| Plano | Consultas por dia |
|---|---|
| Básico | 1.000 |
| Profissional | 50.000 |

Regras:

1. Um parceiro é cadastrado com nome e plano, e começa **ativo**.
2. Cada consulta de CEP de um parceiro **consome uma unidade da cota do dia**. Consulta recusada por cota não consome.
3. Com a cota esgotada, a consulta é **recusada** até o dia seguinte. O dia é o de Brasília, não o UTC.
4. Parceiro **inativo** não consulta.
5. Quando a cota de um parceiro acaba, o sistema registra o evento `CotaEsgotada` (o comercial vai querer saber).
6. O parceiro se identifica pelo cabeçalho `X-Parceiro-Id`. Autenticação de verdade fica para o módulo 8; aqui o foco é o domínio.
:::

## Critérios de aceite

- [ ] Projeto `Agx.Modules.Parceiros` com schema `parceiros` e `DbContext` próprio
- [ ] Projeto `Agx.Parceiros.Contratos` com a interface `IControleDeCota` e nada além do necessário
- [ ] O módulo Cep referencia **só** o projeto de contratos do Parceiros (confira no `.csproj`)
- [ ] `POST /v1/parceiros` cadastra e devolve 201 com o `id`; `GET /v1/parceiros/{id}` mostra plano e consultas do dia
- [ ] Sem `X-Parceiro-Id` ou com um id inexistente, a consulta de CEP é recusada com `application/problem+json` e código próprio
- [ ] Cota esgotada recusa a consulta com código `2102`
- [ ] Testes de unidade do agregado cobrindo: consumo normal, cota esgotada, virada do dia, parceiro inativo, evento emitido exatamente uma vez
- [ ] O teste de superfície pública da lição 1.2 existe também para o módulo Parceiros
- [ ] Duas consultas simultâneas com 1 unidade restante: só uma passa (concorrência otimista, lição 1.4)
- [ ] `docker compose up --build` continua funcionando

## Dicas em níveis

Tente pelo menos uma hora antes de abrir a primeira. Travar e destravar sozinho é o que fixa.

::: dica Dica 1: por onde começar
Comece pelo **domínio**, sem banco nem HTTP: `Parceiro`, `Plano`, `ParceiroId` e `CotaEsgotada` numa pasta `Dominio/`, com os testes de unidade. Só quando os testes passarem, pense em EF Core e endpoints. Se o agregado precisa de banco para ser testado, ele está acoplado demais.
:::

::: dica Dica 2: o esqueleto dos projetos
```text
src/
  Agx.Parceiros.Contratos/        IControleDeCota (referencia só o SharedKernel)
  Modules/Agx.Modules.Parceiros/
    ParceirosModulo.cs            implementa IModuloComBanco
    ParceirosErros.cs             faixa 2100 para negócio, 1100 para validação
    Dominio/                      Parceiro, Plano, ParceiroId, CotaEsgotada
    Data/ParceirosDbContext.cs    schema "parceiros"
    Features/Cadastrar/           endpoint + handler
    Features/Obter/
    ControleDeCota.cs             internal, implementa IControleDeCota
```

E no host: `IModulo[] modulos = [new CepModulo(), new ParceirosModulo()];`
:::

::: dica Dica 3: onde o Cep chama a cota
No `ConsultarCepEndpoint`, antes de chamar o handler: ler o cabeçalho, chamar `IControleDeCota.ConsumirAsync` e, se falhar, devolver `resultado.Erro.ParaProblema()`.

Pense bem na ordem: a cota deve ser consumida **antes** ou **depois** de saber se o CEP existe? A regra 2 fala em "consulta recusada por cota". E um CEP inexistente, consome?
:::

::: dica Dica 4: o dia de Brasília
O contêiner roda em UTC. `DateTime.Today` dentro dele vira o dia às 21h de Brasília. Converta a partir do `TimeProvider`:

```csharp
private static readonly TimeZoneInfo Brasilia = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");
var hoje = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(relogio.GetUtcNow(), Brasilia).DateTime);
```

A imagem do projeto é a `noble-chiseled-extra`, que inclui a base de fusos (`tzdata`). Na `chiseled` sem `-extra`, essa linha lança `TimeZoneNotFoundException`.
:::

::: dica Dica 5: o Docker que esqueceram
Rodou local, falhou no `docker compose up --build`? Abra o `Dockerfile`: ele copia os `.csproj` **um por um** antes do `restore`, para aproveitar o cache das camadas. Projeto novo precisa de linha nova ali.
:::

## Solução comentada

Abra só depois de terminar, ou depois de muito tempo travado. Compare com a sua e, para cada diferença, decida qual é melhor e por quê.

::: solucao O agregado
```csharp
using Agx.SharedKernel;

namespace Agx.Modules.Parceiros.Dominio;

public readonly record struct ParceiroId(Guid Valor)
{
    public static ParceiroId Novo() => new(Guid.CreateVersion7());
}

/// <summary>Evento de domínio: aconteceu algo que outros podem querer saber.</summary>
public sealed record CotaEsgotada(ParceiroId Parceiro, DateOnly Dia, int Limite);

/// <summary>Objeto de valor: dois planos com os mesmos dados são o mesmo plano.</summary>
public sealed record Plano(string Nome, int LimiteDiario)
{
    public static readonly Plano Basico = new("Básico", 1_000);
    public static readonly Plano Profissional = new("Profissional", 50_000);
}

/// <summary>
/// Raiz do agregado: toda mudança na cota passa por aqui, e a regra
/// "não consultar além da cota do plano" é verificada num lugar só.
/// </summary>
public sealed class Parceiro
{
    private readonly List<object> _eventos = [];

    public ParceiroId Id { get; private set; }
    public string Nome { get; private set; } = "";
    public Plano Plano { get; private set; } = null!; // preenchido em Cadastrar ou pelo EF Core
    public bool Ativo { get; private set; }
    public DateOnly DiaDaCota { get; private set; }
    public int ConsultasNoDia { get; private set; }

    public IReadOnlyList<object> Eventos => _eventos;

    private Parceiro() { } // para o EF Core

    public static Resultado<Parceiro> Cadastrar(string nome, Plano plano)
    {
        if (string.IsNullOrWhiteSpace(nome))
            return Erro.Validacao(1101, "Nome do parceiro é obrigatório");
        return new Parceiro { Id = ParceiroId.Novo(), Nome = nome.Trim(), Plano = plano, Ativo = true };
    }

    /// <summary>Tenta consumir uma consulta da cota do dia.</summary>
    public Resultado<int> RegistrarConsulta(DateOnly hoje)
    {
        if (!Ativo)
            return Erro.RegraDeNegocio(2101, "Parceiro inativo");

        if (hoje != DiaDaCota)
        {
            DiaDaCota = hoje;      // virou o dia: a cota recomeça
            ConsultasNoDia = 0;
        }

        if (ConsultasNoDia >= Plano.LimiteDiario)
            return Erro.RegraDeNegocio(2102, "Cota diária esgotada", $"Limite do plano: {Plano.LimiteDiario} consultas por dia.");

        ConsultasNoDia++;
        if (ConsultasNoDia == Plano.LimiteDiario)
            _eventos.Add(new CotaEsgotada(Id, hoje, Plano.LimiteDiario));

        return Plano.LimiteDiario - ConsultasNoDia; // quanto ainda resta
    }

    public void TrocarPlano(Plano novo) => Plano = novo; // a cota usada no dia é mantida

    public void Desativar() => Ativo = false;
}
```

Pontos para comparar com a sua:

- **`Guid.CreateVersion7()`** (.NET 9+): ids ordenados pelo tempo, melhores para índice de banco que o `Guid.NewGuid()` aleatório.
- **O evento sai uma vez só**, porque a condição é `==` e a consulta recusada não incrementa. Se você usou `>=`, o teste "evento emitido exatamente uma vez" deveria ter pegado.
- **`TrocarPlano` não zera a cota do dia.** Foi uma decisão: quem sobe de plano no meio do dia continua com o que já usou. Se a sua zera, qual regra de negócio você assumiu? Pergunte ao "PO" (você mesmo, num ADR de duas linhas).
:::

::: solucao A implementação do contrato, com concorrência
```csharp
// Agx.Parceiros.Contratos
public interface IControleDeCota
{
    /// <summary>Consome uma consulta da cota do dia. Devolve quanto resta.</summary>
    Task<Resultado<int>> ConsumirAsync(Guid parceiroId, CancellationToken ct);
}

// Agx.Modules.Parceiros (internal)
internal sealed class ControleDeCota(ParceirosDbContext db, TimeProvider relogio) : IControleDeCota
{
    private static readonly TimeZoneInfo Brasilia = TimeZoneInfo.FindSystemTimeZoneById("America/Sao_Paulo");

    public async Task<Resultado<int>> ConsumirAsync(Guid parceiroId, CancellationToken ct)
    {
        for (var tentativa = 1; ; tentativa++)
        {
            var parceiro = await db.Parceiros.FindAsync([new ParceiroId(parceiroId)], ct);
            if (parceiro is null)
                return ParceirosErros.NaoEncontrado;

            var hoje = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(relogio.GetUtcNow(), Brasilia).DateTime);
            var resultado = parceiro.RegistrarConsulta(hoje);
            if (!resultado.Sucesso)
                return resultado;

            try
            {
                await db.SaveChangesAsync(ct);
                return resultado;
            }
            catch (DbUpdateConcurrencyException) when (tentativa < 3)
            {
                db.ChangeTracker.Clear(); // outro pod salvou antes: relê e decide de novo
            }
        }
    }
}
```

E o mapeamento no `ParceirosDbContext`:

```csharp
modelBuilder.HasDefaultSchema("parceiros");
modelBuilder.Entity<Parceiro>(e =>
{
    e.ToTable("Parceiros");
    e.HasKey(x => x.Id);
    e.Property(x => x.Id).HasConversion(id => id.Valor, v => new ParceiroId(v));
    e.Property(x => x.Nome).HasMaxLength(200);
    e.ComplexProperty(x => x.Plano);            // vira as colunas Plano_Nome e Plano_LimiteDiario
    e.Property<uint>("Versao").IsRowVersion();  // no Npgsql, mapeia para a coluna de sistema xmin
    e.Ignore(x => x.Eventos);                   // eventos não são persistidos no agregado
});
```

Pontos para comparar:

- **Três tentativas e depois exceção.** Se três pods disputarem o mesmo parceiro três vezes seguidas, algo está muito errado, e um 500 com log é a resposta honesta.
- **A cota é consumida antes de consultar o CEP**, e não é devolvida se o CEP não existir. É uma escolha de negócio (a consulta foi feita). A outra também é defensável; o importante é estar escrita.
- **Os eventos do agregado** ainda não são publicados. Publicar no Kafka sem perder nenhum, mesmo se o pod cair entre o `SaveChanges` e a publicação, é o padrão **outbox**, assunto do módulo 5.
:::

::: entrevista Defenda o status code
Você usou o `Erro.RegraDeNegocio` para cota esgotada, e o projeto traduz isso para **422**. Um revisor diz que o certo é **429**. Quem tem razão?
???
Os dois são defensáveis, e a resposta de sênior mostra o critério. O 429 (*Too Many Requests*) é o status que clientes HTTP e bibliotecas de retry já entendem como "espere e tente depois", e permite mandar `Retry-After` com o tempo até a virada do dia. O 422 diz "regra de negócio violada", que também é verdade, mas nenhum cliente sabe que deve esperar.

Para cota, o 429 com `Retry-After` costuma ser melhor para quem integra. Para fazer isso sem colocar HTTP no domínio: um `TipoDeErro.LimiteExcedido` novo, traduzido para 429 no `ResultadoHttpExtensions`, mantendo o código `2102` no corpo.
:::

## Depois do desafio

1. Rode o teste de superfície pública dos dois módulos e confirme que o Cep não referencia `Agx.Modules.Parceiros`.
2. Apresente o módulo para o time em 20 minutos: o problema, o agregado, a concorrência e a decisão do status code.
3. Abra um PR no seu fork e peça para alguém revisar com a lista de critérios acima.

**Próxima:** [Perguntas de entrevista do módulo](perguntas-de-entrevista.md).
