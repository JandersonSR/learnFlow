# Módulo 12: operação: OpenTelemetry, SLOs, game day e a apresentação ao time

**Objetivo:** operar o CreditFlow como um sistema de produção. Você instrumenta as jornadas de crédito com OpenTelemetry (traces que atravessam o Kafka, métricas de negócio, logs correlacionados), define **SLOs** da simulação e do desembolso com **error budget**, alerta pela taxa de queima do budget (e não por "CPU acima de 80%"), escreve os runbooks, quebra o sistema de propósito num **game day com quatro incidentes**, escreve o post-mortem e defende as decisões do projeto em ADRs e numa apresentação ao time.

## O que você vai conseguir fazer no fim

- Ler o `AddObservabilidade` e dizer de onde vem cada span, cada métrica e cada log, e por onde eles chegam ao Grafana
- Seguir uma proposta do `ContratoAssinado` ao `DesembolsoConcluido` num único trace, através do Kafka
- Escrever um SLO com SLI, objetivo e janela, calcular o error budget e explicar por que o limite de latência precisa coincidir com um bucket do histograma
- Explicar o alerta de queima em duas janelas (14,4x e 6x) e por que ele é melhor que um limite fixo de taxa de erro
- Conduzir um game day com Kafka com lag, Keycloak fora, Dragonfly fora e migração travando, e escrever o post-mortem sem culpados
- Apresentar a arquitetura do CreditFlow a um time em 20 minutos, defendendo cada decisão com custo e alternativa

## O que você constrói

- [`src/BuildingBlocks/CreditFlow.BuildingBlocks/Observabilidade/`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Observabilidade/ObservabilidadeExtensions.cs): `AddObservabilidade`, `Telemetria` e `MetricasDeCredito`
- O chart [`deploy/k8s/observabilidade/`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/observabilidade/templates/regras-slo.yaml): regras de SLO, alertas de causa e o dashboard; valores do OTel Collector, kube-prometheus-stack, Loki e Tempo em `valores/`
- Os runbooks em [`docs/runbooks/`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/runbooks/kafka-lag.md)
- As ADRs 0008 a 0011 e o seu post-mortem do game day

## Pré-requisitos

- Módulo 11 (o ambiente dev sincronizado pelo Argo CD) ou o laboratório do kind (lição 7.6, com o `otel-lgtm`)
- A base: [observabilidade (8.4)](../../../plataforma-dotnet/docs/modulo-08/04-observabilidade.md), [game day (12.1)](../../../plataforma-dotnet/docs/modulo-12/01-game-day.md), [post-mortem (12.2)](../../../plataforma-dotnet/docs/modulo-12/02-post-mortem.md), [ADRs (12.3)](../../../plataforma-dotnet/docs/modulo-12/03-adrs.md) e [apresentação (12.4)](../../../plataforma-dotnet/docs/modulo-12/04-apresentacao-e-autoavaliacao.md) da Plataforma. Os formatos de post-mortem e de ADR são os de lá; aqui aplicamos num sistema com fila, identidade e cache

## Lições

| # | Lição | Tempo |
|---|---|---|
| 12.1 | [OpenTelemetry nas jornadas de crédito](01-opentelemetry-nas-jornadas.md) | 75 min |
| 12.2 | [SLOs da simulação e do desembolso, e o error budget](02-slos-e-error-budget.md) | 60 min |
| 12.3 | [Alertas que acordam a pessoa certa, e runbooks](03-alertas-e-runbooks.md) | 45 min |
| 12.4 | [Game day: quatro incidentes](04-game-day.md) | 3–4 h |
| 12.5 | [Post-mortem, ADRs e a apresentação ao time](05-post-mortem-adrs-e-apresentacao.md) | 2 h |
| — | [Desafio do módulo](desafio.md) | 3 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 40 min |

Tempo estimado: **12 a 14 horas**, contando o game day e o desafio.

## Entregável do módulo (e do curso)

Um post-mortem de um dos incidentes do game day, as quatro ADRs do módulo revisadas por você (concordando ou discordando, com motivo), e a gravação de uma apresentação de 20 minutos da arquitetura do CreditFlow.
