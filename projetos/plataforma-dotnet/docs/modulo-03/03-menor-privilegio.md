# 3.3 Menor privilégio: a API que não pode apagar tabela

Até o nível 8, a API conectava no banco como **administrador**. Funciona, e é o padrão de quase todo tutorial. O problema aparece no dia ruim: um bug que monta um SQL errado, uma injeção de SQL que passou na revisão, ou alguém que conseguiu executar código dentro do pod. Com a conexão de admin, qualquer um deles pode apagar tabelas, criar usuários ou ler dados de outros schemas.

::: conceito Princípio do menor privilégio
Cada parte do sistema recebe **só** as permissões de que precisa para o seu trabalho, e nada mais. Se ela for comprometida, o estrago fica limitado ao que ela podia fazer.
:::

## Dois usuários, dois papéis

| Usuário | Quem usa | Pode | Não pode |
|---|---|---|---|
| `cepadmin` | O pipeline, na migração (e você, numa emergência) | Tudo: DDL, criar usuários | — |
| `cep_app` | A API e o worker, o tempo todo | `SELECT`, `INSERT`, `UPDATE`, `DELETE` nas tabelas do schema `cep` | Criar, alterar ou apagar tabela; ver outros schemas |

A senha de cada um vive no Key Vault. A API só recebe a do `cep_app`.

## O script que cria o usuário

