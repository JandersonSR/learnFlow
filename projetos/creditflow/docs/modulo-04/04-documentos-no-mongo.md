# 4.4 Documentos, índices e TTL no MongoDB

Você já usou Mongo com Node, onde um objeto JavaScript vira documento quase sem pensar. Em .NET a tradução passa por tipos: `decimal`, `Guid`, `DateTime`, `DateOnly`. Cada um tem uma armadilha de serialização, e todas aparecem em produção, não no primeiro teste. Esta lição modela o documento da simulação decidindo cada tipo de propósito.

## O documento

O agregado `SimulacaoDeEmprestimo` não conhece BSON. Quem conhece é um tipo só de persistência, o [`SimulacaoDocumento`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Infrastructure/Mongo/SimulacaoDocumento.cs), e um mapeamento escrito à mão entre os dois. No banco, uma simulação fica assim:

```js
{
  _id: UUID("0192f1c2-7a3b-7c11-9d2e-5b8f0a1c3e44"),
  v: 1,
  cliente_id: UUID("5d0c3a8e-..."),          // ausente em simulação anônima
  valor: Decimal128("10000.00"),
  prazo_meses: 12,
  sistema: "price",
  faixa: { nome: "B", score_minimo: 650, taxa_mensal: Decimal128("0.0219") },
  data_contratacao: "2026-10-30",
  criada_em: ISODate("2026-10-30T15:00:00.000Z"),
  expira_em: ISODate("2027-01-28T15:00:00.000Z"),
  iof_diario: Decimal128("..."), iof_adicional: Decimal128("38.00"),
  valor_liberado: Decimal128("..."), cet_mensal: Decimal128("..."), cet_anual: Decimal128("..."),
  parcelas: [ { n: 1, venc: "2026-11-30", valor: Decimal128("950.12"), juros: ..., amort: ..., saldo: ... }, ... ]
}
```

::: porque Um tipo de documento separado do agregado
Daria para ensinar o driver a serializar o agregado direto (`BsonClassMap`, construtores privados, serializadores para `Dinheiro`). Funciona, e amarra o domínio ao formato do banco: renomear uma propriedade C# muda o nome do campo em documentos novos, e os antigos param de ser lidos. Com um tipo de persistência, o domínio muda à vontade e o documento só muda quando **você** decide. O custo é o [`MapeamentoDeSimulacao`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Infrastructure/Mongo/MapeamentoDeSimulacao.cs): chato, explícito e o único lugar que conhece os dois lados.
:::

## Tipo por tipo

| Campo | Tipo BSON | Por quê | O que dá errado sem isso |
|---|---|---|---|
| Dinheiro e taxas | `Decimal128` (`[BsonRepresentation(BsonType.Decimal128)]`) | Decimal exato de 128 bits, como o `decimal` do .NET | O padrão do driver para `decimal` é **string**: ordenar e somar no banco deixam de funcionar. E `double` erra centavos |
| `_id`, `cliente_id` | UUID binário, subtipo 4 (`GuidRepresentation.Standard`) | Formato padrão entre linguagens | O formato antigo do C# (subtipo 3) grava os bytes em outra ordem: o mesmo id aparece **diferente** no mongosh, em Node e em Python |
| Datas com hora | `Date` (UTC, milissegundos) | Ordena, compara, serve para TTL | Sub-milissegundo é **truncado**: um `DateTimeOffset` com microssegundos não volta igual |
| Datas sem hora | string `"yyyy-MM-dd"` | Uma data de vencimento não tem fuso | Como `Date`, 30/11 viraria `2026-11-30T00:00Z`, que em Brasília é **29/11 às 21h** |
| Enums | string (`"price"`) | Estável | Número dependeria da ordem do enum (mesma lição do status no Postgres) |

::: armadilha O id gerado no código
O `_id` é um UUID v7 (`Guid.CreateVersion7()`), gerado na aplicação, não pelo Mongo. UUID v7 começa pelo timestamp, então ids novos são "crescentes", e o índice do `_id` recebe inserções sempre no fim, como um `ObjectId`. Um UUID v4 (aleatório) espalharia as inserções pelo índice inteiro e deixaria a escrita mais cara à medida que a coleção cresce.
:::

## Nomes curtos e a versão do documento

O Mongo não tem catálogo de colunas: o **nome de cada campo é gravado em cada documento**. Numa tabela de 48 parcelas, `numero_da_parcela` em vez de `n` são 16 bytes × 48 por simulação. Em milhões de simulações, faz diferença em disco, em memória do cache do WiredTiger e em rede. Por isso as parcelas usam `n`, `venc`, `amort`. Nos campos de topo, que aparecem uma vez, a legibilidade vence.

