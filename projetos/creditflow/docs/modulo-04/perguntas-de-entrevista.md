# Perguntas de entrevista do módulo 4

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão do módulo 3

::: pergunta
Por que a API exige `aud = creditflow-api`, e o que acontece se você desligar essa validação?
???
Para aceitar só tokens emitidos para ela. Sem a validação, qualquer token de qualquer client do realm (inclusive de outra API ou de um parceiro) passa a valer. O 401 de audiência se resolve no Keycloak, com o mapper, nunca desligando a validação.
:::

::: pergunta
Por que endpoints pedem policies e não roles?
???
A policy nomeia o caso de uso; quem pode executá-lo fica num lugar só e pode mudar (outra role, exigir autenticação forte) sem tocar nos endpoints.
:::

## Persistência

::: entrevista
"Quando você usaria MongoDB e quando PostgreSQL no mesmo sistema?"
???
Pela forma do dado e pelas regras que ele precisa garantir. Postgres para o que tem regras entre linhas e escritas concorrentes: unicidade, máquina de estados, dinheiro, outbox na mesma transação. Mongo para agregados lidos e gravados inteiros, imutáveis ou só-acrescenta, com volume alto e vida curta (TTL). E só vale com os dois se o ganho pagar o custo de operar mais um banco; senão, `jsonb` no Postgres cobre muito caso de documento.
:::

::: entrevista
"Dois usuários editam o mesmo registro ao mesmo tempo. Como você evita que um apague o trabalho do outro?"
???
Concorrência otimista: uma versão na linha (no Postgres, o `xmin`), conferida no `WHERE` do `UPDATE`; zero linhas afetadas = conflito, devolvo `409`/`412` e o usuário recarrega. Exponho a versão como `ETag` e exijo `If-Match`, para comparar com o que a pessoa **viu**, não com o que a requisição leu. Retry automático só em passos de sistema idempotentes, nunca em decisão de pessoa.
:::

::: entrevista
"Como garantir que um cliente não tenha duas propostas abertas, com várias réplicas da API?"
???
Índice único parcial no banco (`UNIQUE (cliente_id) WHERE status IN (...)`) e tratar a violação daquela restrição como erro de negócio. `SELECT` antes do `INSERT` não fecha a janela entre as réplicas.
:::

::: entrevista
"Como você modela dinheiro e datas no MongoDB com .NET?"
???
Dinheiro em `Decimal128` (o padrão do driver para `decimal` é string, e double erra centavo). Datas com hora em `Date` UTC, sabendo que perde sub-milissegundo. Datas sem hora (vencimento) como string ISO, para não mudar de dia com fuso. UUID como binário padrão (subtipo 4). E um tipo de documento separado do agregado, com versão do formato.
:::

::: entrevista
"Como funciona o TTL do MongoDB, e o que ele não garante?"
???
Um índice com `expireAfterSeconds` sobre um campo de data; um processo do servidor apaga os vencidos a cada ~60 s. Não garante que o documento suma no instante exato; regra de validade fica no código. Mudar o tempo exige `collMod`. Com `expireAfterSeconds: 0` num campo `expira_em`, cada documento carrega a própria data.
:::

::: entrevista
"Você grava no Postgres e precisa refletir no MongoDB. Como garante que os dois fiquem consistentes?"
???
Não gravo nos dois na mesma operação: não há transação comum e qualquer ordem deixa um buraco se o processo morrer no meio. Gravo no dono, com um evento na outbox na mesma transação; um relay publica no Kafka; o consumidor grava no Mongo de forma idempotente (índice único pelo id do evento). Fica eventual, e eu documento quanto tempo de atraso é aceitável e quem sofre com ele.
:::

::: entrevista
"Como você versiona o schema no MongoDB, que não tem schema?"
???
O schema existe, só que no código. Guardo um campo de versão no documento, leio de forma tolerante (campos extras preservados, faltantes com padrão), faço mudanças compatíveis com a versão anterior durante o rolling update, e migro os antigos em lote só se precisar. Índices são migração de verdade: mudam num passo de deploy, não na subida da aplicação.
:::

::: entrevista
"Por que um `DbContext` por módulo, e não um para o sistema todo?"
???
Para cada módulo só enxergar as próprias tabelas: o contexto é interno ao módulo, preso ao seu schema, e nenhum outro consegue fazer `JOIN` no dado alheio. Isso mantém as fronteiras do monolito modular e permite separar um módulo em serviço depois sem desembaraçar consultas. O custo é não ter integridade referencial entre módulos no banco; ela vem dos casos de uso e dos eventos.
:::

**Próximo módulo:** [Módulo 5: cache com Dragonfly](../modulo-05/README.md).