Abra o [`db/permissoes.sql`](https://github.com/JandersonSR/aks-step-by-step/blob/main/db/permissoes.sql). As partes que fazem diferença:

```sql
-- Cria a role só se não existir (o PostgreSQL não tem CREATE ROLE IF NOT EXISTS)
SELECT format('CREATE ROLE cep_app LOGIN PASSWORD %L', :'senha_app')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cep_app') \gexec

ALTER ROLE cep_app WITH LOGIN PASSWORD :'senha_app';

GRANT USAGE ON SCHEMA cep TO cep_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cep TO cep_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA cep GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cep_app;
```

::: porque Cada trecho
- **`\gexec`**: o `SELECT` monta o comando `CREATE ROLE` como texto, e o `psql` executa o resultado. É o truque para "criar se não existir" num banco que não tem esse comando. Torna o script idempotente: roda a cada deploy sem erro.
- **`%L` no `format`**: escapa a senha como literal SQL. Uma senha com aspas não quebra o comando nem vira injeção.
- **`ALTER ROLE ... PASSWORD` sempre**: se a senha foi trocada no Key Vault, o próximo deploy sincroniza o banco com o cofre.
- **`USAGE` no schema, sem `CREATE`**: a role enxerga as tabelas, mas não consegue criar nada no schema. É isso que bloqueia a DDL.
- **`ALTER DEFAULT PRIVILEGES`**: as tabelas que **futuras** migrações criarem já nascem com acesso para o `cep_app`. Sem isso, cada tabela nova precisaria de um `GRANT` lembrado à mão, e a primeira esquecida derrubaria a API.
:::

## Lab: provar o menor privilégio no seu PostgreSQL local

::: quebra
Com o `docker compose up` rodando, crie o `cep_app` no banco local usando o mesmo script do pipeline, e tente fazer estrago com ele:

```bash
docker compose exec -T postgres psql -U cep -d cep -v ON_ERROR_STOP=1 -v senha_app=App_lab_123 < db/permissoes.sql

docker compose exec postgres psql "host=localhost dbname=cep user=cep_app password=App_lab_123"
```

Dentro do `psql`, como `cep_app`, rode um de cada vez e anote o resultado:

```sql
SELECT count(*) FROM cep."Enderecos";
CREATE TABLE cep.teste (id int);
CREATE TABLE public.teste (id int);
DROP TABLE cep."Enderecos";
CREATE ROLE intruso LOGIN PASSWORD 'x';
```
:::

::: solucao
| Comando | Resultado | Por quê |
|---|---|---|
| `SELECT count(*)` | Funciona | `GRANT SELECT` nas tabelas do schema |
| `CREATE TABLE cep.teste` | `permission denied for schema cep` | A role tem `USAGE`, não `CREATE`, no schema |
| `CREATE TABLE public.teste` | `permission denied for schema public` | Desde o PostgreSQL 15, ninguém além do dono cria no `public` por padrão |
| `DROP TABLE cep."Enderecos"` | `must be owner of table Enderecos` | Apagar exige ser dono; o dono é quem rodou a migração |
| `CREATE ROLE intruso` | `permission denied to create role` | A role não tem `CREATEROLE` |

É essa a garantia: mesmo com uma injeção de SQL perfeita, o pior que a conexão da API faz é mexer em dados do próprio schema. Grave, mas recuperável por backup, e muito menor que perder o banco.
:::

::: armadilha PostgreSQL 14 ou anterior
Antes da versão 15, **qualquer** usuário podia criar tabelas no schema `public`. Se o seu banco é antigo, o menor privilégio exige um `REVOKE CREATE ON SCHEMA public FROM PUBLIC;` explícito. Confira a versão com `SELECT version();`.
:::

## A pegadinha do `DEFAULT PRIVILEGES`

::: previsao
Um dia, com pressa, um DBA conecta com **o próprio usuário administrativo** (`dba_maria`, não o `cepadmin`) e cria a tabela `cep."Bairros"` à mão. A API, na versão seguinte, passa a ler essa tabela. O `ALTER DEFAULT PRIVILEGES` do script já rodou várias vezes. O que acontece na primeira consulta da API?
???
**`permission denied for table Bairros`.**

`ALTER DEFAULT PRIVILEGES` vale só para objetos criados **pela role que executou o comando** (aqui, o `cepadmin`, que roda o script no pipeline). Tabela criada por outra role não herda a regra.

Lições práticas:

- **Toda DDL passa pela migração**, com o mesmo usuário. Tabela criada à mão é um desvio que alguém vai pagar depois.
- Se precisar cobrir outra role, existe `ALTER DEFAULT PRIVILEGES FOR ROLE dba_maria IN SCHEMA cep ...`, mas o certo é não haver outra role criando tabelas.
- O próximo `GRANT ... ON ALL TABLES` (que o script roda a cada deploy) também resolveria, porque cobre as tabelas existentes. Mas só no próximo deploy.
:::

## Além do banco: o pod também tem menor privilégio

O mesmo nível 9 endureceu o pod (veja o `securityContext` no [`deployment.yaml`](https://github.com/JandersonSR/aks-step-by-step/blob/main/charts/cep-api/templates/deployment.yaml)): sem root, sem escalada de privilégio, sistema de arquivos só leitura (só `/tmp` gravável) e sem *capabilities* do Linux. A ideia é a mesma: se alguém executar código dentro do pod, encontra o mínimo possível para usar. O módulo 8 volta a esse assunto.

## Perguntas para responder sem olhar

::: pergunta
Por que a API não deve conectar no banco como administrador?
???
Porque qualquer falha na API (bug, injeção de SQL, código executado dentro do pod) herdaria o poder de admin: apagar tabelas, criar usuários, ler outros schemas. Com um usuário só de DML no próprio schema, o estrago fica limitado a dados recuperáveis por backup.
:::

::: pergunta
Para que serve o `ALTER DEFAULT PRIVILEGES` no script, e qual a limitação dele?
???
Faz as tabelas criadas por futuras migrações já nascerem com acesso para o usuário da API. A limitação: vale só para objetos criados pela role que executou o comando. Tabela criada por outra role não herda, e a API recebe `permission denied`.
:::

::: pergunta
Como o script cria o usuário só se ele não existir, num banco sem `CREATE ROLE IF NOT EXISTS`?
???
Um `SELECT format(...)` monta o comando como texto só quando a role não existe em `pg_roles`, e o `\gexec` do `psql` executa o texto resultante. Com isso o script é idempotente e roda a cada deploy.
:::

**Próxima:** [3.4 Réplicas disputando o mesmo dado](04-concorrencia-e-conexoes.md).