O campo `v: 1` é a **versão do formato**. Junto com `[BsonExtraElements]`, ele permite evoluir sem migrar tudo de uma vez:

1. Versão nova do código passa a gravar um campo novo (`v: 2`). Pods antigos, durante o rolling update, leem esse documento: o campo desconhecido cai em `Extras` em vez de quebrar a desserialização.
2. O código novo lê `v: 1` e `v: 2`, preenchendo o padrão onde falta.
3. Se um dia for preciso, um job converte os `v: 1` restantes. Com TTL de 90 dias, normalmente nem precisa: eles somem sozinhos.

## Índices: a regra ESR

```csharp
// histórico do cliente: igualdade em cliente_id, ordenação por criada_em
new(Builders<SimulacaoDocumento>.IndexKeys.Ascending(d => d.ClienteId).Descending(d => d.CriadaEm),
    new CreateIndexOptions<SimulacaoDocumento>
    {
        Name = "ix_cliente_criada_em",
        PartialFilterExpression = Builders<SimulacaoDocumento>.Filter.Exists(d => d.ClienteId),
    }),
```

::: conceito ESR (*Equality, Sort, Range*)
A ordem dos campos num índice composto do Mongo: primeiro os de **igualdade** (`cliente_id = X`), depois os de **ordenação** (`criada_em desc`), por último os de **intervalo** (`valor > 5000`). Assim, o índice entrega os documentos já filtrados **e já na ordem**, e o servidor não precisa ordenar em memória (o estágio `SORT` no `explain`, que tem limite de memória e custa CPU).
:::

::: porque Por que parcial
A maioria das simulações é anônima (o endpoint é público). Sem o filtro parcial, cada uma ocuparia uma entrada com `cliente_id: null` num índice que só serve para "histórico de um cliente". Com `{ cliente_id: { $exists: true } }`, o índice só tem as simulações de clientes identificados.

O cuidado: o Mongo só usa um índice parcial quando consegue provar que a consulta está **dentro** do filtro. Uma consulta `{ cliente_id: <uuid> }` está (um campo igual a um valor existe). Uma consulta `{ cliente_id: null }` não está, e não usa o índice. O teste de integração `Indices_sao_criados_e_a_consulta_do_historico_usa_o_indice` confere com `explain` que o plano vencedor usa `ix_cliente_criada_em`.
:::

## TTL: o banco apaga sozinho

Dois estilos, um em cada coleção:

```csharp
// simulacoes: o documento carrega a própria data de morte
new(Builders<SimulacaoDocumento>.IndexKeys.Ascending(d => d.ExpiraEm),
    new CreateIndexOptions { Name = "ttl_expira_em", ExpireAfter = TimeSpan.Zero }),

// notificacoes: idade fixa a partir da criação
new(Builders<NotificacaoDocumento>.IndexKeys.Ascending(d => d.CriadaEm),
    new CreateIndexOptions { Name = "ttl_criada_em", ExpireAfter = TimeSpan.FromDays(180) }),
```

| Estilo | Quando usar |
|---|---|
| `expireAfterSeconds: 0` num campo `expira_em` | A validade pode variar por documento (simulação de cliente identificado guardada mais tempo, por exemplo) e mudar a política não exige recriar o índice: muda o cálculo ao gravar |
| `expireAfterSeconds: N` num campo de criação | Todos vivem o mesmo tempo. Mudar N exige `collMod` no índice (e vale para os documentos antigos também) |

::: armadilha O TTL não é um relógio de precisão
Um processo do `mongod` passa a cada **60 segundos** apagando o que venceu, e sob carga pode atrasar. Um documento "vencido" pode ser lido por alguns minutos. Se a regra de negócio depende do vencimento (a simulação vale 7 dias), **o código confere a data**, como o `Proposta.Criar` faz com `RealizadaEm`. O TTL é limpeza, não regra.
:::

::: armadilha Mudar a definição de um índice existente
`CreateMany` com a mesma definição é idempotente. Com o **mesmo nome e opções diferentes** (outro `ExpireAfter`), o servidor recusa com `IndexOptionsConflict`, e o `IndicesDeSimulacao` só registra um aviso. Mudar índice no Mongo é uma migração: `collMod` para TTL, ou criar o novo com outro nome, esperar ficar pronto e remover o velho. Num passo de deploy, revisado, como o DDL do Postgres.
:::

## Idempotência com índice único: a inbox do Mongo

O módulo Notificacoes consome eventos do Kafka, que entrega "pelo menos uma vez". O mesmo `DesembolsoConcluido` pode chegar duas vezes. A defesa é um índice **único** `(evento_id, canal)`:

