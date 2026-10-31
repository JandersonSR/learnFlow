# Desafio do módulo 8: a Black Friday do crédito

::: desafio Preparar o CreditFlow para uma campanha, sem roteiro
O marketing vai anunciar uma taxa promocional na TV, sexta-feira às 20h30, por 2 horas. Previsão: 40 vezes o tráfego normal de simulações no primeiro minuto, depois 10 vezes; e 5 vezes o número normal de contratos assinados na hora seguinte. Você tem a semana para preparar.

**Critérios de aceite**

1. **Linha de base medida**: `load/simulacao-rajada.js` e `load/fluxo-completo.js` rodados no estado atual, com p50/p95/p99 da simulação (separando a fase de pico) e de `tempo_ate_desembolso`, maior lag do grupo `creditflow-pagamentos` e número máximo de réplicas atingido.
2. **Um cenário de k6 novo** que reproduz a previsão (40× por 1 minuto, 10× por 2 horas comprimidas em 10 minutos) e **reprova** com os SLOs: p95 da simulação no pico < 800 ms, erro < 1%, p95 de `tempo_ate_desembolso` < 30 s.
3. **Mudanças de configuração** (sem mudar código de negócio) que façam o cenário passar. Pelo menos uma tem de ser **por horário** (um ScaledObject com scaler `cron`, ou um mínimo maior agendado) e você tem de justificar por que só alvo/máximo não bastam.
4. **A conta das conexões**: tabela com réplicas máximas × pool por perfil contra o `max_connections` do SKU do Postgres que o Terraform do módulo 9 usa (confira o valor na documentação da Azure). Se não couber, proponha a correção.
5. **O teto do worker**: se 6 réplicas não bastarem para o p95 de `tempo_ate_desembolso`, diga se a solução é mais partições, mais vazão por réplica ou nenhuma das duas (gateway como gargalo), com números.
6. **Plano de reversão**: o que você desfaz no sábado de manhã, e como confirma que desfez.
7. Relatório de uma página: antes × depois, com os números do item 1 e do cenário novo.

**Não vale:** subir o rate limit da Simulação para "infinito" em produção para o teste passar; desligar thresholds; medir só a média.
:::

::: dica Por onde começar
Comece pela fórmula, não pelo YAML. Para 40× no primeiro minuto, quanto de CPU a Simulação precisa (meça o custo por simulação na linha de base)? Quantos pods isso dá com o request atual? Quanto tempo eles levam para ficar prontos? O que segura o tráfego até lá? A resposta ao "o que segura" é quase sempre "pods que já estavam lá", e é aí que o scaler por horário entra.
:::

::: solucao Uma resposta possível (abra só depois de entregar)
- **Simulação**: um ScaledObject com dois triggers, `cpu` (alvo 60%) e `cron` (`start: 30 20 * * 5`, `end: 30 22 * * 5`, `desiredReplicas: "10"`, fuso `America/Sao_Paulo`). O KEDA usa o maior dos dois: às 20h30 já existem 10 pods prontos, e a CPU sobe a partir daí. Só alvo/máximo não bastam porque a rajada de 40× chega antes de qualquer pod novo ficar pronto (lição 8.3: ~40 s a 1 min, minutos se faltar nó). Ao trocar o HPA pelo ScaledObject, remova o HPA do chart para esse perfil: dois donos do mesmo Deployment brigam.
- **Nós**: o mínimo do pool de nós do AKS também precisa subir antes (o cluster autoscaler leva minutos); 10 pods × 500m = 5 vCPU só para a Simulação.
- **Worker**: 5× os contratos com ~350 ms por desembolso pede ~1,5 réplica em regime; 6 réplicas sobram. Se o p95 estourar, olhe o gateway: com 6 réplicas o lag deveria zerar; se não zera, o gargalo é a dependência, não a escala.
- **Conexões**: o pool padrão de 40 × (12 + 6 + 6 + 2) passa de 1.000; um Flexible Server pequeno não aguenta. Correção: pools por perfil (Simulação não usa Postgres; worker com 10), e o PgBouncer integrado em modo transação.
- **Reversão**: o trigger cron se desfaz sozinho às 22h30; o mínimo do pool de nós é revertido no Terraform no sábado; confirmação por `kubectl get scaledobject,hpa` e pela conta de nós no portal.
:::
