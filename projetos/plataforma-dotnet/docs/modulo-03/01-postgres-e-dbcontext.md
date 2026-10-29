# 3.1 PostgreSQL e o `DbContext` do módulo

## Por que PostgreSQL

O projeto começou no Azure SQL e trocou para PostgreSQL no [nível 13](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/13-postgresql.md).

::: porque
- **Sem licença por núcleo**, e o mesmo banco em qualquer nuvem ou na máquina do dev.
- **Recursos que aparecem no próprio projeto**: `INSERT ... ON CONFLICT` (o ranking do worker, lição 3.4), `xmin` para concorrência otimista (lição 1.4), tipos como `jsonb` e índices parciais quando precisar.
- **Mercado**: é o banco relacional mais usado entre desenvolvedores nas pesquisas recentes, e o serviço gerenciado existe nas três grandes nuvens.

O que pesou contra: o time conhecia mais SQL Server. O nível 13 mostra o custo real da troca: graças ao EF Core e à migração por script, mudou o provedor, as migrations e o Terraform. Handler, endpoints e chart ficaram iguais.
:::

::: video PostgreSQL in 100 Seconds (Fireship, em inglês)
https://www.youtube.com/watch?v=n2Fluyr3lbc
O que é o PostgreSQL e por que ele é tão adotado, em dois minutos.
:::

## O que o módulo configura, linha a linha

Do [`CepModulo.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/CepModulo.cs):

```csharp
services.AddDbContext<CepDbContext>((sp, o) => o.UseNpgsql(
    sp.GetRequiredService<IConfiguration>().GetConnectionString("Cep"),
    pg => pg
        .MigrationsHistoryTable("__EFMigrationsHistory", CepDbContext.Schema)
        .EnableRetryOnFailure()));
```

E do [`CepDbContext.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/Data/CepDbContext.cs):

```csharp
modelBuilder.HasDefaultSchema("cep");
```

::: porque Schema próprio e histórico de migrações dentro dele
Cada módulo tem seu schema no mesmo banco (lição 1.2). O histórico de migrações (`__EFMigrationsHistory`) também fica no schema do módulo. Se ficasse no `public`, compartilhado, as migrações do módulo Parceiros e do Cep se misturariam na mesma tabela de histórico, e extrair um módulo para outro banco exigiria separar esse histórico na mão.
:::

::: porque A connection string lida a cada escopo
Repare no `(sp, o) =>`: a connection string é lida **a cada vez que um `DbContext` é criado** (por requisição), e não uma vez na subida. Junto com o `AddKeyPerFile("/mnt/secrets", reloadOnChange: true)` do `Program.cs`, isso permite **trocar a senha no Key Vault sem reiniciar os pods** (nível 6): o driver CSI atualiza o arquivo, a configuração recarrega, e a próxima requisição já conecta com a senha nova. O `/info` mostra o `Application Name` da conexão em uso, justamente para provar isso.
:::

## Falhas transitórias: `EnableRetryOnFailure`

::: conceito Falha transitória
Um erro que some sozinho se você tentar de novo logo depois: a conexão caiu durante uma manutenção do serviço gerenciado, o banco trocou de nó primário, um pico de rede. Em nuvem, isso **vai** acontecer algumas vezes por mês.
:::

`EnableRetryOnFailure` liga uma estratégia de execução que reconhece os códigos de erro transitórios do PostgreSQL e repete a operação com espera crescente, antes de devolver o erro para a aplicação.

::: previsao
Com `EnableRetryOnFailure` ligado, você escreve no handler do módulo Parceiros:

```csharp
await using var transacao = await db.Database.BeginTransactionAsync(ct);
// ... duas gravações ...
await db.SaveChangesAsync(ct);
await transacao.CommitAsync(ct);
```

Funciona?
???
**Não.** Lança `InvalidOperationException` dizendo que a estratégia de execução configurada (`NpgsqlRetryingExecutionStrategy`) não suporta transações iniciadas pelo usuário.

O motivo é sensato: se a conexão cair no meio, a estratégia não sabe repetir "só a sua parte" da transação. O jeito certo é entregar o bloco inteiro para a estratégia repetir:

```csharp
var estrategia = db.Database.CreateExecutionStrategy();
await estrategia.ExecuteAsync(async () =>
{
    await using var transacao = await db.Database.BeginTransactionAsync(ct);
    // ... duas gravações ...
    await db.SaveChangesAsync(ct);
    await transacao.CommitAsync(ct);
});
```

Agora, numa falha transitória, a estratégia repete **a transação inteira**. Por isso o bloco precisa ser seguro de repetir: nada de enviar e-mail ou publicar evento lá dentro.
:::

::: armadilha
Repetir não é de graça. Uma operação que **não é idempotente** (um `UPDATE saldo = saldo - 10` sem controle), repetida depois de uma falha em que o banco **chegou a gravar** mas a resposta se perdeu, aplica o efeito duas vezes. Para dados críticos, a operação precisa ser segura de repetir, ou ter uma chave de idempotência.
:::

## `DateTimeOffset` e UTC

O handler grava `ConsultadoEm` com `relogio.GetUtcNow()`, um `DateTimeOffset` em UTC, numa coluna `timestamp with time zone`.

::: porque
O Npgsql 6+ é rígido com datas: gravar um `DateTime` com `Kind=Local` numa coluna `timestamp with time zone` lança erro (`Cannot write DateTime with Kind=Local`), em vez de converter em silêncio. Parece chato, mas evita o bug clássico de horário deslocado em 3 horas que só aparece em produção, onde o contêiner roda em UTC. A regra do projeto: **guardar sempre em UTC**, converter para o fuso do usuário só na apresentação (como no "dia de Brasília" da cota, na lição 1.7).
:::

## Perguntas para responder sem olhar

::: pergunta
Por que a connection string é lida a cada criação do `DbContext` e não uma vez na subida?
???
Para a troca de senha no Key Vault valer sem reiniciar os pods: o arquivo montado pelo CSI muda, a configuração recarrega, e o próximo `DbContext` já usa a conexão nova.
:::

::: pergunta
O que é uma falha transitória, e que cuidado a repetição automática exige?
???
Um erro que some se você tentar de novo logo depois (queda de conexão, troca de primário, pico de rede). A repetição exige que a operação seja segura de repetir: se o banco gravou e só a resposta se perdeu, repetir algo não idempotente aplica o efeito duas vezes.
:::

::: pergunta
Como usar transação explícita com `EnableRetryOnFailure` ligado?
???
Dentro de `db.Database.CreateExecutionStrategy().ExecuteAsync(...)`, para a estratégia repetir a transação inteira em caso de falha transitória. Sem isso, o EF lança exceção. E o bloco não deve ter efeitos externos, porque pode rodar mais de uma vez.
:::

**Próxima:** [3.2 Migrações que não derrubam ninguém](02-migracoes.md).
