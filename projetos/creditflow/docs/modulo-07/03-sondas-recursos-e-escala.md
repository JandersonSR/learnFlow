# 7.3 Sondas, recursos e escala por perfil

As três sondas, `requests` x `limits` e o encerramento sem perder requisição estão explicados na lição [6.3 da Plataforma](../../plataforma-dotnet/docs/modulo-06/03-sondas-e-encerramento.md). A pergunta desta lição é diferente: **a mesma imagem** precisa de sondas e recursos **diferentes** conforme o perfil. Uma API CPU-bound e um consumidor de Kafka quebram de jeitos opostos.

## Revisão em uma tabela

| Sonda | Pergunta | Se falhar | Endpoint no CreditFlow |
|---|---|---|---|
| startup | "Já subiu?" | Espera até o limite; depois reinicia. Segura as outras duas | `/healthz/live` |
| readiness | "Pode receber tráfego?" | Sai dos endpoints do Service. Não reinicia | `/healthz/ready` (dependências do perfil) |
| liveness | "Está travado?" | Reinicia o contêiner | `/healthz/live` (só o processo e o laço de consumo) |

## api-simulacao: CPU-bound

A simulação calcula tabela Price/SAC, IOF e CET por Newton-Raphson. Não espera banco para responder: é CPU pura. Duas decisões saem disso.

**1. Sem limite de CPU.**

```yaml
recursos:
  requests: { cpu: 500m, memory: 256Mi }
  limits: { memory: 512Mi }        # só memória
```

::: conceito Throttling do CFS
O limite de CPU no Linux é aplicado pelo escalonador (CFS) em janelas de 100 ms: com `limits.cpu: 1`, o contêiner pode usar 100 ms de CPU a cada 100 ms, somando todas as threads. Um processo .NET com 8 threads do pool trabalhando em paralelo gasta esses 100 ms em 12,5 ms de relógio e **fica parado** os outros 87,5 ms. A média de CPU parece baixa, e a latência p99 explode.
:::

O `request` continua essencial: é o que o escalonador usa para reservar espaço no nó, e é a **base do HPA** (`averageUtilization: 60` = 60% de 500m). Sem limite, o pod usa a CPU ociosa do nó quando existe, e o request garante o mínimo quando não existe. Memória é diferente: estouro de memória não "espera", ele mata o processo (`OOMKilled`), então o limite de memória fica.

**2. Liveness tolerante.**

```yaml
liveness: { caminho: /healthz/live, periodSeconds: 10, failureThreshold: 6, timeoutSeconds: 5 }
```

::: previsao
Pico de tráfego: os pods do api-simulacao estão a 100% de CPU. Com a liveness padrão (`timeoutSeconds: 1`, `failureThreshold: 3`), o que acontece com o serviço nos próximos dois minutos?
???
O `/healthz/live` entra na mesma fila de CPU que as simulações e passa de 1 s para responder. Três falhas seguidas e o kubelet **reinicia** o contêiner. O tráfego daquele pod vai para os outros, que ficam ainda mais carregados, e falham a liveness também. É a **cascata de reinícios**: a sonda que deveria proteger derruba o serviço justo no pico. Com 5 s de timeout e 6 falhas (1 minuto), um pod lento sobrevive; um pod realmente travado ainda é reiniciado em um minuto.
:::

## worker-pagamentos: o que travar significa para um consumidor

O worker não recebe requisição de usuário. Ele tem Kestrel na 8080 só para as sondas, e **não tem Service** (`servico: false`). Isso muda o papel de cada sonda:

- **readiness** não tira tráfego de ninguém (não há Service). Ela serve ao **rolling update**: com `maxUnavailable: 0`, o Deployment só derruba o pod antigo quando o novo está pronto, e "pronto" para o worker é "entrou no grupo de consumidores".
- **liveness** é a sonda que importa. O processo pode estar vivo com o laço de consumo **travado** (um `await` que nunca volta, um deadlock). O health check com a tag `live` que a Mensageria registra (módulo 6) olha o batimento do laço: se ele não chamou `Consume()` há mais que o limite, a liveness falha e o kubelet reinicia.

