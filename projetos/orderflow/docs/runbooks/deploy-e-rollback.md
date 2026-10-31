# Deploy e rollback

**Tipo:** procedimento  ·  **Dono:** quem fez o merge

O caminho normal é o pipeline `cd` (lição 7.6): merge na main → testes → imagens analisadas → dev
→ aprovação → prod. Este runbook cobre acompanhar um deploy e voltar quando ele dá errado.

## Acompanhar um deploy

```bash
kubectl -n orderflow rollout status deployment/orders     # bloqueia até terminar ou falhar
kubectl -n orderflow get pods -l app.kubernetes.io/name=orders -w
```

Sinais de que vai dar errado, antes de qualquer alerta: pods novos que não ficam `READY`
(readiness falhando), `RESTARTS` subindo, ou logs de erro só dos pods novos (no Loki, filtre pelo atributo
`k8s_pod_name`, que o Collector adiciona a todo sinal).

## Rollback

O pipeline já faz rollback automático quando o rollout não fica saudável em 10 minutos
(`--rollback-on-failure`). Rollback manual é para quando o rollout ficou "saudável" mas o
comportamento está errado (erros de negócio, latência):

```bash
helm -n orderflow history orders --max 10          # ache a última revisão boa
helm -n orderflow rollback orders <revisão> --wait --timeout 5m
```

Por que `helm rollback` e não `kubectl rollout undo`? O `kubectl` volta só o Deployment; ConfigMap,
Service e o resto ficam na versão nova, e o próximo `helm upgrade` desfaria o seu undo. O Helm
volta o release inteiro e registra a volta como uma revisão nova.

## O rollback NÃO volta o banco

Uma migration que já rodou continua aplicada depois do rollback. É por isso que toda migration
do OrderFlow é **compatível com a versão anterior** (expand/contract, lição 7.7): a versão antiga
do código precisa funcionar com o esquema novo. Se um PR quebra essa regra, o rollback deixa de
ser seguro, e o PR precisa dizer isso em destaque e ter um plano de volta próprio.

## Depois do rollback

1. Avise no canal: "orders voltou para a revisão N às HH:MM, motivo X".
2. Reverta o commit na main (`git revert`), ou o próximo merge publica a versão ruim de novo.
3. Abra um issue com o trace/log que mostrou o problema.
