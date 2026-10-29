# 8.4 Observabilidade: achar a agulha no palheiro

Um parceiro abre um chamado: "às 14h12 uma consulta deu erro". Com 6 pods, alguns substituídos desde então por um deploy, `kubectl logs` pod por pod não resolve: o pod que respondeu pode nem existir mais. O [nível 7](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/07-observabilidade.md) resolve sem mudar uma linha da API, porque a API já foi escrita para ser observada.

## Os três sinais

| Sinal | Responde | No projeto |
|---|---|---|
| **Logs** | O que aconteceu nesta requisição específica? | Serilog, JSON no stdout, coletado pelo Container Insights para o Log Analytics |
| **Métricas** | Quanto, com que frequência, quão rápido, ao longo do tempo? | OpenTelemetry: métricas do ASP.NET, do HttpClient, do runtime e a `cep.consultas` do módulo |
| **Traces** | Por onde passou esta requisição, e quanto tempo em cada parte? | OpenTelemetry, instrumentando ASP.NET e HttpClient; exportação liga com `OTEL_EXPORTER_OTLP_ENDPOINT` |

## Log que dá para consultar

Do [`ObservabilidadeExtensions.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Agx.SharedKernel.Web/Observabilidade/ObservabilidadeExtensions.cs):

```csharp
.Enrich.FromLogContext()                          // CorrelationId de cada requisição
.Enrich.WithProperty("Servico", nomeDoServico)
.Enrich.WithProperty("Versao", versao)            // qual imagem escreveu a linha
.WriteTo.Console(new RenderedCompactJsonFormatter())
```

Cada linha sai assim (simplificado):

```json
{"@t":"2026-10-28T17:12:03Z","@m":"CEP 01001000 servido com origem Memoria","Cep":"01001000","Origem":"Memoria","CorrelationId":"pedido-778","Servico":"cep-api","Versao":"142"}
```

::: porque Por que JSON no stdout, e não arquivo de log
Em contêiner, o stdout é o contrato: o Kubernetes guarda, e qualquer coletor (Container Insights, Loki, Datadog) lê sem a aplicação saber qual é. Arquivo dentro do contêiner some quando o pod some, e o sistema de arquivos é só leitura (lição 3.3).

E JSON porque cada campo vira consultável. Texto livre ("Consulta do CEP 01001000 servida...") só se busca por expressão regular; com JSON, `where Cep == "01001000"`.

Repare também nos `[LoggerMessage]` do handler: mensagens com **parâmetros nomeados** (`{Cep}`, `{Origem}`) em vez de interpolação de texto. É o que faz `Cep` e `Origem` virarem campos, e não pedaços de uma frase.
:::

## A consulta que resolve o chamado

Do [`consultas.kql`](https://github.com/JandersonSR/aks-step-by-step/blob/main/observabilidade/consultas.kql):

```kusto
ContainerLogV2
| where PodNamespace == "cep" and TimeGenerated > ago(1d)
| extend log = parse_json(LogMessage)
| where tostring(log.CorrelationId) == "pedido-778"
| project TimeGenerated, PodName, Mensagem = tostring(log["@m"]), Excecao = tostring(log["@x"])
| order by TimeGenerated asc
```

::: previsao
O parceiro não sabe o `correlationId` (ele não guardou o cabeçalho de resposta). Ele só sabe "às 14h12, um 503, consultando o CEP 01310100". Escreva, em KQL ou em português, como você acharia a requisição.
???
Filtre pelo que você tem: janela de tempo, rota, status e CEP. Algo como:

```kusto
ContainerLogV2
| where PodNamespace == "cep" and TimeGenerated between (datetime(2026-10-28 17:10) .. datetime(2026-10-28 17:15))
| extend log = parse_json(LogMessage)
| where tostring(log.RequestPath) == "/v1/cep/01310100" and tostring(log.StatusCode) == "503"
| project TimeGenerated, PodName, CorrelationId = tostring(log.CorrelationId)
```

(Repare no fuso: 14h12 em Brasília é 17h12 em UTC, que é como o Log Analytics guarda.)

Com o `CorrelationId` em mãos, a consulta acima traz todas as linhas daquela requisição, inclusive o aviso "Fonte indisponível e CEP sem cache" que explica o 503.

A lição para o contrato: **devolva o `correlationId` no corpo do erro** (o ProblemDetails do projeto faz isso), para o parceiro ter o que informar no chamado.
:::

## Métricas que dizem a saúde do cache

A métrica `cep.consultas`, com as tags `origem` e `camada` ([`CepMetricas.cs`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/CepMetricas.cs)), responde perguntas que log nenhum responde bem:

- **Taxa de acerto do cache** (`HIT` / total): caiu de repente? O Dragonfly pode ter reiniciado.
- **`STALE` subindo**: a fonte (ViaCEP) está fora, e a API está segurando com dado vencido.
- **Camada `fonte` alta**: muitos CEPs novos, ou o cache está sendo esvaziado.

Métrica é barata de guardar e ótima para **alerta** ("STALE acima de 5% por 10 minutos"); log é caro e ótimo para **investigação**. Um alerta por log de erro, como o do nível 7, funciona, mas um alerta por métrica de taxa de erro é mais estável e mais barato.

::: armadilha O custo do log
O Container Insights cobra por GB ingerido. Log em nível `Debug` em produção, ou uma linha por requisição das sondas do Kubernetes (que batem a cada 5 a 10 segundos em cada pod), podem custar mais que o próprio cluster. O projeto já corta: sondas viram nível `Verbose` no log de requisição (e não são gravadas), e o nível padrão é `Information`. Mesmo assim, olhe a ingestão por namespace no workspace no primeiro mês.
:::

## O que falta: traces exportados

O código já gera traces (OpenTelemetry instrumentando ASP.NET e HttpClient), mas ninguém os recebe: o exportador só liga com `OTEL_EXPORTER_OTLP_ENDPOINT`. Com um destino configurado (Application Insights, Grafana Tempo, Jaeger), cada requisição viraria uma linha do tempo: quanto tempo na memória, no banco, no ViaCEP. É o próximo degrau natural quando "a API está lenta" precisar de resposta em minutos.

Para aprofundar, a trilha [Observabilidade na Prática](trilha:vol-13-observabilidade-na-pratica) aqui no learnFlow.

## Perguntas para responder sem olhar

::: pergunta
Por que a API escreve log em JSON no stdout?
???
Stdout é o contrato do contêiner: o Kubernetes guarda e qualquer coletor lê, sem a aplicação depender de onde o log vai parar. JSON faz cada campo (correlação, CEP, status, versão) ser consultável, em vez de texto livre.
:::

::: pergunta
Para que servem log, métrica e trace, cada um?
???
Log: o que aconteceu numa requisição específica (investigação). Métrica: quantidades e tempos agregados ao longo do tempo (painéis e alertas, barato). Trace: o caminho de uma requisição pelos componentes e o tempo em cada um (onde está a lentidão).
:::

::: pergunta
Como achar todas as linhas de log de uma requisição que passou por um pod que já não existe?
???
Com logs centralizados (Container Insights, Log Analytics) e um id de correlação em toda linha: uma consulta pelo `CorrelationId` traz as linhas de qualquer pod, inclusive de pods já substituídos.
:::

**Próxima:** [8.5 Escala e manutenção](05-escala.md).
