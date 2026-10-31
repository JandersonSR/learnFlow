# Módulo 4: persistência poliglota: PostgreSQL e MongoDB

**Objetivo:** guardar cada dado no banco que combina com ele, e saber defender a escolha. Propostas vão para o PostgreSQL, com as regras que envolvem dinheiro garantidas **pelo banco**; simulações e notificações vão para o MongoDB, como documentos que expiram sozinhos. E, entre os dois, nenhuma transação distribuída: você vai entender por que, e o que fica no lugar.

## O que você vai conseguir fazer no fim

- Explicar, dado por dado, por que Postgres ou Mongo, sem cair em "Mongo é mais rápido"
- Ler o `PropostasDbContext` linha a linha: schema por módulo, conversões de value objects, `jsonb`, índice parcial
- Explicar o que é a coluna `xmin`, provar no `psql` que ela barra a atualização perdida, e ligar isso a `ETag`/`If-Match`
- Modelar um documento: o que embutir, que tipos BSON usar para dinheiro, UUID e data, como versionar o formato
- Criar índices no Mongo seguindo a regra ESR, usar índice parcial e TTL, e conferir com `explain`
- Responder "e se o Mongo cair no meio?" sem prometer uma transação que não existe

## O que você constrói

- O módulo Propostas: [`src/Modules/Propostas/`](https://github.com/JandersonSR/lending-plataform/tree/main/src/Modules/Propostas) (agregado, regras de análise, `DbContext`, endpoints)
- O repositório de simulações no MongoDB: [`Simulacao/Infrastructure/Mongo/`](https://github.com/JandersonSR/lending-plataform/tree/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Infrastructure/Mongo)
- O módulo Notificacoes: [`src/Modules/Notificacoes/`](https://github.com/JandersonSR/lending-plataform/tree/main/src/Modules/Notificacoes)
- Testes de integração com Testcontainers: [`tests/CreditFlow.IntegrationTests/`](https://github.com/JandersonSR/lending-plataform/tree/main/tests/CreditFlow.IntegrationTests)
- O ADR [`0004-postgres-e-mongo.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0004-postgres-e-mongo.md)

## Pré-requisitos

- Módulo 3 (os endpoints de Propostas usam as policies de lá)
- O curso Plataforma .NET, **módulo 3** (PostgreSQL e EF Core em produção). Este módulo não repete o que está lá; aponta:
  - [3.1 PostgreSQL e o `DbContext`](../../../plataforma-dotnet/docs/modulo-03/01-postgres-e-dbcontext.md) (retry de falha transitória, `DateTimeOffset`)
  - [3.2 Migrações que não derrubam ninguém](../../../plataforma-dotnet/docs/modulo-03/02-migracoes.md) (expand/contract)
  - [3.3 Menor privilégio](../../../plataforma-dotnet/docs/modulo-03/03-menor-privilegio.md) (usuário de DDL × usuário da aplicação)
  - [3.4 Réplicas disputando o mesmo dado](../../../plataforma-dotnet/docs/modulo-03/04-concorrencia-e-conexoes.md) (atualização perdida, comando atômico)
- Você já usou MongoDB em Node: aqui o foco é o que muda com o driver .NET e o que se decide **antes** de escrever o primeiro documento

## Lições

| # | Lição | Tempo |
|---|---|---|
| 4.1 | [Por que dois bancos](01-por-que-dois-bancos.md) | 45 min |
| 4.2 | [EF Core por módulo: o `DbContext` de Propostas](02-ef-core-por-modulo.md) | 60 min |
| 4.3 | [Concorrência com `xmin`, `ETag` e índice parcial](03-concorrencia-xmin.md) | 75 min |
| 4.4 | [Documentos, índices e TTL no MongoDB](04-documentos-no-mongo.md) | 75 min |
| 4.5 | [Consistência entre os dois bancos](05-consistencia-entre-bancos.md) | 45 min |
| — | [Desafio do módulo](desafio.md) | 2–3 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |

Tempo estimado: **8 a 9 horas**, contando o desafio.

## Entregável do módulo

O desafio resolvido e, para um sistema da sua empresa, uma tabela com três dados reais: forma, exigência e banco escolhido, com a pergunta "o que acontece se este dado e aquele outro ficarem inconsistentes por 1 minuto?" respondida para cada par.
