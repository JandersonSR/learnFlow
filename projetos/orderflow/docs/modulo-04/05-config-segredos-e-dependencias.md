# 4.5 Configuração, segredos e as dependências no cluster

Arquivos: [`deploy/k8s/dev/`](../../deploy/k8s/dev/), templates `configmap.yaml` e `secret.yaml` dos charts, `values-kind.yaml`

Ao fim do Módulo 3, os dois serviços dependem de Kafka e Postgres. No kind, os dois rodam no namespace `infra`, com manifestos simples e escritos à mão, para você ver cada peça. No Módulo 5 o Kafka passa a ser do Strimzi; no 6, os segredos saem do Key Vault.

## Configuração por variável de ambiente, nas duas stacks

As duas plataformas leem variáveis de ambiente por cima do arquivo de configuração (lições 1.5 e 1J.5). O chart só precisa produzir as variáveis com o nome certo:

| Configuração | .NET (`__` separa seções) | Spring (relaxed binding) |
|---|---|---|
| Kafka | `Kafka__BootstrapServers` | `SPRING_KAFKA_BOOTSTRAP_SERVERS` |
| Banco | `ConnectionStrings__Orders` | `SPRING_DATASOURCE_URL`, `_USERNAME`, `_PASSWORD` |
| Regra de negócio | `Orders__MaxItemsPerOrder` | `PAYMENTS_APPROVALLIMIT` |
| Propriedade arbitrária do cliente Kafka | depende do binding do Módulo 2 | `SPRING_KAFKA_PROPERTIES_SASL_MECHANISM` → `spring.kafka.properties.sasl.mechanism` |

::: porque Por que variável de ambiente e não um `appsettings.Production.json` montado como arquivo
Funciona igual nas duas stacks, aparece em `kubectl describe pod` (as não secretas), e a precedência é a mesma em todo lugar: variável vence arquivo. Arquivo montado faz sentido quando a configuração é grande e estruturada (um certificado, um JSON de regras). Para chave-valor, variável.
:::

## ConfigMap e Secret

O chart transforma `config:` num **ConfigMap** e `secret.values:` num **Secret**, e o Deployment carrega os dois com `envFrom`:

```yaml
envFrom:
  - configMapRef: { name: orders }
  - secretRef:    { name: orders }
```

::: armadilha Secret não é cofre
O conteúdo de um Secret é **base64**, que é codificação, não criptografia: `kubectl get secret orders -o jsonpath='{.data.ConnectionStrings__Orders}' | base64 -d` mostra a senha. O que protege um Secret é: (1) o **RBAC**, que define quem pode dar `get` em Secrets no namespace; (2) a criptografia do etcd em repouso (o AKS faz por padrão); (3) não deixar o valor em lugares piores, como o Git. É por isso que `secret.create: true` só aparece no `values-kind.yaml`, com senha de laboratório, e no AKS o segredo vem do Key Vault (lição 6.4).
:::

### O problema da configuração que não muda

Variáveis de ambiente são lidas quando o processo **nasce**. Se você faz `helm upgrade` mudando só o ConfigMap, o Kubernetes atualiza o objeto, mas os pods continuam com os valores antigos até reiniciarem, e nada os reinicia. O chart resolve com um hash no template do pod:

```yaml
annotations:
  checksum/config: {{ toYaml .Values.config | sha256sum }}
```

Mudou o `config`, muda o hash, muda o **template do pod**, e o Deployment faz um rollout normal (com as probes e o `maxUnavailable: 0`). Configuração ruim, então, não derruba nada: o pod novo não fica Ready (ou entra em `CrashLoopBackOff` pelo `ValidateOnStart`/`@Validated`) e o rollout para.

## O Postgres de laboratório

[`deploy/k8s/dev/10-postgres.yaml`](../../deploy/k8s/dev/10-postgres.yaml) é um **StatefulSet** de uma réplica.

::: conceito StatefulSet
Como um Deployment, mas cada réplica tem **identidade estável** (`postgres-0`, não `postgres-7f9c...`) e **disco próprio**: o `volumeClaimTemplates` cria um PersistentVolumeClaim por réplica (`data-postgres-0`) que acompanha o pod para onde ele for reagendado e **sobrevive** à exclusão do pod e do próprio StatefulSet. É o objeto para coisas com estado: bancos, o Kafka, o ZooKeeper de antigamente.
:::

Um banco e um usuário por serviço, criados pelo script de inicialização:

```sql
CREATE USER orders   WITH PASSWORD 'orders-dev';
CREATE DATABASE orders   OWNER orders;
REVOKE ALL ON DATABASE orders FROM PUBLIC;
```

O `REVOKE ... FROM PUBLIC` impede que o usuário `payments` sequer conecte no banco `orders`. Mesma instância por economia de laboratório, mas o **contrato** de "cada serviço é dono dos seus dados" já está em vigor: se um dia alguém escrever um `JOIN` entre os dois bancos, ele falha aqui, no kind, e não em produção.

::: armadilha Postgres 18 mudou o caminho do volume
Até o 17, a imagem oficial usava `PGDATA=/var/lib/postgresql/data`, e todo tutorial monta o volume ali. No **18**, os dados vão para `/var/lib/postgresql/18/docker` e o volume deve ser montado em **`/var/lib/postgresql`**. Montar no caminho antigo faz a imagem recusar subir com uma mensagem sobre o diretório. A mudança existe para permitir `pg_upgrade` entre versões no mesmo volume. Leia as notas da imagem a cada versão major: é o tipo de detalhe que derruba um upgrade "simples".
:::

