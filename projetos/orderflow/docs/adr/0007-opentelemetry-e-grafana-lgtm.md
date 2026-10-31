# 0007. OpenTelemetry nas duas stacks (Micrometer no Java), atrás de um Collector, com Grafana LGTM

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** Janderson, revisão do time

## Contexto

Um pedido atravessa .NET, Kafka e Java. Sem um `trace_id` comum aos três sinais (traces,
métricas, logs) e às duas linguagens, um incidente vira busca manual em logs de dois serviços
(lição 7.1). O backend de observabilidade de produção ainda não está decidido (Grafana Cloud,
Azure Monitor ou próprio), e a instrumentação não pode depender dessa escolha.

## Decisão

- **OpenTelemetry** como padrão de instrumentação e **OTLP** como transporte nos dois serviços.
- No .NET: SDK OTel (`OpenTelemetry.Extensions.Hosting`), instrumentação ASP.NET Core, propagação no
  Kafka escrita no projeto (`KafkaTracing`), porque a instrumentação do Confluent.Kafka ainda é alfa.
- No Java: **`spring-boot-starter-opentelemetry`** (Micrometer Observation + ponte OTel), e **não**
  o agente Java. Propagação no Kafka pelo próprio Spring Kafka (`observation-enabled`).
- Propagação **W3C Trace Context** nos dois lados.
- Os serviços falam só com um **OpenTelemetry Collector** no cluster, que faz tail sampling,
  enriquecimento com metadados do Kubernetes e exporta para o backend: **Grafana LGTM** em dev e
  estudo (imagem `grafana/otel-lgtm`), com o backend de produção sendo uma troca de exporter.

## Alternativas consideradas

- **SDK do fornecedor** (Application Insights SDK, Datadog). Rejeitado: acopla o código das duas
  stacks a um fornecedor; os próprios fornecedores aceitam OTLP.
- **Agente Java do OTel.** Cobertura maior sem código e convenções OTel nos nomes de métricas.
  Rejeitado: o ecossistema Spring do Payments já é instrumentado pela API Observation; o agente
  traria um JAR extra cuja versão precisa casar com as bibliotecas, e atrito com AOT/CDS. Custo
  aceito: métricas HTTP com nomes diferentes entre as stacks (painel documenta), e bibliotecas fora
  do Spring sem instrumentação automática.
- **Serviços exportando direto para o backend**, sem Collector. Menos uma peça. Rejeitado: perde
  tail sampling, espalha credenciais e faz a troca de backend exigir redeploy dos serviços.

## Consequências

- Positivas: trace de ponta a ponta entre linguagens; troca de backend sem tocar nos serviços;
  alertas por SLO a partir das métricas RED e de negócio.
- Negativas: o Collector com tail sampling é uma réplica só (escalar exige a camada de
  loadbalancing); a ponte Logback → OTel só existe em versão alfa; o `KafkaTracing` é código nosso
  para manter; o LGTM em contêiner único **não** é para produção.
- Obrigatório: todo consumidor e produtor Kafka novo propaga contexto, com teste automatizado
  (desafio do Módulo 7); nada de identificador em label de métrica.

## Revisitar quando

- A instrumentação oficial do Confluent.Kafka sair de alfa (trocar o `KafkaTracing` por ela); ou
- o projeto decidir o backend de produção (ADR novo, substituindo só a parte do backend).
