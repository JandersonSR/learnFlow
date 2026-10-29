# 3.4 Réplicas disputando o mesmo dado

Com um processo só, quase todo código de banco funciona. Com 2 a 8 pods da API e até 3 do worker, aparecem as disputas: duas réplicas lendo e gravando a mesma linha ao mesmo tempo. O projeto tem três delas, cada uma resolvida de um jeito.

## Disputa 1: duas réplicas gravando o mesmo CEP novo

No [`ConsultarCepHandler`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/Features/ConsultarCep/ConsultarCepHandler.cs):

```csharp
try
{
    await db.SaveChangesAsync(ct);
}
catch (DbUpdateException)
{
    // Duas réplicas podem gravar o mesmo CEP novo ao mesmo tempo; a chave primária barra a segunda.
    LogGravadoPorOutraReplica(log, cep);
}
```

::: porque Por que só registrar e seguir
O dado é um cache: as duas réplicas buscaram o mesmo endereço no ViaCEP, e o que a segunda queria gravar é igual ao que a primeira gravou. A **chave primária** garante que só uma linha exista, e a segunda réplica responde ao cliente normalmente com o que já tinha em mãos.

Repare no que **não** foi feito: um `SELECT` antes do `INSERT` para "ver se já existe". Entre o `SELECT` e o `INSERT` da réplica A, a réplica B pode inserir. Conferir antes não resolve disputa; quem resolve é a restrição no banco.
:::

## Disputa 2: o contador do ranking

O worker soma uma consulta por evento. A versão ingênua, com EF:

```csharp
var estatistica = await db.Estatisticas.FindAsync([evento.Cep], ct);
estatistica.Consultas++;
await db.SaveChangesAsync(ct);
```

::: previsao
Três réplicas do worker processam, ao mesmo tempo, eventos de partições diferentes. Por coincidência, cada uma recebe um evento do CEP `01001000`, que tem `Consultas = 10`. Com o código ingênuo acima, quanto vale `Consultas` no fim?
???
Hoje, **13**, por sorte do desenho: a chave da mensagem no Kafka é o CEP, então todos os eventos de um CEP vão para a **mesma partição**, e uma partição é lida por uma réplica só. Três réplicas nunca recebem o mesmo CEP ao mesmo tempo (módulo 5).

Mas se alguém mudar a chave da mensagem, ou se um rebalanceamento entregar a partição a outra réplica no meio do processamento, o código ingênuo pode terminar com **11**: as três leem 10, somam 1 e gravam 11. Duas contagens se perdem. É a **atualização perdida** (*lost update*), e ela não gera erro nenhum.
:::

Por isso o [`RegistradorDeConsultas`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/Features/Estatisticas/RegistradorDeConsultas.cs) não lê para depois gravar. Ele manda **um comando só**, atômico:

```sql
INSERT INTO cep."Estatisticas" ("Cep", "Consultas", ...)
VALUES (@cep, 1, ...)
ON CONFLICT ("Cep") DO UPDATE SET
    "Consultas" = cep."Estatisticas"."Consultas" + 1, ...
```

::: porque
O banco faz a soma **dentro** do comando, com a linha travada. Não existe janela entre ler e gravar, então não há atualização perdida, com qualquer número de réplicas. E o `ON CONFLICT` resolve no mesmo comando o caso de o CEP ainda não existir.

A defesa não depende do Kafka garantir a ordem: se a garantia de partição falhar um dia, a contagem continua certa. Duas defesas independentes são melhores que uma.
:::

## Disputa 3: a regra da cota

Já vista na [lição 1.4](../modulo-01/04-ddd-tatico.md): uma regra de negócio que depende do valor lido ("só passa se ainda tem cota") não cabe num `UPDATE ... + 1` simples. A resposta foi **concorrência otimista** com a coluna `xmin`: quem grava por último recebe conflito, relê e decide de novo.

| Situação | Ferramenta |
|---|---|
| Garantir unicidade (mesmo CEP duas vezes) | Restrição no banco (chave primária, índice único) e tratar a violação |
| Somar ou subtrair sem regra | Comando atômico (`UPDATE ... SET x = x + 1`, `INSERT ... ON CONFLICT`) |
| Regra que depende do valor lido | Concorrência otimista (versão) e nova tentativa; ou `UPDATE ... WHERE condição` e conferir as linhas afetadas |
| Disputa muito alta pela mesma linha | Repensar o modelo (contadores por partição, fila, agregação posterior) |

## Lab: ver a atualização perdida com os próprios olhos

::: quebra
Abra **dois terminais**, cada um com um `psql` no banco local:

```bash
docker compose exec postgres psql -U cep -d cep
```

No terminal A, prepare uma linha:

```sql
INSERT INTO cep."Estatisticas" ("Cep", "Consultas", "UltimaConsulta")
VALUES ('99999999', 10, now()) ON CONFLICT DO NOTHING;
```

