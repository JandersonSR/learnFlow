# 8.3 HPA da Simulação: a conta, o behavior e o que protege o pico

O HPA foi apresentado na [lição 8.5 da Plataforma](../../../plataforma-dotnet/docs/modulo-08/05-escala.md). Aqui, a conta exata, os números do CreditFlow e as peças em volta que fazem o HPA funcionar no pico em vez de atrapalhar.

O manifesto desenrolado está em [`deploy/k8s/escala/hpa-api-simulacao.yaml`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/escala/hpa-api-simulacao.yaml); o chart gera o mesmo a partir de `perfis.api-simulacao.autoescala`. **Nunca aplique os dois**: dois HPAs no mesmo Deployment brigam pelo campo `replicas`.

## A conta

::: conceito A fórmula do HPA
```
desejadas = ceil( atuais × (métricaAtual / alvo) )
```
Para CPU com `type: Utilization`, a métrica é a **média do uso dos pods em % do request de CPU**. O HPA ignora a variação se `métricaAtual / alvo` estiver dentro de 10% de 1,0 (tolerância), para não ficar mexendo por ruído.
:::

Com os números do CreditFlow (request 500m, alvo 60%, mín. 2, máx. 12):

| Situação | Uso médio | Conta | Desejadas |
|---|---|---|---|
| Calmo | 150m = 30% | ceil(2 × 30/60) = 1 | **2** (mínimo) |
| Subindo | 330m = 66% | 66/60 = 1,10, no limite da tolerância | 2 (pode ficar) |
| Rajada | 750m = 150% | ceil(2 × 150/60) = 5 | **5** |
| Rajada com 5 pods | 520m = 104% | ceil(5 × 104/60) = 9 | **9** |
| Pico absurdo | 900m = 180% com 9 | ceil(9 × 3) = 27 | **12** (máximo) |

::: porque Uso acima de 100%? Sem limite de CPU
O perfil `api-simulacao` tem `requests.cpu: 500m` e **nenhum** `limits.cpu`. Um pod pode usar 750m se o nó tiver CPU sobrando: a utilização passa de 100% do request. Com limite de CPU, o Linux aplicaria *throttling* (CFS quota) e a latência de cauda explodiria justamente na rajada. O request é a **reserva** (o que o scheduler garante e o que o HPA usa como base); a ausência de limite deixa o pod aproveitar a folga. O preço: um pod barulhento pode roubar CPU dos vizinhos no mesmo nó. Para isso existe o `topologySpread` e, se precisar, um pool de nós só para a Simulação.
:::

::: porque Alvo 60%, e não 80%
Entre o HPA decidir e o pod novo atender passam de 30 s a um minuto (coleta de métrica, scheduler, imagem, subida do .NET, readiness). Nesse tempo, quem aguenta a rajada são os pods que já existem. Com alvo 60%, cada pod tem 40% de folga para absorver o começo do pico. Com 80%, a folga é de 20%, e a latência estoura antes de o reforço chegar. Alvo mais baixo = mais custo em repouso, menos sofrimento no pico. A Simulação é a porta de entrada do funil de vendas: aqui vale pagar.
:::

## O `behavior`: subir rápido, descer devagar

```yaml
behavior:
  scaleUp:
    stabilizationWindowSeconds: 0
    selectPolicy: Max
    policies:
      - { type: Percent, value: 100, periodSeconds: 30 }  # pode dobrar a cada 30 s
      - { type: Pods,    value: 4,   periodSeconds: 30 }  # ou somar 4 a cada 30 s
  scaleDown:
    stabilizationWindowSeconds: 300
    selectPolicy: Max
    policies:
      - { type: Percent, value: 50, periodSeconds: 60 }   # no máximo metade por minuto
```

| Campo | Efeito |
|---|---|
| `scaleUp.stabilizationWindowSeconds: 0` | Usa a recomendação mais recente: reage na hora |
| Duas políticas + `selectPolicy: Max` | Vale a que permitir **mais** pods. Com 2 pods, 100% = +2 e Pods = +4: sobe 4. Com 10 pods, 100% = +10: sobe 10 |
| `scaleDown.stabilizationWindowSeconds: 300` | Usa a **maior** recomendação dos últimos 5 min: só desce se a carga ficou baixa por 5 min |
| `scaleDown` 50% por minuto | De 12 para 2 em ~3 minutos depois da janela, não de uma vez |

