# 4.2 EF Core por módulo: o `DbContext` de Propostas

Abra o [`PropostasDbContext.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Propostas/CreditFlow.Modules.Propostas/Infrastructure/Persistencia/PropostasDbContext.cs) e o [`001_schema_propostas.sql`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Propostas/CreditFlow.Modules.Propostas/Infrastructure/Persistencia/Sql/001_schema_propostas.sql) lado a lado. Os dois dizem a mesma coisa em linguagens diferentes, e essa lição é sobre como mantê-los dizendo.

::: dica Se o `DbContext` for novidade
O que é um `DbContext`, `EnableRetryOnFailure`, por que `DateTimeOffset` e UTC: está na [lição 3.1 do curso Plataforma .NET](../../../plataforma-dotnet/docs/modulo-03/01-postgres-e-dbcontext.md). Aqui partimos de lá. Em Node, o paralelo mais próximo é um `PrismaClient` com o schema dentro dele, mas o EF Core rastreia as entidades carregadas e gera o `UPDATE` só com o que mudou.
:::

## Um banco, vários schemas, um `DbContext` por módulo

```csharp
internal sealed class PropostasDbContext(DbContextOptions<PropostasDbContext> options) : DbContext(options)
{
    public const string Schema = "propostas";
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        // ...
```

```mermaid
flowchart LR
    subgraph db[(PostgreSQL: banco creditflow)]
        c[schema clientes]
        p[schema propostas]
        g[schema pagamentos]
    end
    CD[ClientesDbContext] --> c
    PD[PropostasDbContext] --> p
    GD[PagamentosDbContext] --> g
    PD -. "nunca" .-> c
```

::: porque Um schema por módulo, e não um banco por módulo
Um banco por módulo dá isolamento máximo, mas multiplica conexões, backups e custos no Flexible Server, e o CreditFlow é **um** processo (monolito modular). Um schema por módulo dá a fronteira que importa: o `DbContext` de Propostas é `internal`, só mapeia tabelas de `propostas`, e as permissões podem ser separadas por schema se um dia o módulo virar serviço. A regra "nenhum módulo lê o schema de outro" é o que permite essa separação futura sem reescrever nada.
:::

O `internal` é proposital: nenhum outro projeto consegue nem **nomear** o `PropostasDbContext`. Quem quer dado de proposta usa `IConsultaDePropostas`, do `.Contracts`.

## Mapeamento explícito, linha a linha

```csharp
p.Property(x => x.ValorSolicitado).HasColumnName("valor_solicitado").HasPrecision(14, 2)
    .HasConversion(d => d.Valor, v => new Dinheiro(v));
p.Property(x => x.TaxaMensal).HasColumnName("taxa_mensal").HasPrecision(12, 10)
    .HasConversion(t => t.Fracao, v => Percentual.DeFracao(v));
p.Property(x => x.Status).HasColumnName("status").HasConversion<string>().HasMaxLength(20);
```

| Decisão | Por quê |
|---|---|
| `HasColumnName` em snake_case, uma a uma | O EF usaria `"ValorSolicitado"` com aspas. Em SQL à mão, no `psql` e no Grafana, aspas e maiúsculas em todo nome viram atrito. Nome explícito também desacopla: renomear a propriedade C# não vira migração sem querer |
| `HasConversion` para `Dinheiro` e `Percentual` | O domínio fala em value objects; o banco, em `numeric`. A conversão mora no mapeamento, e o domínio não sabe que existe banco |
| `numeric(14,2)` e `numeric(12,10)` | Dinheiro com 2 casas; taxa como fração com 10 (0,0219000000). **Nunca** `double precision` para dinheiro |
| `HasConversion<string>()` no status | O enum vira texto. Gravar como número faria o banco depender da **ordem** do enum: alguém insere `Rascunho` no começo e todas as linhas antigas mudam de significado, sem erro |

::: armadilha `HasPrecision` sem `numeric` explícito
Sem `HasPrecision`, o Npgsql mapeia `decimal` para `numeric` **sem** escala, que aceita qualquer coisa. Funciona, até que alguém grava 1234,567891 num campo de dinheiro e a soma do relatório não bate com a do extrato. A precisão no banco é a última linha de defesa contra um arredondamento esquecido no código.
:::

## O cronograma em `jsonb`

```csharp
p.OwnsMany(x => x.Parcelas, parcela =>
{
    parcela.ToJson("parcelas");
    parcela.Property(x => x.Numero).HasJsonPropertyName("numero");
    parcela.Property(x => x.ValorCentavos).HasJsonPropertyName("valor_centavos");
});
```

O `ToJson` (EF Core 8+, suportado pelo Npgsql) grava a lista de parcelas como **um** valor `jsonb` na linha da proposta: `[{"numero":1,"valor_centavos":95000}, ...]`.

::: porque Por que `jsonb` e não uma tabela `parcelas_previstas`
As parcelas previstas são lidas e gravadas **sempre junto** com a proposta e nunca consultadas sozinhas ("todas as parcelas de R$ 950 de outubro" é pergunta para o módulo Pagamentos, que tem a tabela `pagamentos.parcelas` de verdade, criada no desembolso). Uma tabela aqui seria um `JOIN` em toda leitura para nada. É a mesma lógica do documento no Mongo, dentro do Postgres: o `jsonb` é o "documento embutido" do relacional. E o banco ainda confere a forma:

```sql
CONSTRAINT ck_propostas_parcelas CHECK (jsonb_typeof(parcelas) = 'array' AND jsonb_array_length(parcelas) = prazo_meses)
```
:::

## O schema: SQL revisado, e de onde vem a migração

O CreditFlow segue uma convenção para todos os módulos Postgres:

1. O DDL de cada módulo é um **SQL idempotente** versionado no módulo (`Sql/001_schema_propostas.sql`, `CREATE ... IF NOT EXISTS`), embutido no assembly.
2. Em desenvolvimento, `Propostas:CriarSchemaAoIniciar=true` faz o módulo aplicar o SQL na subida (`InicializadorDoSchemaDePropostas`).
3. Nos ambientes, o **Job de migrações** do chart aplica, antes do deploy, com o usuário de DDL; a aplicação roda com um usuário que só tem DML (módulo 7 e [lição 3.3 do Plataforma .NET](../../../plataforma-dotnet/docs/modulo-03/03-menor-privilegio.md)).
4. Mudança de schema = novo arquivo (`002_...sql`), sempre **compatível com a versão anterior do código** (expand/contract, [lição 3.2 do Plataforma .NET](../../../plataforma-dotnet/docs/modulo-03/02-migracoes.md)).

::: porque SQL à mão, se o EF Core gera migrações?
As migrações do EF são ótimas para **gerar** o SQL; o que vai para produção precisa ser **lido** por alguém. Aqui o SQL é o artefato revisado e o EF é a ferramenta que confere. O trade-off: você precisa manter o SQL e o `OnModelCreating` iguais, e quem garante isso é o lab abaixo (e, no CI, um teste de integração que sobe o Postgres com o SQL e roda o repositório contra ele: se uma coluna faltar, o teste quebra).

A alternativa equivalente, usada no curso Plataforma .NET, é gerar a migração do EF, publicar `dotnet ef migrations script --idempotent` como artefato e revisar **esse** SQL. As duas são defensáveis; o que não é defensável é `Database.Migrate()` na subida de cada pod.
:::

::: checkpoint Conferir que o SQL e o modelo batem
Com o SDK do .NET instalado, gere uma migração descartável e compare:

```bash
dotnet ef migrations add Conferencia -p src/Modules/Propostas/CreditFlow.Modules.Propostas \
  -s src/Host/CreditFlow.Host -c PropostasDbContext -o Infrastructure/Persistencia/Conferencia
dotnet ef migrations script -p src/Modules/Propostas/CreditFlow.Modules.Propostas \
  -s src/Host/CreditFlow.Host -c PropostasDbContext > /tmp/ef.sql
diff <(grep -iE 'create|constraint|index' /tmp/ef.sql) \
     <(grep -iE 'create|constraint|index' src/Modules/Propostas/CreditFlow.Modules.Propostas/Infrastructure/Persistencia/Sql/001_schema_propostas.sql)
```

Você deve ver diferenças só de forma (aspas, ordem, `IF NOT EXISTS`). Diferença de tipo, nulidade ou nome é bug: corrija e apague a pasta `Conferencia`. Repare no que o EF **não** gera: nenhuma coluna `xmin` (próxima lição explica por quê).
:::

## O repositório: o banco decide as disputas

```csharp
public async Task<bool> AdicionarAsync(Proposta proposta, CancellationToken ct)
{
    db.Propostas.Add(proposta);
    try { await db.SaveChangesAsync(ct); proposta.LimparEventos(); return true; }
    catch (DbUpdateException ex) when (ex.InnerException is PostgresException
        { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "ux_propostas_cliente_ativa" })
    {
        db.Entry(proposta).State = EntityState.Detached;
        return false;
    }
}
```

Repare no `ConstraintName` no filtro do `catch`: só **esta** violação vira "já existe proposta ativa". Uma violação de outra restrição (um bug) continua sendo exceção e aparece como 500 nos logs, em vez de ser mascarada como regra de negócio.

::: armadilha `LimparEventos()` aqui é provisório
O agregado acumula eventos de domínio (`PropostaAprovada`, `ContratoAssinado`...). Por enquanto, o repositório os descarta depois de gravar. No módulo 6, a outbox grava esses eventos **na mesma transação** do `SaveChanges`. Se você publicasse no Kafka aqui, depois do `SaveChanges`, teria o problema da lição 4.5: o banco gravou e o Kafka não recebeu, ou o contrário.
:::

## Perguntas para responder sem olhar

::: pergunta
Por que o status da proposta é gravado como texto e não como número?
???
Porque o número depende da ordem do enum no código. Reordenar ou inserir um valor mudaria o significado das linhas antigas sem nenhum erro. Texto é estável, legível no `psql`, e o `CHECK` do banco limita os valores válidos.
:::

::: pergunta
Quando você guardaria uma lista em `jsonb` em vez de uma tabela filha?
???
Quando a lista é lida e gravada sempre junto com o pai, não é consultada nem atualizada sozinha, e não tem integridade referencial própria. Se alguém precisa filtrar, agregar ou atualizar itens individuais, ou se outro processo escreve neles, é tabela.
:::

::: pergunta
Por que o `catch` do repositório filtra pelo nome da restrição?
???
Para traduzir em regra de negócio só a violação esperada. Qualquer outra violação de unicidade é bug, e precisa aparecer como erro, não ser mascarada como "já existe proposta ativa".
:::

**Próxima:** [4.3 Concorrência com `xmin`](03-concorrencia-xmin.md).