```csharp
try { await Colecao.InsertOneAsync(documento, options: null, ct); return (notificacao, true); }
catch (MongoWriteException ex) when (ex.WriteError?.Category == ServerErrorCategory.DuplicateKey)
{
    var existente = await Colecao.Find(d => d.EventoId == notificacao.EventoId && d.Canal == canal).FirstAsync(ct);
    return (ParaDominio(existente), false);
}
```

É o mesmo papel da tabela `inbox` do Postgres (módulo 6), sem tabela extra: o próprio documento é o registro de "já processei".

::: previsao
O pod do Notificacoes registra a notificação (status `Pendente`), e morre **antes** de chamar o provedor de e-mail. O Kafka entrega o evento de novo a outro pod. O que acontece? E se o pod tivesse morrido **depois** de enviar e antes de marcar `Enviada`?
???
**Morreu antes de enviar:** o segundo pod tenta inserir, recebe `E11000 duplicate key`, lê a existente, vê `Pendente` e **envia**. O cliente recebe o e-mail uma vez. Se o código tratasse "já existe" como "já fiz", esse e-mail **nunca** sairia.

**Morreu depois de enviar:** o segundo pod vê `Pendente` e envia de novo: o cliente recebe **dois** e-mails. Não há como evitar isso sem o provedor aceitar uma chave de idempotência (vários aceitam: você manda o `Id` da notificação e ele descarta a repetição). Entre "pode duplicar" e "pode perder", para aviso de crédito liberado, o CreditFlow escolhe duplicar. O teste de integração `Mesmo_evento_entregue_tres_vezes_envia_uma_vez_por_canal` aceita de 2 a 4 envios para 2 canais exatamente por isso.
:::

## Consultas que não trazem o que não precisam

```csharp
_colecao.Find(d => d.ClienteId == clienteId)
    .SortByDescending(d => d.CriadaEm)
    .Limit(20)
    .Project(d => new ResumoDeSimulacao(d.Id, d.Valor, d.PrazoMeses, d.Sistema, d.CetAnual, d.CriadaEm))
```

O `Project` vira uma **projeção** no servidor: a tabela de parcelas (o grosso do documento) não trafega. O driver traduz a expressão LINQ para `{ find: ..., filter: { cliente_id: ... }, sort: { criada_em: -1 }, limit: 20, projection: {...} }`. Para ver o que foi enviado, ligue o log de comandos do driver ou use o profiler do Mongo; para ver como o servidor executou, `explain`.

::: checkpoint Ver o plano você mesmo
```bash
docker compose exec mongo mongosh creditflow --quiet --eval '
  db.simulacoes.find({ cliente_id: UUID("<um cliente_id que exista>") }).sort({ criada_em: -1 }).limit(20)
    .explain("executionStats").queryPlanner.winningPlan'
```

Você deve ver `IXSCAN` com `indexName: "ix_cliente_criada_em"` e **nenhum** estágio `SORT`. Troque o filtro por `{ sistema: "price" }` e compare: `COLLSCAN`.
:::

::: armadilha Um `MongoClient` por processo
O `MongoClient` guarda o pool de conexões e é thread-safe. Criar um por requisição (o equivalente a criar um `new MongoClient()` dentro de um handler do Express) abre conexões sem parar até o servidor recusar. Ele é registrado como singleton, com `ServerSelectionTimeout` de 5 s em vez dos 30 s padrão: com o Mongo fora, a requisição falha em 5 s, não fica 30 s segurando uma thread.
:::

## Perguntas para responder sem olhar

::: pergunta
Como você guarda dinheiro, UUID e data de vencimento num documento do Mongo a partir do .NET?
???
Dinheiro em `Decimal128` (o padrão do driver para `decimal` é string). UUID como binário subtipo 4 (`GuidRepresentation.Standard`), para ser igual em todas as linguagens. Data de vencimento sem hora como string ISO (`yyyy-MM-dd`), porque `Date` é um instante em UTC e mudaria de dia no fuso de Brasília.
:::

::: pergunta
O que é a regra ESR?
???
A ordem dos campos num índice composto: igualdade, depois ordenação, depois intervalo. Assim o índice filtra e entrega na ordem certa, sem ordenação em memória.
:::

::: pergunta
O TTL do Mongo garante que um documento vencido não seja lido?
???
Não. O monitor de TTL roda a cada ~60 s e pode atrasar sob carga. Regra de validade fica no código; TTL é limpeza.
:::

**Próxima:** [4.5 Consistência entre os dois bancos](05-consistencia-entre-bancos.md).
