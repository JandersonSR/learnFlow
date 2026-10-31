# Módulo 4: Perguntas de entrevista

Responda **em voz alta** antes de abrir. Uma boa resposta cabe em 1 a 2 minutos: decisão, motivo, custo.

## Imagens

::: entrevista
"Como você monta a imagem Docker de uma API .NET para produção?"
???
Multi-stage: SDK só no estágio de build, imagem final com o runtime do ASP.NET numa base mínima, no meu caso Ubuntu chiseled, sem shell e não-root. Copio os `.csproj` antes do código para o restore ter cache próprio, e uso cache montado do BuildKit para os pacotes. Builda com `--platform=$BUILDPLATFORM` e `-a $TARGETARCH` para não emular. `ENTRYPOINT` em forma exec, para o processo ser PID 1 e receber o SIGTERM. E um `.dockerignore` restritivo, para não vazar segredo local para uma camada. O custo da imagem sem shell é o diagnóstico: uso `kubectl debug` com container efêmero.
:::

::: entrevista
"E uma imagem Java? Qual a diferença?"
???
Mesma ideia de multi-stage, com dois cuidados a mais. Extraio as camadas do Spring Boot (dependências, loader, aplicação) para que um deploy só mude alguns KB. E configuro a JVM para o container: ela lê o limite de memória do cgroup, mas o heap padrão é só 25% dele, então uso `MaxRAMPercentage` (75% num serviço comum, menos se houver muita memória nativa) e `ExitOnOutOfMemoryError`. Se não houver limite de CPU, fixo `ActiveProcessorCount`, senão a JVM dimensiona threads para todos os núcleos do nó. Para tamanho e superfície, runtime recortado com jlink sobre distroless, sabendo que o jdeps não vê reflexão e os módulos faltando só aparecem em execução.
:::

::: entrevista
"Um pod Java reinicia com OOMKilled e não há nenhum erro no log. O que você faz?"
???
OOMKilled é o kernel matando o processo por passar do limite de memória do cgroup, com SIGKILL, por isso não há log. Confirmo com `kubectl describe pod` (exit 137, reason OOMKilled). A causa típica é heap grande demais em relação ao limite, sem espaço para metaspace, pilhas de threads, buffers diretos e bibliotecas nativas. Meço com Native Memory Tracking num ambiente de teste e ajusto `MaxRAMPercentage` ou o limite. Diferencio de `OutOfMemoryError` da JVM, que aparece no log e, com `ExitOnOutOfMemoryError`, sai com outro código.
:::

## Kubernetes

::: entrevista
"Explique liveness, readiness e startup probes. O que vai em cada uma?"
???
Startup protege a subida: enquanto não passa, as outras não rodam; dá paciência só para JVM fria ou migrations. Liveness responde "travou?"; falhando, o kubelet reinicia o container, então ela só checa o próprio processo, nunca dependência externa, ou uma lentidão do banco reinicia todos os pods de uma vez. Readiness responde "posso receber tráfego?"; falhando, o pod sai dos endpoints sem reiniciar; ali entram coisas como fila interna cheia ou, com cuidado, dependências essenciais. Também cuido do timeout padrão de 1 segundo, que sob carga gera falsos positivos.
:::

::: entrevista
"Seus deploys geram alguns 502 a cada rollout. Por quê, e como resolve?"
???
Na remoção de um pod, o SIGTERM e a retirada dos endpoints acontecem em paralelo, e kube-proxies e gateway levam alguns segundos para atualizar. A aplicação para de aceitar conexões antes de todos saberem. Resolvo com um preStop que espera alguns segundos antes do SIGTERM (a ação `sleep` nativa, porque minhas imagens não têm `/bin/sleep`), desligamento gracioso na aplicação e `terminationGracePeriodSeconds` maior que preStop + drenagem. E rollout com `maxUnavailable: 0`, para nunca ficar abaixo da capacidade.
:::

::: entrevista
"Requests e limits: como você define? Coloca limite de CPU?"
???
Requests pelo consumo medido em regime normal, porque é o que o scheduler reserva e o que o HPA usa de base. Memória sempre com limite, perto do pico medido com folga, porque memória não é compressível e um vazamento sem limite afeta o nó inteiro. CPU em geral sem limite: o limite é cota por janela de 100 ms e causa throttling, que vira latência com CPU sobrando no nó. Se a política da empresa exige limite, deixo bem acima do request e monitoro as métricas de throttling. E cuido de runtimes que leem o limite para se dimensionar, como a JVM.
:::

::: entrevista
"Pods estão Running, mas o Service não responde. Como você investiga?"
???
Primeiro o EndpointSlice do Service: vazio significa selector que não casa com os labels ou pods que não estão Ready. Depois `targetPort` contra a porta real do container, e um teste de dentro do cluster com um pod temporário, pelo nome DNS completo, para separar problema de Service de problema de DNS ou de NetworkPolicy. Se responde por IP do pod e não pelo Service, é Service ou kube-proxy; se não responde nem pelo pod, é a aplicação ou a porta.
:::

::: entrevista
"Como você gerencia segredos no Kubernetes?"
???
Sabendo que o Secret nativo é só base64: a proteção é RBAC restrito a quem precisa, criptografia do etcd em repouso e nunca versionar valores. Em nuvem, a fonte da verdade é um cofre, como o Key Vault, acessado com identidade de workload federada, sem senha nenhuma no cluster; o valor chega ao pod pelo CSI driver ou pelo SDK. E penso em rotação: variável de ambiente não muda com o pod rodando, então ou a aplicação lê de arquivo, ou a rotação provoca um rollout.
:::

## Helm

::: entrevista
"Um chart por serviço ou um umbrella chart?"
???
Para serviços independentes, um por serviço: deploy e rollback isolados, dono claro, pipeline por serviço. Umbrella reacopla no deploy o que a arquitetura desacoplou. A duplicação de templates eu resolvo com um library chart versionado. Umbrella eu uso quando o conjunto sempre sobe junto, como um ambiente efêmero de demonstração ou um produto de terceiros.
:::

::: entrevista
"Mudei uma configuração no values e os pods não pegaram o valor. Por quê?"
???
O Helm atualizou o ConfigMap, mas variáveis de ambiente só são lidas quando o container nasce, e mudar o ConfigMap não reinicia pods. A solução é um hash da configuração numa anotação do template do pod: muda a configuração, muda o template, e o Deployment faz um rollout normal, protegido pelas probes.
:::

::: entrevista
"Como um deploy com configuração errada não derruba a produção?"
???
Camadas: a aplicação valida a configuração na subida e não sobe se estiver errada; o rollout com `maxUnavailable: 0` só tira um pod antigo quando o novo fica Ready, então o pod quebrado nunca recebe tráfego e os antigos seguem atendendo; e o `helm upgrade --wait --atomic` percebe o timeout e faz rollback sozinho. O resultado é um deploy falho, registrado no histórico, sem impacto no usuário.
:::

**Próximo módulo:** [5: Kafka no Kubernetes](../modulo-05/README.md)
