# 12.4 Game day: quatro incidentes

As regras do game day (a plantonista recebe só o sintoma, anota a linha do tempo, estanca antes de consertar, dicas em níveis) estão na lição [12.1 da Plataforma](../../../plataforma-dotnet/docs/modulo-12/01-game-day.md). Releia antes. Aqui estão quatro cenários do CreditFlow, cada um exercitando uma peça diferente: fila, identidade, cache e banco.

Funciona em dupla (uma facilitadora, uma plantonista, trocando de papel a cada cenário) ou sozinho (prepare o cenário, espere um dia, e só então leia o chamado). Use o kind (lição 7.6) ou o ambiente dev; os comandos abaixo indicam a diferença quando há.

::: armadilha Antes de começar, no ambiente com Argo CD
Com `selfHeal`, o Argo CD **desfaz** em segundos quase toda sabotagem feita com `kubectl`. A facilitadora desliga a sincronização automática **só** da Application envolvida (`kubectl -n argocd patch application <nome> --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'`) e anota para religar no fim. Isso também é aprendizado: descubra, depois, quanto tempo o Argo CD levaria para "curar" cada cenário sozinho.
:::

---

## Cenário 1: "o dinheiro não caiu"

::: desafio O chamado
> "Desde umas 14h, clientes que assinaram contrato não receberam o PIX. O app mostra 'Desembolso em processamento' há mais de meia hora. Contratos assinados antes disso estão normais."

Encontre a causa, devolva o serviço e diga quantos clientes foram afetados.
:::

::: dica Roteiro da facilitadora (a plantonista não abre)
Pause o worker sem apagar nada, pela anotação de pausa do KEDA (o ScaledObject leva o Deployment a 0 réplicas e para de escalar):
```bash
kubectl -n creditflow annotate scaledobject creditflow-worker-pagamentos autoscaling.keda.sh/paused-replicas="0" --overwrite
```
Gere de 10 a 20 contratos assinados (fluxo do desafio do módulo 6) e mande o chamado. Para encerrar: `kubectl -n creditflow annotate scaledobject creditflow-worker-pagamentos autoscaling.keda.sh/paused-replicas-`.
:::

::: dica Dica 1
O alerta `DesembolsoLentoQueimaRapida` deve estar tocando. Qual dos elos da jornada do runbook `slo-desembolso.md` está parado? Olhe o lag do grupo `creditflow-pagamentos`.
:::

::: dica Dica 2
Lag crescendo e **nenhum membro** no grupo. Por que o KEDA não sobe réplicas com o lag alto? Leia o `describe` do ScaledObject inteiro, inclusive as anotações.
:::

::: solucao Debate depois do cenário
- Linha de investigação esperada: SLO do desembolso → painel de lag → `kafka-consumer-groups.sh --describe` sem `CONSUMER-ID` → Deployment com 0 réplicas → ScaledObject com `paused-replicas`.
- **Quantos afetados:** o `LAG` no momento da correção é o número de `ContratoAssinado` esperando; o trace de cada um mostra o buraco entre "publicar" e "consumir".
- Nada se perdeu: os eventos estavam no tópico (retenção de 7 dias). Ao voltar, o KEDA sobe até 6 réplicas pelo lag e drena. Observe o p95 do contrato ao desembolso subir no dashboard e voltar.
- Melhoria para o post-mortem: um alerta para "grupo sem membros com lag > 0" é mais direto que o de lag; e quem pode pausar um ScaledObject em produção?
:::

---

## Cenário 2: "não consigo entrar"

::: desafio O chamado
> "Vários clientes ligando: o login dá erro. Engraçado que eu estava logada no backoffice e continuei trabalhando por um tempo, mas agora também caiu."

Encontre a causa e explique a frase "continuei trabalhando por um tempo".
:::

::: dica Roteiro da facilitadora (a plantonista não abre)
No kind: `kubectl -n keycloak patch keycloak keycloak --type merge -p '{"spec":{"instances":0}}'`. No AKS, desligue antes a sincronização automática da Application `keycloak`. Espere 5 minutos (o tempo de vida do access token do realm) antes de mandar o chamado. Para voltar: `instances` de volta a 1 (ou religue o Argo CD).
:::

::: dica Dica 1
A API está de pé? Teste um endpoint anônimo (`/v1/simulacoes`) e um autenticado com um token recém-obtido. Qual falha e com que status?
:::

::: dica Dica 2
Releia o runbook `keycloak-fora.md`, seção do impacto. O que a API precisa do Keycloak para validar um token que ela já viu? E um token novo?
:::

::: solucao Debate depois do cenário
- A API valida tokens **localmente** com as chaves públicas que já baixou (JWKS em cache): tokens emitidos antes da queda continuam válidos até expirar (5 minutos no realm). Por isso "continuei trabalhando por um tempo". Logins novos e renovação de token precisam do Keycloak: falham.
- O endpoint anônimo da simulação seguiu funcionando, e a **readiness da API não dependia do Keycloak** (decisão do módulo 3): se dependesse, o Kubernetes tiraria todos os pods do Service e a simulação pública cairia junto, sem motivo.
- Melhoria: alerta `KeycloakSemInstanciaPronta` com severidade de página (a jornada inteira para em minutos); e uma pergunta para o post-mortem: aumentar a vida do token para "aguentar" quedas? (Não: token não revogável vivendo mais é risco de segurança. O caminho é o Keycloak com 2+ instâncias e PDB.)
:::

---

## Cenário 3: "a simulação ficou lenta"

::: desafio O chamado
> "O time de marketing reclamou: a calculadora do site está mais lenta desde as 10h. Não dá erro, só demora. Ontem estava ótima."

Encontre a causa. A simulação está quebrada?
:::

