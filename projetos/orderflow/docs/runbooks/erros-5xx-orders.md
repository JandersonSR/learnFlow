# Orders respondendo 5xx acima do orçamento de erro

**Alerta:** `OrdersQueimaRapidaDoOrcamentoDeErro` (ou `...Lenta...`)  ·  **Severidade:** página  ·  **Dono:** time de pedidos

## Impacto

Clientes não conseguem criar, consultar ou cancelar pedidos. Com queima rápida (14x), o
orçamento de erro do mês acaba em cerca de dois dias se nada mudar.

## Primeiros 5 minutos

1. Abra o painel **OrderFlow**, linha *Orders (.NET): RED*. Anote: desde quando, quais rotas
   (`http_route`), se a latência subiu junto.
2. Houve deploy recente? Esta é a pergunta que resolve mais da metade dos casos:
   ```bash
   helm -n orderflow history orders --max 5
   kubectl -n orderflow rollout history deployment/orders
   ```
   Se a subida dos erros coincide com uma revisão nova, **volte primeiro e investigue depois**
   ([deploy e rollback](deploy-e-rollback.md)):
   ```bash
   helm -n orderflow rollback orders <revisão-anterior> --wait --timeout 5m
   ```
3. Avise no canal de incidentes: "Investigando 5xx no Orders desde HH:MM, rollback em andamento / sem deploy recente".

## Diagnóstico

1. **Os pods estão de pé?**
   ```bash
   kubectl -n orderflow get pods -l app.kubernetes.io/name=orders
   kubectl -n orderflow describe pod <pod> | tail -30   # eventos: OOMKilled, probe falhando
   ```
   `CrashLoopBackOff` logo depois de um deploy costuma ser configuração inválida: o
   `ValidateOnStart` derrubou a subida de propósito. O motivo está em `kubectl logs <pod> --previous`.
2. **Qual é o erro?** No Grafana → Explore → Loki:
   ```
   {service_name="orders"} | severity_text=~"(?i)error"
   ```
   Clique no `traceId` de um log para abrir o trace no Tempo e ver ONDE falhou (span vermelho).
3. **É uma dependência?** No trace, o span com erro é do Postgres? Do producer Kafka? Se for o
   banco, confira o painel do Postgres e as conexões; se for o Kafka, veja o
   [runbook de lag](lag-de-consumidor.md) e o estado do cluster:
   `kubectl -n kafka get kafka,kafkanodepool,pods`.
4. **É carga?** RPS bem acima do normal com p99 subindo e erros de timeout: falta capacidade.

## Mitigação

| Causa | Ação | Reversível? |
|---|---|---|
| Deploy ruim | `helm rollback` | sim |
| Carga | `kubectl -n orderflow scale deployment/orders --replicas=<N>` (o HPA/KEDA pode desfazer: ajuste o mínimo nos values) | sim |
| Postgres saturado | reduzir réplicas que abrem conexões demais; escalar o banco (exige aprovação) | parcial |
| Kafka fora | os pedidos continuam sendo gravados no outbox (Módulo 3): **não** desligue o relay; ele drena quando o Kafka voltar | — |

## Quando escalar

Sem causa identificada em 30 minutos, ou se o problema for no Postgres/AKS gerenciado: acione o
plantão de plataforma e abra chamado na Azure.

## Depois

Postmortem sem culpados com a linha do tempo (o histórico do Helm e os traces ajudam a montar).
Se algum passo daqui estava errado ou faltando, corrija este arquivo no mesmo PR do postmortem.
