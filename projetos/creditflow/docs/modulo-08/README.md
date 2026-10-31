# Módulo 8: escalando Simulação e Pagamentos

**Objetivo:** fazer duas partes do monolito escalarem cada uma pelo seu próprio sinal, sem virar microsserviços. A Simulação aguenta uma rajada de 15 vezes o tráfego normal sem que Propostas perceba; o worker de Pagamentos acompanha a fila do Kafka; e você prova os dois com teste de carga que **reprova** quando o objetivo não é atingido. No fim, você sabe dizer com critérios quando um módulo deveria, de fato, virar serviço, e como fazer a extração sem big bang.

HPA, cluster autoscaler, PDB e KEDA foram apresentados na Plataforma .NET ([lição 5.4](../../../plataforma-dotnet/docs/modulo-05/04-keda-e-strimzi.md) e [lição 8.5](../../../plataforma-dotnet/docs/modulo-08/05-escala.md)). Aqui o foco é **decidir e calcular**: qual sinal, quantas réplicas, por que esse teto, e como ler os números do k6.

## O que você vai conseguir fazer no fim

- Explicar por que perfis de execução resolvem o problema de escala sem os custos de microsserviços
- Classificar uma carga como CPU-bound ou I/O-bound com medição, não com intuição
- Calcular as réplicas que o HPA vai pedir e explicar cada campo do `behavior`
- Calcular as réplicas que o KEDA vai pedir a partir do lag e do número de partições
- Rotear por caminho (`/v1/simulacoes`, `/v1/pagamentos`, resto) e explicar a regra do prefixo mais longo
- Rodar k6 em modelo aberto e ler p95, p99, `dropped_iterations` e o tempo até o desembolso
- Listar critérios objetivos para extrair um módulo e o passo a passo da extração (strangler)

## O que você constrói

- Escala por perfil, versão desenrolada: [`deploy/k8s/escala/`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/escala/kustomization.yaml) (HPA, ScaledObject, PDB, topologySpread)
- A mesma configuração no chart: [`deploy/helm/creditflow/values.yaml`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/helm/creditflow/values.yaml) (`perfis.*.autoescala`)
- Testes de carga: [`load/simulacao-rajada.js`](https://github.com/JandersonSR/lending-plataform/blob/main/load/simulacao-rajada.js) e [`load/fluxo-completo.js`](https://github.com/JandersonSR/lending-plataform/blob/main/load/fluxo-completo.js)
- O ADR [`docs/adr/0007-escalar-por-perfil.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0007-escalar-por-perfil.md)

## Pré-requisitos

- Módulo 6 (a saga e o consumidor) e módulo 7 (chart, perfis no cluster, sondas)
- Um cluster com metrics-server e KEDA (o kind do módulo 7 serve; o AKS do módulo 9 também)
- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) instalado na máquina

## Lições

| # | Lição | Tempo |
|---|---|---|
| 8.1 | [Perfis, não microssserviços (ainda)](01-perfis-nao-microsservicos.md) | 40 min |
| 8.2 | [CPU-bound × I/O-bound: escolher o sinal certo](02-cpu-bound-io-bound.md) | 45 min |
| 8.3 | [HPA da Simulação: a conta, o behavior e o que protege o pico](03-hpa-simulacao.md) | 60 min |
| 8.4 | [KEDA do worker: lag, partições e réplicas](04-keda-worker.md) | 60 min |
| 8.5 | [Teste de carga com k6: lendo os números](05-k6-lendo-os-numeros.md) | 75 min |
| 8.6 | [Quando extrair de verdade: critérios e passo a passo](06-quando-extrair.md) | 50 min |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |
| — | [Desafio: a Black Friday do crédito](desafio.md) | 3 a 4 h |

**Tempo estimado do módulo:** 6 a 8 horas, mais o desafio.

## Entregável

Um relatório de uma página com os números do seu teste de carga (antes e depois de um ajuste), e uma apresentação de 20 minutos: **"Por que o CreditFlow ainda não é microsserviços, e o que faria ele virar"**.