::: dica Roteiro da facilitadora (a plantonista não abre)
Bloqueie o acesso da aplicação ao Dragonfly com uma NetworkPolicy (o Cilium do AKS aplica; no kind, só se o CNI do seu kind aplicar NetworkPolicy: confira com um `nc -zv` antes de chamar a plantonista; se não bloquear, use a alternativa no fim deste bloco):
```bash
kubectl -n creditflow-dados apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: game-day-cache }
spec:
  podSelector: { matchLabels: { app: creditflow-cache } }
  policyTypes: [Ingress]
  ingress: []
EOF
```
Gere tráfego de simulação (o laço de `curl` da lição 7.6) por alguns minutos. Para voltar: `kubectl -n creditflow-dados delete networkpolicy game-day-cache`.

Alternativa sem NetworkPolicy: pare o operador (`kubectl -n dragonfly-operator-system scale deploy --all --replicas=0`) e apague o StatefulSet do cache (`kubectl -n creditflow-dados delete statefulset creditflow-cache`). O sintoma é o mesmo; a Dica 2 deixa de valer (os pods somem) e o alerta `DragonflySemPrimario` dispara.
:::

::: dica Dica 1
CPU dos pods do api-simulacao subiu? O HPA escalou? E os spans de uma simulação lenta no Tempo: qual filho demora?
:::

::: dica Dica 2
Os pods do Dragonfly estão `Running` e prontos. "Pronto" diz que o processo responde à sonda do kubelet. Ele responde à aplicação?
:::

::: solucao Debate depois do cenário
- O trace mostra o acesso ao cache esperando o timeout de conexão (`connectTimeout=2000`/`syncTimeout=1000` na connection string) e depois indo à fonte. A API **degrada** (mais lenta) e não falha: é o desenho do módulo 5 (HybridCache com L1 em memória e falha aberta no L2).
- O alerta `DragonflySemPrimario` **não** dispara (os pods estão prontos): só o SLO de latência mostra o problema. Boa discussão: alertar sobre "erros de conexão ao cache" pelo log/métrica do cliente Redis.
- Se a API tivesse respondido 500, seria bug: cache nunca pode derrubar a requisição.
- Diagnóstico de rede no cluster: `kubectl -n creditflow debug -it <pod-api-simulacao> --image=busybox --target=creditflow --profile=restricted -- nc -zv creditflow-cache.creditflow-dados.svc 6379`.
:::

---

## Cenário 4: "o deploy não termina"

::: desafio O chamado
> "Mergeei o PR da 0.1.x (aquele que acrescenta a coluna de canal de origem na proposta) às 15h. São 15h25 e o Argo CD ainda mostra 'Syncing'. A versão antiga está no ar? Posso mergear o próximo?"

Destrave o deploy sem perder dados e responda às duas perguntas.
:::

::: dica Roteiro da facilitadora (a plantonista não abre)
1. Prepare uma versão com `src/Modules/Propostas/.../Sql/002_canal_origem.sql` contendo `ALTER TABLE propostas.propostas ADD COLUMN IF NOT EXISTS canal_origem text;` (rode `deploy/scripts/copiar-artefatos.sh`). No kind, construa a imagem e faça `helm upgrade`; no AKS, faça o fluxo de PR normal.
2. **Antes** do deploy, abra uma transação longa e deixe parada:
```bash
kubectl -n creditflow-dados exec -it postgres-0 -- psql -U postgres -d creditflow
creditflow=# BEGIN; SELECT count(*) FROM propostas.propostas;   -- e não faça mais nada
```
(No AKS, conecte ao Flexible Server por um pod com `psql`. Atenção: o parâmetro `idle_in_transaction_session_timeout=60s` que o Terraform aplica encerra a sessão em 1 minuto; para o cenário, repita o `SELECT` a cada 30 s, simulando um relatório lento.)
3. Faça o deploy e mande o chamado depois de 5 minutos.
:::

::: dica Dica 1
Onde está a sincronização? `kubectl -n argocd get application creditflow-dev -o jsonpath='{.status.operationState.phase}'` e os Jobs no namespace. Leia o log do Job de migrações.
:::

::: dica Dica 2
`lock_timeout`: o `ALTER TABLE` precisa de um lock exclusivo e espera quem tem a tabela aberta. Quem é? O runbook `migracao-travada.md` tem a consulta.
:::

::: solucao Debate depois do cenário
- O Job falha em 30 s por arquivo (`lock_timeout`), o `backoffLimit: 1` tenta de novo e falha; o Argo CD tenta de novo pelo `retry`. Enquanto isso, **a versão antiga continua no ar** (o PreSync roda antes de mexer nos Deployments). Responder isso ao chamado tranquiliza todo mundo.
- Achar o bloqueador: `pg_blocking_pids` mostra a sessão `idle in transaction`. Encerrar essa sessão é aceitável (é uma leitura parada); encerrar uma transação da aplicação no meio de uma escrita, não sem entender.
- Sem o `lock_timeout`, o `ALTER` ficaria na fila **e todas as consultas seguintes à tabela entrariam na fila atrás dele**: a aplicação antiga pararia de responder. O `lock_timeout` troca "derrubar a produção" por "deploy atrasado".
- "Posso mergear o próximo?": não enquanto este não terminar; o próximo PR herdaria o mesmo `002_` pendente e o mesmo bloqueio.
:::

---

## Depois de cada cenário

Para cada um, antes de olhar a solução: linha do tempo (hora, o que olhou, o que concluiu), o momento em que **estancou**, o momento em que **entendeu**, e o que teria encurtado o caminho (um alerta, um painel, uma linha no runbook). Essas notas são a matéria-prima da lição 12.5.

**Próxima:** [12.5 Post-mortem, ADRs e a apresentação ao time](05-post-mortem-adrs-e-apresentacao.md).