::: previsao
A Simulação está com 2 pods e chega uma rajada que, sem limite, pediria 12. Com o `behavior` acima e assumindo que cada pod fica pronto em 40 s, quantos pods estão **atendendo** 30 s, 60 s e 90 s depois de o HPA perceber?
???
- t = 0: decide subir. Política Pods +4 > Percent +2 → **6** pedidos. Os 2 antigos atendem.
- t ≈ 30 s: nova avaliação permite dobrar: 6 → **12** pedidos. Atendendo: ainda **2** (os 4 novos estão subindo).
- t ≈ 40 s: os 4 primeiros prontos: **6** atendendo.
- t ≈ 70 a 80 s: os outros 6 prontos: **12** atendendo (se couberem nos nós).

Durante o primeiro meio minuto, **2 pods** seguram uma rajada de 12. É por isso que o alvo é 60% e o mínimo é 2, e por isso o k6 mede a fase de pico separada (lição 8.5). Se os pods não couberem nos nós, entra o cluster autoscaler, e o tempo vira minutos.
:::

## As peças em volta

### PodDisruptionBudget

```yaml
spec:
  minAvailable: 1
  unhealthyPodEvictionPolicy: AlwaysAllow
```

Protege contra interrupções **voluntárias**: uma atualização do AKS drenando nós, o cluster autoscaler removendo um nó ocioso. Com mínimo 2 no HPA, `minAvailable: 1` sempre permite tirar um pod; o dreno nunca trava. `AlwaysAllow` deixa remover pods que nem ficaram prontos (por exemplo, em crash loop), que senão seguram o dreno contando como "indisponíveis".

::: armadilha PDB no worker com `minAvailable: 1`
O worker pode ter **uma** réplica (KEDA mínimo 1). `minAvailable: 1` com uma réplica significa "nunca pode tirar este pod": a atualização do nó espera para sempre. Por isso o worker usa `maxUnavailable: 1`. Tirar o único worker por alguns segundos é aceitável: o lag acumula no tópico e é drenado quando ele volta, sem perder nada (lab 1 da lição 6.6).
:::

### topologySpreadConstraints

```yaml
- maxSkew: 1
  topologyKey: topology.kubernetes.io/zone
  whenUnsatisfiable: ScheduleAnyway
  matchLabelKeys: [pod-template-hash]
- maxSkew: 1
  topologyKey: kubernetes.io/hostname
  whenUnsatisfiable: ScheduleAnyway
  matchLabelKeys: [pod-template-hash]
```

- **Por zona e por nó**: a queda de uma zona do AKS (ou de um nó) não leva todas as réplicas.
- **`ScheduleAnyway`** (preferência) em vez de `DoNotSchedule` (regra): num cluster de uma zona ou com nós cheios, a regra deixaria pods `Pending` exatamente no pico. Disponibilidade parcial é melhor que pod nenhum.
- **`matchLabelKeys: [pod-template-hash]`**: conta só pods da mesma versão. Sem isso, durante um rolling update os pods antigos (que vão sumir) distorcem a conta e os novos ficam amontoados.

::: checkpoint
No kind, aplique `kubectl apply -k deploy/k8s/escala` (se o chart não estiver gerenciando a escala), rode `k6 run load/simulacao-rajada.js` e, em outro terminal, `kubectl get hpa,pods -n creditflow -w`. Anote quando o HPA mudou de réplicas e confira com a conta desta lição. Se os números não baterem, explique a diferença (tolerância de 10%, tempo de coleta, pods ainda não prontos fora da média).
:::

::: dica Pods que não estão prontos não entram na média
O HPA ignora, na média de CPU, pods que ainda não passaram na readiness (e trata com cuidado os recém-iniciados, cuja CPU de startup do .NET é alta). Uma readiness mentirosa (pronta antes de aquecer caches) faz o HPA calcular com pods que ainda não aguentam carga.
:::

## Perguntas para responder sem olhar

::: pergunta
3 pods da Simulação com uso médio de 900m e request de 500m, alvo 60%. Quantas réplicas o HPA pede?
???
900m / 500m = 180%. ceil(3 × 180 / 60) = 9.
:::

::: pergunta
Por que a Simulação não tem limite de CPU?
???
Limite de CPU vira throttling do CFS no Linux, que faz a latência de cauda explodir sob carga. Sem limite, o pod usa a CPU livre do nó; o request garante a reserva e é a base da conta do HPA.
:::

::: pergunta
Por que `scaleDown` tem janela de 5 minutos e `scaleUp` não tem nenhuma?
???
Subir tarde custa latência e erros para o cliente; descer cedo cria oscilação (cria e mata pods, cada pod novo começa frio). Assimetria deliberada: reação imediata para cima, paciência para baixo.
:::

**Próxima:** [8.4 KEDA do worker](04-keda-worker.md).
