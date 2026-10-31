# Perguntas de entrevista do módulo 7

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos. As perguntas de base (Helm x YAML puro, segredos no Helm, ConfigMap que não muda o pod) estão nas [perguntas do módulo 7 da Plataforma](../../plataforma-dotnet/docs/modulo-07/perguntas-de-entrevista.md); estas vão além.

::: entrevista
"Vocês têm um monolito. Como escalam só a parte que precisa?"
???
A mesma imagem sobe em perfis: uma variável diz quais módulos o processo carrega e se ele atende HTTP ou consome filas. Cada perfil é um Deployment com sondas, recursos e autoescala próprios: a simulação, CPU-bound, escala por CPU; o worker de pagamentos escala pelo lag do Kafka com KEDA. O roteamento por caminho no Gateway manda `/v1/simulacoes` para o perfil certo. O custo é operar N Deployments e cuidar para que um módulo não dependa de estado em memória de outro; o ganho é escalar sem distribuir transações nem versionar contratos entre serviços.
:::

::: entrevista
"Por que você não colocou limite de CPU na API de simulação? Isso não é má prática?"
???
Limite de CPU no Linux é throttling do CFS em janelas de 100 ms: um processo com várias threads gasta a cota em poucos milissegundos e fica parado o resto da janela, e a latência p99 explode mesmo com a média de CPU baixa. Para um trabalho CPU-bound e sensível a latência, prefiro request bem dimensionado (que reserva espaço no nó e é a base do HPA) e sem limite, com LimitRange e cota no namespace protegendo o nó. Memória mantém limite, porque estouro de memória mata de qualquer jeito.
:::

::: entrevista
"Como você desenharia a liveness de um consumidor de Kafka?"
???
Não como um 200 fixo: um consumidor pode ter o processo saudável e o laço de consumo travado. A liveness olha o batimento do laço (última chamada a `Consume` dentro do limite). A readiness serve ao rolling update (pronto = entrou no grupo). Timeout e tolerância folgados, e `terminationGracePeriod` suficiente para terminar a mensagem atual, confirmar o offset e sair do grupo com `Close()`, que dispara o rebalanceamento na hora.
:::

::: entrevista
"Onde rodam as migrações de banco no seu deploy, e o que acontece se uma travar?"
???
Num Job em hook pre-install/pre-upgrade (PreSync no Argo CD), que aplica o DDL idempotente de cada módulo com psql, com um usuário de DDL que a aplicação não tem; a aplicação só tem DML, via privilégios padrão. A versão nova só sobe se o Job terminar. Contra travamento: `lock_timeout` curto, timeout de comando e `activeDeadlineSeconds` no Job; se estourar, o deploy falha visível e os pods antigos continuam. E as migrações são sempre compatíveis com a versão anterior do código, porque o rollback volta código, não schema.
:::

::: entrevista
"Kafka no Kubernetes ou serviço gerenciado?"
???
Depende de quem opera. Com Strimzi, o operador cuida de rolling restart ordenado, certificados, usuários e tópicos como código, e o custo é só de nós e discos; mas upgrades, capacidade de disco e incidentes são do time. Gerenciado (Confluent Cloud, Event Hubs com API Kafka, MSK) tira isso, custa mais e tem limites de compatibilidade (Event Hubs não é Kafka completo). No CreditFlow, Strimzi porque o objetivo inclui aprender a operar e porque o volume é baixo; num time sem ninguém para plantão de Kafka, eu iria de gerenciado.
:::

::: entrevista
"O que é KRaft e o que mudou para quem opera Kafka?"
???
É o modo em que os metadados ficam num quórum Raft no próprio Kafka; o ZooKeeper foi removido no Kafka 4. Operacionalmente: uma tecnologia a menos, controladores dimensionados à parte dos brokers (3 para tolerar 1 falha), e no Strimzi 1.x a configuração por `KafkaNodePool` com papéis `controller` e `broker`.
:::

::: entrevista
"Como a aplicação recebe a senha do Kafka sem você colocar nada no Git?"
???
O User Operator do Strimzi cria o usuário SCRAM e grava a senha num Secret no namespace do Kafka. Um ExternalSecret no namespace da aplicação copia só esse Secret, por uma SecretStore do provedor Kubernetes cuja ServiceAccount tem uma Role limitada por `resourceNames`. O chart monta a variável de ambiente a partir do Secret copiado. Nada passa pelo Git nem pelos values do Helm.
:::

::: entrevista
"Você mudou um client no JSON do realm e fez deploy, mas ele não apareceu em produção. Por quê?"
???
O `KeycloakRealmImport` (e o `--import-realm`) só criam o realm quando ele não existe; não atualizam. Mudanças posteriores precisam de uma ferramenta de migração de configuração (Admin API, keycloak-config-cli) aplicada no deploy, ou de recriar o realm, o que só é aceitável em ambientes descartáveis.
:::

::: entrevista
"Por que a sua imagem é chiseled, e o que você perde com isso?"
???
Sem shell, sem gerenciador de pacotes, sem root: menos CVEs e nada para um invasor usar. Perco ferramentas de depuração dentro do contêiner (uso `kubectl debug` com contêiner efêmero) e o `HEALTHCHECK` com curl (o próprio binário faz a verificação). Uso a variante `-extra` porque preciso de ICU e fuso horário para formatar valores em pt-BR.
:::

::: entrevista
"Como o cache do NuGet funciona no seu Dockerfile?"
???
Dois níveis: um estágio que mantém só os arquivos de dependência faz o `restore` vir do cache de camadas quando só o código muda (o cache do `COPY --from` é por conteúdo); e `RUN --mount=type=cache` guarda os pacotes baixados fora das camadas, acelerando quando o `restore` precisa rodar. No CI, o cache de camadas vai para o cache do GitHub (`type=gha`).
:::

## Para treinar a fala

Explique a quebra 3 da lição 7.6 (o primeiro install que nunca termina) para um colega pleno, desenhando a linha do tempo do Helm. Se ele entender por que "funcionava nos upgrades", você entendeu.
