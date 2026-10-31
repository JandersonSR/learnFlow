# Módulo 7: Perguntas de entrevista

Responda **em voz alta** antes de abrir a resposta, em 1 a 2 minutos. As respostas são o que um
sênior diria numa vaga de backend com responsabilidade de operação (o tema da AZ-400 e de toda
entrevista de "você já operou o que construiu?").

::: entrevista
"Um cliente diz que o pedido dele ficou 'pendente' por 20 minutos ontem. Como você investiga num sistema com dois serviços e Kafka?"
???
Começo pelo `orderId`: busco no Tempo o trace com `orderflow.order_id` igual ao dele e vejo a
cascata. Se o trace mostra um vão grande entre o `send orders.events` do Orders e o consumo no
Payments, o tempo foi de fila: olho o lag do consumer group `payments` naquele horário e o que
houve com os pods (deploy, rebalanceamento, mensagem envenenada numa partição). Se o vão está no
span do gateway, é o adquirente. Se não acho o trace, vou ao Loki pelo `OrderId` nos logs
estruturados (o trace pode ter sido amostrado fora), e dali pego o `trace_id`. A chave é que os
três sinais compartilham `trace_id` e `service.name`; sem isso, seriam três buscas sem ligação.
:::

::: entrevista
"Como o contexto de trace atravessa o Kafka entre um serviço .NET e um Java?"
???
Pelo header `traceparent` do W3C Trace Context, gravado nos headers da mensagem. No .NET, o
Confluent.Kafka não é instrumentado de forma estável, então o produtor abre um span PRODUCER e
injeta o contexto com o propagador padrão do OpenTelemetry; no Java, o Spring Kafka faz isso
sozinho com `observation-enabled` no template e no listener, usando W3C por padrão no Micrometer
Tracing. O consumidor extrai o contexto e abre o span como filho. Os dois lados precisam usar o
mesmo formato: um B3 de um lado parte o trace. E testo isso automaticamente, porque trace partido
não gera erro nenhum.
:::

::: entrevista
"Agente Java do OpenTelemetry ou Micrometer? O que você escolheria e por quê?"
???
Depende do que a aplicação é. Para Spring Boot moderno, o starter com Micrometer: versões
gerenciadas pelo Boot, funciona com AOT e imagem nativa, e o ecossistema Spring já é instrumentado
pela API Observation, incluindo a propagação no Kafka. Para um legado com muitas bibliotecas fora
do Spring, ou sem tempo para instrumentar, o agente dá cobertura máxima sem código, ao custo de um
JAR extra cuja versão precisa casar com as bibliotecas. O que eu evito é misturar os dois no mesmo
serviço: spans duplicados e propagação brigando.
:::

::: entrevista
"Como você amostra traces sem perder os que importam?"
???
Em duas camadas. Na origem, `ParentBased(TraceIdRatio)`: só a raiz sorteia e os outros serviços
seguem a flag do `traceparent`, então os traces vêm inteiros. No Collector, tail sampling: depois
que o trace termina, guardo 100% dos com erro e dos lentos, e uma fração do resto. O cuidado do
tail sampling é que todos os spans de um trace precisam chegar ao mesmo Collector; para escalar,
uma camada com o exporter loadbalancing roteia por `traceID`.
:::

::: entrevista
"O que é cardinalidade em métricas, e como você já viu isso dar errado?"
???
O número de séries temporais distintas: cada combinação de valores de label é uma série. Label
com identificador (orderId, userId, URL com id) cria uma série por entidade e estoura a memória
do Prometheus, ou a fatura do SaaS. Eu deixo label só com conjunto fechado (rota como template,
status, resultado) e coloco identificadores em span e log. No Micrometer, isso está até na API:
`highCardinalityKeyValue` vai só para o span.
:::

::: entrevista
"Defina SLO, orçamento de erro e taxa de queima, e diga como alertaria."
???
SLO é o objetivo mensurável, por exemplo 99,5% das requisições sem 5xx em 30 dias. O orçamento é
o que sobra, 0,5%, e serve para decidir quando parar de lançar funcionalidade e cuidar de
estabilidade. A taxa de queima é a velocidade com que o orçamento é gasto, relativa ao aceitável.
Alerto por taxa de queima em duas janelas: 14,4x por 1 hora confirmado por 5 minutos pagina,
porque o mês acaba em dois dias; 6x por 6 horas pagina com menos urgência. Cada alerta tem
runbook; alerta sem ação é ruído.
:::

::: entrevista
"Como seu pipeline se autentica na nuvem? E se alguém alterar o YAML para implantar em produção sem aprovação?"
???
OIDC com credencial federada, sem segredo guardado: o job pede um JWT ao GitHub, e a Azure troca
por um token se o subject bater. O subject inclui o environment, e a identidade de produção só
aceita `environment:prod`, que exige revisor. Se alguém tirar o environment do YAML, o subject
muda e a Azure recusa o token. A proteção está na nuvem, não na atenção de quem revisa o PR.
:::

::: entrevista
"Seu deploy gera alguns 502 a cada rollout, mesmo com readiness configurada. O que está faltando?"
???
Provavelmente o `preStop`. O Kubernetes manda o SIGTERM e tira o pod dos endpoints em paralelo,
e o kube-proxy e o Ingress levam segundos para convergir: a aplicação fecha o socket antes de o
tráfego parar de chegar. Um `preStop` com espera de alguns segundos resolve, com
`terminationGracePeriodSeconds` maior que a espera mais o desligamento gracioso. Em imagem
distroless, uso a ação `sleep` nativa do Kubernetes, porque não há shell para um `exec sleep`.
:::

::: entrevista
"Para que serve um PodDisruptionBudget, se o Deployment já faz rolling update?"
???
O rolling update protege o meu deploy. O PDB protege das interrupções voluntárias que não são
meu deploy: atualização de nós do AKS, cluster autoscaler, `kubectl drain`. Uso `maxUnavailable: 1`.
`minAvailable` igual ao número de réplicas bloqueia o drain e trava a atualização do cluster.
PDB não ajuda em queda de nó; para isso, espalho réplicas por zona.
:::

::: entrevista
"Como você faz uma mudança de esquema de banco num sistema com deploy contínuo?"
???
Expand/contract. Toda migration precisa ser compatível com a versão atual e a anterior do código,
porque elas rodam juntas durante o rolling update e depois de um rollback. Adiciono a coluna
nova, o código escreve nas duas, backfill em lotes, troco a leitura, e só num deploy posterior
removo a antiga. A migration roda uma vez, antes do código, num job, nunca na subida de cada pod.
O mesmo raciocínio vale para contratos de eventos: campo novo opcional, consumidor implantado antes do produtor.
:::

::: entrevista
"O que você coloca num runbook?"
???
Impacto para o cliente, os primeiros cinco minutos para estancar (com os comandos prontos,
incluindo rollback se houve deploy), um diagnóstico em perguntas ordenadas com onde olhar e o que
cada resposta significa, mitigações reversíveis antes das irreversíveis, quando e para quem
escalar, e o que fazer depois. Ele fica no repositório, junto do código, e é testado: comando
errado num runbook às 3h é pior que não ter runbook.
:::
