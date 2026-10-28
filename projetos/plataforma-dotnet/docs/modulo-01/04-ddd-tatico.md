# 1.4 DDD tático: objeto de valor, entidade e agregado no código

Os padrões táticos são ferramentas para um problema específico: **manter regras de negócio corretas num lugar só**, mesmo com muita gente mexendo no código. Cada um responde a uma pergunta. Se você não tem a pergunta, não precisa do padrão.

| Padrão | A pergunta que ele responde |
|---|---|
| **Objeto de valor** | "Como garantir que um dado está sempre válido, sem validar em todo lugar?" |
| **Entidade** | "Como acompanhar algo que muda ao longo do tempo e continua sendo a mesma coisa?" |
| **Agregado** | "Quem garante uma regra que envolve vários dados que mudam juntos?" |
| **Evento de domínio** | "Como avisar que algo importante aconteceu, sem o código que avisa conhecer quem reage?" |
| **Repositório** | "Como buscar e salvar um agregado inteiro sem a regra conhecer o banco?" |

## Objeto de valor: o CEP que nunca é inválido

Hoje, no módulo, o CEP é uma `string`. Ele é validado pelo `ConsultarCepValidator` na entrada, e depois circula como `string` por handler, cache, banco e evento. Nada impede alguém, daqui a seis meses, de chamar o handler com `"123"` num job novo que não passa pelo validador.

::: conceito Objeto de valor
Um tipo definido **pelo que contém**, não por uma identidade. Dois CEPs `01001000` são o mesmo CEP; não existe "o CEP número 7". É imutável e válido por construção: se você tem um, ele está certo.
:::

```csharp
using Agx.SharedKernel;

namespace Agx.Modules.Cep.Dominio;

/// <summary>CEP válido por construção: se existe um Cep, ele tem 8 dígitos.</summary>
public readonly record struct Cep
{
    public string Valor { get; }

    private Cep(string valor) => Valor = valor;

    public static Resultado<Cep> Criar(string? texto)
    {
        var digitos = (texto ?? "").Replace("-", "", StringComparison.Ordinal).Trim();
        if (digitos.Length != 8 || !digitos.All(char.IsAsciiDigit))
            return Erro.Validacao(1001, "CEP inválido", "O CEP deve ter 8 dígitos, com ou sem hífen.");
        return new Cep(digitos);
    }

    /// <summary>Só para dados que já foram validados ao entrar (banco, por exemplo).</summary>
    internal static Cep Reconstituir(string valor) => new(valor);

    public string Formatado => $"{Valor[..5]}-{Valor[5..]}";

    public override string ToString() => Valor;
}
```

::: porque Cada escolha desse código
- **Construtor privado + `Criar`**: a única porta de entrada valida. Não dá para criar um `Cep` inválido pelo caminho normal.
- **`Criar` devolve `Resultado<Cep>`, não lança exceção**: CEP digitado errado é previsto, não excepcional (lição 1.5).
- **`record`**: igualdade por valor de graça. `Cep.Criar("01001000").Valor == Cep.Criar("01001-000").Valor` é `true`.
- **`readonly record struct` e não `record class`**: um CEP é pequeno e criado a cada requisição; como struct, não aloca no heap. O custo dessa escolha está no bloco "Cuidado" logo abaixo.
- **`Reconstituir` interno**: o banco só tem CEPs que já passaram por `Criar`. Validar de novo a cada leitura seria desperdício, e falhar na leitura de um dado antigo seria pior.
:::

::: previsao
Com o código acima, o que esta linha imprime?

```csharp
var vazio = new Cep();
Console.WriteLine(vazio.Valor is null ? "Valor nulo" : vazio.Valor);
```

Compila? Se compilar, o objeto de valor cumpre a promessa de "nunca inválido"?
???
**Compila e imprime `Valor nulo`.** Toda `struct` tem um construtor sem parâmetros implícito e público, que zera os campos. O construtor privado não impede `new Cep()` nem `default(Cep)`.

A promessa "válido por construção" tem um furo com `struct`. As saídas:

1. **Usar `sealed record` (classe).** Aí `new Cep()` não compila. Custo: uma alocação por CEP, irrelevante na maioria das APIs.
2. **Manter a `struct`** e aceitar o furo, com um analisador ou revisão de código que proíba `default(Cep)`.