::: armadilha O script de init só roda uma vez
Os arquivos de `/docker-entrypoint-initdb.d` rodam **só** quando o diretório de dados está vazio. Mudou o `01-bancos.sql` e reaplicou? Nada acontece: o PVC já tem dados. Para recomeçar: `kubectl -n infra delete statefulset postgres && kubectl -n infra delete pvc data-postgres-0 && kubectl apply -f deploy/k8s/dev/`.
:::

## O Kafka de laboratório

[`deploy/k8s/dev/20-kafka.yaml`](../../deploy/k8s/dev/20-kafka.yaml): a imagem oficial `apache/kafka`, um nó em modo **KRaft** (controller e broker no mesmo processo, sem ZooKeeper, que saiu de vez no Kafka 4.0). As variáveis `KAFKA_*` viram configuração do broker (`KAFKA_PROCESS_ROLES` → `process.roles`).

A linha que mais importa é esta:

```yaml
- name: KAFKA_ADVERTISED_LISTENERS
  value: PLAINTEXT://kafka.infra.svc.cluster.local:9092
```

::: conceito Bootstrap e advertised listeners
O cliente Kafka conecta primeiro no endereço de *bootstrap* só para pedir **metadados**: quais brokers existem, quem lidera cada partição, e **em que endereço** cada broker quer ser chamado (o *advertised listener*). Depois, fala direto com cada broker por esse endereço. Se o broker anuncia `localhost:9092`, o bootstrap funciona e **todo o resto falha**: cada cliente tenta falar consigo mesmo. É o erro número 1 de Kafka em container, e o sintoma é traiçoeiro: "conectou, mas não produz nem consome".
:::

Os tópicos são criados por um **Job** (`kafka-topics`), com `auto.create.topics.enable=false` no broker: tópico é contrato, nasce declarado (6 partições cada, para combinar com o máximo de réplicas do KEDA no Módulo 6).

::: quebra Lab 1: o broker que anuncia o endereço errado
Troque o `KAFKA_ADVERTISED_LISTENERS` para `PLAINTEXT://localhost:9092`, reaplique e reinicie o broker (`kubectl -n infra delete pod kafka-0`). Depois reinicie o Payments. O que aparece nos logs do Payments? O readiness dele muda?
:::

::: solucao
Os logs do cliente Kafka mostram conexões para `localhost:9092` falhando repetidamente ("Connection to node 1 (localhost/127.0.0.1:9092) could not be established"). O bootstrap funcionou (o cliente obteve os metadados), por isso o erro não fala do endereço que você configurou, fala de `localhost`. Se o readiness do Payments não inclui o Kafka (e não deveria incluir o Kafka **na liveness**), o pod continua Ready e a API HTTP responde: os eventos é que não saem. Esse é o argumento para uma métrica/alerta de "eventos não publicados" (outbox pendente, Módulo 3) em vez de confiar só em probes.
:::

::: quebra Lab 2: as variáveis que ninguém pediu
No `20-kafka.yaml`, apague a linha `enableServiceLinks: false` do StatefulSet, reaplique e apague o pod `kafka-0`. Olhe `kubectl -n infra logs kafka-0` e `kubectl -n infra exec kafka-0 -- env | grep KAFKA_`.
:::

::: solucao
Aparecem variáveis que você não escreveu: `KAFKA_PORT=tcp://10.96.x.x:9092`, `KAFKA_PORT_9092_TCP=...`, `KAFKA_SERVICE_HOST=...`. O script de inicialização da imagem converte todas as `KAFKA_*` em propriedades do broker (`port`, `service.host`...) e a subida falha ou o broker reclama de configuração desconhecida. Ninguém pediu essas variáveis: o kubelet as injeta por compatibilidade com os "links" do Docker antigo, para cada Service do namespace. A correção é a linha que você apagou, e é por isso que **todos** os charts deste curso a trazem.
:::

## Por que não um chart pronto de Postgres/Kafka

Existem charts da comunidade para os dois. Este módulo escreve à mão por dois motivos: (1) você precisa ter lido um StatefulSet com volume, um Job e as variáveis de um broker uma vez na vida; (2) em 2025 a Bitnami, fonte dos charts mais usados, mudou a distribuição das imagens gratuitas e muitos `helm install` antigos pararam de funcionar ou passaram a puxar imagens sem atualização. É um lembrete de que dependência de infraestrutura também é dependência, e precisa de dono. Para produção: Postgres gerenciado (Azure Database for PostgreSQL) e Kafka por operador (Strimzi, Módulo 5) ou gerenciado.

## Perguntas para responder sem olhar

::: pergunta
Um Secret do Kubernetes é seguro?
???
O conteúdo é só base64. A segurança vem do RBAC (quem pode ler Secrets no namespace), da criptografia do etcd em repouso e de não colocar o valor no Git ou em values versionados. Em nuvem, o segredo de verdade fica num cofre (Key Vault) e chega ao pod via CSI driver ou SDK, com identidade de workload.
:::

::: pergunta
Você mudou uma variável no ConfigMap e os pods não pegaram o valor novo. Por quê, e como evitar?
???
Variáveis de ambiente são lidas na criação do container; mudar o ConfigMap não reinicia pods. O padrão é colocar um hash da configuração numa anotação do template do pod (checksum/config), para que qualquer mudança gere um rollout controlado pelas probes.
:::

::: pergunta
O que é o advertised listener do Kafka e qual o sintoma de configurá-lo errado?
???
É o endereço que cada broker devolve nos metadados para os clientes falarem com ele depois do bootstrap. Errado (por exemplo, `localhost`), o cliente conecta no bootstrap, recebe os metadados e depois não consegue falar com o broker líder: não produz nem consome, com erros de conexão para um endereço diferente do configurado.
:::

**Próxima:** [4.6 Helm: um chart por serviço](06-helm.md)
