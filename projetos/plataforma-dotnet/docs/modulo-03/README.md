# Módulo 3: PostgreSQL e EF Core em produção

**Objetivo:** usar EF Core e PostgreSQL do jeito que produção exige: migrações revisadas e compatíveis com a versão anterior, a aplicação sem poder de alterar o schema, falhas transitórias tratadas e concorrência entre réplicas resolvida no banco.

## O que você vai conseguir fazer no fim

- Explicar o que o `DbContext` do módulo configura e por que cada opção está ali
- Gerar, ler e aplicar um script de migração idempotente, e explicar por que ele sai do pipeline e não da aplicação
- Planejar uma mudança de schema em expand/contract, sem derrubar os pods da versão anterior
- Criar o usuário da aplicação com o mínimo de permissão, inclusive para tabelas que ainda não existem
- Reconhecer e resolver as três disputas entre réplicas que aparecem no projeto

## Lições

| # | Lição | Tempo |
|---|---|---|
| 3.1 | [PostgreSQL e o `DbContext` do módulo](01-postgres-e-dbcontext.md) | 50 min |
| 3.2 | [Migrações que não derrubam ninguém](02-migracoes.md) | 75 min |
| 3.3 | [Menor privilégio: a API que não pode apagar tabela](03-menor-privilegio.md) | 50 min |
| 3.4 | [Réplicas disputando o mesmo dado](04-concorrencia-e-conexoes.md) | 60 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Onde está a prática

Níveis [02](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/02-azure-sql.md), [09](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/09-migracao-revisada.md) e [13](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/13-postgresql.md) do aks-step-by-step. Os labs deste módulo rodam no PostgreSQL do `docker compose`, sem Azure.

## Entregável do módulo

Um plano escrito de expand/contract para uma mudança real de schema na empresa (renomear uma coluna, quebrar uma tabela em duas), com os deploys em ordem e o que cada versão da aplicação lê e grava.