Agora simule duas réplicas fazendo "ler, somar, gravar", intercalando os comandos na ordem abaixo:

```sql
-- A: BEGIN; SELECT "Consultas" FROM cep."Estatisticas" WHERE "Cep" = '99999999';   (lê 10)
-- B: BEGIN; SELECT "Consultas" FROM cep."Estatisticas" WHERE "Cep" = '99999999';   (lê 10)
-- A: UPDATE cep."Estatisticas" SET "Consultas" = 11 WHERE "Cep" = '99999999'; COMMIT;
-- B: UPDATE cep."Estatisticas" SET "Consultas" = 11 WHERE "Cep" = '99999999'; COMMIT;
```

Quanto ficou? Agora repita com o comando atômico nos dois terminais, ao mesmo tempo:

```sql
UPDATE cep."Estatisticas" SET "Consultas" = "Consultas" + 1 WHERE "Cep" = '99999999';
```
:::

::: solucao
No primeiro roteiro, ficou **11**: duas "consultas", uma contagem. Nenhum erro, nenhum aviso. Em produção, você só descobre comparando com outra fonte.

No segundo, cada `UPDATE ... + 1` lê o valor **atual** no momento de gravar, com a linha travada. Se os dois rodarem juntos, o segundo espera o primeiro terminar e soma em cima. Sobe de 2 em 2, sempre.

Limpeza: `DELETE FROM cep."Estatisticas" WHERE "Cep" = '99999999';`
:::

## Conexões: o limite que aparece no dia do pico

Cada pod tem um **pool** de conexões com o banco. O Npgsql abre conexões sob demanda até um máximo (`Maximum Pool Size`, que por padrão é 100 **por pod**).

::: previsao
Num pico, o HPA escala a API para 8 pods e o KEDA, o worker para 3. Cada pod pode abrir até 100 conexões. O PostgreSQL gerenciado do laboratório é um plano pequeno (Burstable), com limite de conexões na casa das dezenas. O que acontece quando o tráfego aperta?
???
11 pods × até 100 conexões = até **1.100** conexões possíveis, contra um servidor que aceita dezenas. Passado o limite, novas conexões falham com `too many clients already` (ou erro parecido), e as requisições começam a dar 503, **justamente no pico**, quando o HPA acabou de pôr mais pods para ajudar. Escalar a API piorou o problema.

Defesas, da mais simples para a mais robusta:

1. **Limitar o pool por pod** na connection string (`Maximum Pool Size=10`, por exemplo), de modo que `pods máximos × pool` fique abaixo do limite do servidor, com folga para a migração e para você.
2. **Usar um *pooler*** entre a aplicação e o banco. O Azure Database for PostgreSQL Flexible Server tem o PgBouncer embutido, que deixa milhares de conexões de cliente compartilharem poucas conexões reais.
3. **Dimensionar o servidor** pelo número de conexões, não só por CPU e memória.

Confira o limite real do seu plano na documentação do Azure e faça a conta antes do pico, não durante.
:::

::: armadilha
`max` do HPA, `max` do KEDA e o pool de conexões são decididos em arquivos diferentes, muitas vezes por pessoas diferentes. A conta que liga os três quase nunca é feita. Coloque-a num comentário do `values.yaml`, perto do `hpa.max`.
:::

## Consultas só de leitura: `AsNoTracking`

O endpoint do ranking usa `.AsNoTracking()`. Sem ele, o EF guarda uma cópia de cada entidade lida para detectar mudanças num `SaveChanges` que nunca vai acontecer. Em consultas só de leitura, `AsNoTracking` economiza memória e CPU. E o índice em `Consultas` (no `CepDbContext`) existe porque o ranking ordena por essa coluna.

## Perguntas para responder sem olhar

::: pergunta
Por que conferir com um `SELECT` antes de um `INSERT` não impede duplicidade entre réplicas?
???
Porque entre o `SELECT` e o `INSERT` de uma réplica, outra pode inserir. Quem garante unicidade é uma restrição no banco (chave primária ou índice único), e a aplicação trata a violação.
:::

::: pergunta
O que é uma atualização perdida, e como o projeto evita no ranking?
???
Duas transações leem o mesmo valor, calculam em cima dele e gravam; a segunda sobrescreve a primeira e uma alteração some, sem erro. O projeto evita com um comando atômico (`INSERT ... ON CONFLICT DO UPDATE SET x = x + 1`): o banco soma dentro do comando, com a linha travada.
:::

::: pergunta
Por que escalar a API pode derrubar o banco, e como você previne?
???
Cada pod tem seu pool de conexões; mais pods multiplicam as conexões possíveis e podem passar do limite do servidor, gerando erros justamente no pico. Previno limitando o pool por pod de acordo com a conta `pods máximos × pool`, usando um pooler como o PgBouncer e dimensionando o servidor pelo número de conexões.
:::

**Próxima:** [Perguntas de entrevista do módulo](perguntas-de-entrevista.md).