Para a maioria dos casos, a opção 1 é a mais segura. A `struct` só se paga em código muito quente (milhões de criações por segundo). Este é o tipo de trade-off que se espera ver num ADR de sênior.
:::

### Para o EF Core gravar um objeto de valor

```csharp
modelBuilder.Entity<EnderecoCache>(e =>
{
    e.Property(x => x.Cep)
        .HasConversion(cep => cep.Valor, texto => Cep.Reconstituir(texto))
        .HasMaxLength(8).IsFixedLength();
});
```

A conversão mostra ao EF como ir e voltar entre o tipo do domínio e a coluna. O banco continua com `char(8)`.

## Entidade: identidade que sobrevive à mudança

::: conceito Entidade
Algo com **identidade própria**, que continua sendo o mesmo mesmo quando todos os outros dados mudam. Um parceiro que troca de nome, de plano e de endereço continua sendo o mesmo parceiro: o que o define é o `Id`.
:::

| | Objeto de valor | Entidade |
|---|---|---|
| Igualdade | Pelos dados | Pelo `Id` |
| Muda? | Não: troca-se por outro | Sim, ao longo da vida |
| Exemplos | `Cep`, `Plano`, `Dinheiro`, `Periodo` | `Parceiro`, `Proposta`, `Pedido` |

::: armadilha
Um sinal de modelagem fraca é ter **tudo** como entidade com `Id`, até endereço e valor monetário. Pergunta de controle: "se dois desses tiverem os mesmos dados, são a mesma coisa?" Se sim, é objeto de valor.
:::

## Agregado: quem guarda a regra

O módulo Parceiros (desafio da lição 1.7) tem uma regra de negócio real: **cada parceiro pode fazer até N consultas por dia, conforme o plano contratado**. Quando a cota acaba, as consultas são recusadas até o dia seguinte.

Onde mora essa regra?

- Se ela ficar no endpoint, um job em lote que consulta CEPs passa por fora.
- Se ficar num `ParceiroService`, nada impede outro service de fazer `parceiro.ConsultasNoDia++` direto.

::: conceito Agregado
Um grupo de objetos que muda junto, com **uma raiz** que é a única porta de entrada. Quem está de fora só chama métodos da raiz, e a raiz garante que as regras (invariantes) continuam verdadeiras depois de cada chamada.

Na prática: propriedades com `private set` e métodos com nome de negócio (`RegistrarConsulta`, `TrocarPlano`, `Desativar`) em vez de setters públicos.
:::

```csharp
public sealed class Parceiro
{
    public ParceiroId Id { get; private set; }
    public Plano Plano { get; private set; } = null!; // preenchido em Cadastrar ou pelo EF Core
    public bool Ativo { get; private set; }
    public DateOnly DiaDaCota { get; private set; }
    public int ConsultasNoDia { get; private set; }

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
            return Erro.RegraDeNegocio(2102, "Cota diária esgotada");

        ConsultasNoDia++;
        return Plano.LimiteDiario - ConsultasNoDia; // quanto ainda resta
    }
}
```

::: porque
A regra "não passar da cota" está **num método só**. Não importa se a consulta vem da API, de um job ou de um teste: todos passam por `RegistrarConsulta`. E `ConsultasNoDia` com `private set` faz o compilador recusar qualquer `parceiro.ConsultasNoDia++` de fora.

O dia vem por parâmetro (`DateOnly hoje`) em vez de `DateTime.Today` dentro do método: o agregado fica determinístico, e o teste de "virou o dia" é uma linha, sem esperar a meia-noite.
:::

::: armadilha Agregado grande demais
Agregado não é "a entidade e tudo que está ligado a ela". Se `Parceiro` carregar a lista de todas as consultas já feitas, cada `RegistrarConsulta` vai ler milhares de linhas. O agregado contém só o necessário **para garantir a regra**: aqui, o contador do dia, não o histórico. O histórico, se alguém precisar, é outro modelo (relatório, evento no Kafka).
:::

## Evento de domínio

Quando a cota de um parceiro acaba, o comercial quer saber para oferecer um plano maior. O agregado não deve conhecer e-mail, Slack nem CRM. Ele registra **o que aconteceu**, e quem quiser reage:

```csharp
public sealed record CotaEsgotada(ParceiroId Parceiro, DateOnly Dia, int Limite);

// dentro de RegistrarConsulta, depois do ConsultasNoDia++:
if (ConsultasNoDia == Plano.LimiteDiario)
    _eventos.Add(new CotaEsgotada(Id, hoje, Plano.LimiteDiario));
```

Depois de salvar o agregado, o handler pega `parceiro.Eventos` e publica (em memória para outro módulo, ou no Kafka para outro sistema). A lição 1.6 trata de como publicar sem perder evento.

## Vídeos

::: video DDD in .NET Apps: Entities and Value Objects (Codewrinkles, em inglês)
https://www.youtube.com/watch?v=yFPuLp8QX1g
Entidade e objeto de valor em C#, com as decisões de implementação.
:::

::: video What makes an Aggregate (DDD)? Hint: it's NOT hierarchy & relationships (CodeOpinion, em inglês)
https://www.youtube.com/watch?v=djq0293b2bA
O erro mais comum com agregados: desenhá-los pelo diagrama de tabelas em vez de pelas regras.
:::

## Lab de quebra: a regra furada pela concorrência

::: quebra
O `Parceiro` acima está correto para uma requisição de cada vez. A API roda com 2 a 8 pods. Um parceiro com cota de 1.000 está em 999 consultas e manda **duas requisições ao mesmo tempo**, que caem em pods diferentes.

Cada pod carrega o parceiro do banco, chama `RegistrarConsulta` e salva. Quantas consultas o parceiro termina tendo feito? A regra foi respeitada?
:::

::: dica Dica 1
Os dois pods leem `ConsultasNoDia = 999` antes de qualquer um salvar.
:::

::: dica Dica 2
Pesquise "optimistic concurrency EF Core" e a coluna de sistema `xmin` do PostgreSQL.
:::

::: solucao
Os dois pods leem 999, os dois veem que cabe, os dois gravam 1.000. O parceiro fez **1.001 consultas** e o banco diz 1.000. A regra está certa no código e furada em produção: o agregado garante a regra **dentro de uma instância em memória**, não entre processos.

Defesa padrão: **concorrência otimista**. O EF Core grava com `WHERE versao = <a que eu li>`; se outro pod salvou antes, a versão mudou, nenhuma linha é atualizada e o EF lança `DbUpdateConcurrencyException`. O handler recarrega o parceiro e tenta de novo, e na segunda tentativa a regra recusa.

No PostgreSQL com Npgsql, dá para usar a coluna de sistema `xmin` como versão:

```csharp
modelBuilder.Entity<Parceiro>().Property<uint>("Versao").IsRowVersion().HasColumnName("xmin");
```

Para cota com volume alto, outra saída é tirar o contador do agregado e usar um comando atômico (`UPDATE ... SET consultas = consultas + 1 WHERE consultas < limite`), como o projeto já faz com o ranking no `RegistradorDeConsultas`. A escolha entre os dois é um bom tema de ADR.
:::

## Perguntas para responder sem olhar

::: pergunta
Qual a diferença entre entidade e objeto de valor? Dê um exemplo de cada no módulo Parceiros.
???
Entidade tem identidade que sobrevive à mudança dos dados (igualdade por `Id`): `Parceiro`. Objeto de valor é definido pelos dados, é imutável e trocado inteiro (igualdade por valor): `Plano`, `ParceiroId`, `Cep`.
:::

::: pergunta
Por que `RegistrarConsulta` recebe o dia por parâmetro em vez de ler o relógio?
???
Para o agregado ser determinístico e testável: o teste passa qualquer data e verifica a virada do dia sem depender do horário em que roda. O relógio fica na borda (no projeto, `TimeProvider`).
:::

::: pergunta
O agregado garante a regra da cota com duas réplicas da API? O que falta?
???
Não sozinho. Ele garante dentro de um processo. Entre processos, falta controle de concorrência no banco: versão com concorrência otimista (`xmin` no PostgreSQL) e nova tentativa no conflito, ou um `UPDATE` atômico com a condição na cláusula `WHERE`.
:::

**Próxima:** [1.5 Erros previstos sem exceção](05-erros-e-resultado.md).