```yaml
terminationGracePeriodSeconds: 60
preStopSegundos: 0
```

::: porque 60 segundos para morrer
No SIGTERM, o worker termina a mensagem em processamento, confirma o offset e chama `Close()` no consumidor para sair do grupo **na hora** (módulo 6). Um desembolso pode estar no meio de uma chamada ao gateway PIX com timeout de 30 s. Os 30 s padrão do Kubernetes cortariam no meio. E o `preStop` de 5 s que as APIs têm (para o Endpoint sair do balanceador antes do Kestrel parar) não faz sentido sem Service.
:::

## A pausa antes de parar, sem `sleep`

```yaml
lifecycle:
  preStop:
    sleep:
      seconds: 5
```

O padrão antigo era `exec: { command: ["sleep", "5"] }`. Na imagem chiseled **não existe** `/bin/sleep`: o preStop falharia (o kubelet só registra um evento) e o pod pararia sem a pausa. A ação `sleep` nativa do Kubernetes resolve sem binário nenhum.

## Escala: HPA num perfil, KEDA no outro

| Perfil | Escala por | Por quê |
|---|---|---|
| api-geral | HPA por CPU, 2 a 6 | CRUD com banco; CPU é um sinal razoável |
| api-simulacao | HPA por CPU, 2 a 12, alvo 60% | CPU **é** o trabalho. Alvo mais baixo para sobrar folga enquanto pods novos sobem |
| api-pagamentos | fixo em 2 | Consulta de pouco volume |
| worker-pagamentos | KEDA pelo **lag** do grupo `creditflow-pagamentos`, 1 a 6 | CPU de um consumidor esperando gateway é baixa mesmo com 10 mil mensagens na fila |

::: armadilha O máximo do KEDA e o número de partições
O tópico `creditflow.propostas.v1` tem 6 partições. Num grupo de consumidores, **cada partição tem no máximo um dono**. O sétimo pod entra no grupo e fica sem partição, parado, custando dinheiro. Por isso `maximo: 6` e o comentário no values. Quer escalar além? Aumente as partições primeiro (o Strimzi aceita aumentar, nunca diminuir), sabendo que isso muda o mapeamento chave → partição das mensagens novas.
:::

O KEDA e o HPA são assunto do [módulo 8](../modulo-08/README.md). O que importa aqui é a regra do chart: **com autoescala, o Deployment não declara `replicas`**:

```yaml
spec:
  {{- if eq $tipoEscala "nenhum" }}
  replicas: {{ $p.replicas | default 1 }}
  {{- end }}
```

Se declarasse, cada `helm upgrade` (ou cada sincronização do Argo CD, módulo 11) voltaria o número de réplicas para o valor do Git no meio de um pico.

## PodDisruptionBudget

```yaml
spec:
  minAvailable: 1
  unhealthyPodEvictionPolicy: AlwaysAllow
```

O AKS atualiza nós drenando um de cada vez. O PDB impede que o dreno derrube o último pod pronto de um perfil. `AlwaysAllow` evita o problema oposto: um pod que **já** está quebrado (não pronto) não pode travar a manutenção do nó para sempre esperando ficar saudável.

## Perguntas para responder sem olhar

::: pergunta
Por que o api-simulacao tem `requests.cpu` mas não `limits.cpu`?
???
O limite de CPU vira throttling do CFS e piora a latência de cauda de um trabalho paralelo e CPU-bound. O request continua: reserva espaço no nó e é a base de cálculo do HPA. Memória mantém limite porque estouro de memória mata o processo de qualquer jeito.
:::

::: pergunta
Para que serve a readiness de um worker que não tem Service?
???
Para o rolling update: com `maxUnavailable: 0`, o pod antigo só sai quando o novo está pronto (entrou no grupo e consegue processar). Sem ela, um deploy quebrado derrubaria todos os consumidores.
:::

::: pergunta
Por que o worker-pagamentos tem `maximo: 6` no KEDA?
???
O tópico tem 6 partições; num grupo de consumidores cada partição tem um único dono. Pods além de 6 ficam ociosos.
:::

**Próxima:** [7.4 Migrações como Job](04-migracoes-como-job.md).
