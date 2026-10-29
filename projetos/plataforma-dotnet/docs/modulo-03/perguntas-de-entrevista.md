# Perguntas de entrevista do módulo 3

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
Cite três mudanças incompatíveis numa API.
???
Remover ou renomear campo, mudar o tipo de um campo, tornar obrigatório um parâmetro opcional (também: novo status de erro numa operação, mudar o significado de um código de erro).
:::

::: pergunta
O agregado `Parceiro` garante a regra da cota com várias réplicas da API?
???
Só dentro de um processo. Entre réplicas, precisa de controle de concorrência no banco: concorrência otimista com versão (`xmin`) e nova tentativa, ou um `UPDATE` atômico com a condição no `WHERE`.
:::

## Banco de dados em produção

::: entrevista
"Como você aplica migrações de banco em produção?"
???
Gero um script SQL idempotente a partir das migrações no CI, publico como artefato para alguém revisar, e o pipeline aplica com um usuário administrativo **antes** do deploy da versão nova. Não migro na subida da aplicação: vários pods disputariam a migração, a aplicação precisaria de permissão de DDL e ninguém leria o SQL. E o CI reprova se o modelo mudou sem migração (`has-pending-model-changes`).
:::

::: entrevista
"Como renomear uma coluna sem downtime?"
???
Expand/contract em vários deploys. Acrescento a coluna nova; a aplicação passa a gravar nas duas e ler da nova com fallback; copio os dados antigos em lotes; a aplicação passa a usar só a nova; por fim removo a velha, quando nenhuma versão em uso ou candidata a rollback depende dela. Em cada passo, a versão anterior continua funcionando e o rollback é seguro.
:::

::: entrevista
"Que permissões o usuário da aplicação deve ter no banco?"
???
Só DML (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) no schema do próprio módulo, sem DDL, sem criar usuários, sem acesso a outros schemas. A DDL fica com um usuário administrativo usado só pelo pipeline de migração, com senha no cofre. Uso `ALTER DEFAULT PRIVILEGES` para as tabelas futuras já nascerem com acesso, sabendo que só vale para objetos criados pela role que executou o comando.
:::

::: entrevista
"Duas instâncias do serviço atualizam o mesmo contador. Como evitar perder atualizações?"
???
Não leio para depois gravar. Uso um comando atômico, `UPDATE ... SET x = x + 1` ou `INSERT ... ON CONFLICT DO UPDATE`, e o banco faz a soma com a linha travada. Se a atualização depende de uma regra sobre o valor lido, uso concorrência otimista com versão e nova tentativa no conflito. Se a disputa pela mesma linha for muito alta, mudo o modelo: contadores por partição somados depois, ou agregação por fila.
:::

::: entrevista
"O serviço escalou no pico e o banco começou a recusar conexões. O que aconteceu e como você evitaria?"
???
Cada réplica tem seu pool de conexões; mais réplicas multiplicaram as conexões e passaram do limite do servidor. Evito limitando o pool por réplica pela conta `réplicas máximas × pool < limite do servidor` com folga, usando um pooler como o PgBouncer (embutido no PostgreSQL gerenciado do Azure) e dimensionando o banco também por conexões.
:::

::: entrevista
"O que você faz com falhas transitórias de banco em nuvem?"
???
Repetição automática com espera crescente, que no EF Core é o `EnableRetryOnFailure`. Com ela, transação explícita precisa rodar dentro da estratégia de execução, para a transação inteira ser repetida. E as operações repetidas precisam ser idempotentes, porque às vezes o banco gravou e só a resposta se perdeu.
:::

**Próximo módulo:** [Módulo 4: cache em camadas com Dragonfly](../modulo-04/README.md).
