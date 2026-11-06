# Perguntas de entrevista do módulo 12

Responda em voz alta antes de abrir. As de game day, post-mortem e ADR em geral estão nas [perguntas e na lição 12.4 da Plataforma](../../../plataforma-dotnet/docs/modulo-12/04-apresentacao-e-autoavaliacao.md).

::: entrevista
"Como você instrumentaria um sistema .NET novo?"
???
OpenTelemetry com os três sinais por OTLP para um coletor: instrumentação do ASP.NET Core e HttpClient, fontes das bibliotecas que emitem nativamente (Npgsql, MongoDB.Driver), fontes próprias para as jornadas, propagação do contexto em mensageria por cabeçalho W3C, logs com TraceId pelo provedor de logging, recurso com service.name por processo e atributos do Kubernetes. Métricas de negócio com baixa cardinalidade. O coletor roteia para os backends e filtra; a aplicação não conhece backend.
:::

::: entrevista
"Defina um SLO para uma API de simulação de crédito."
???
SLI de disponibilidade: requisições sem 5xx sobre válidas, medidas no servidor (ou no balanceador); SLO de 99,5% em 30 dias. SLI de latência: fração abaixo de um limite que coincide com um bucket do histograma (250 ms), SLO de 99%. Os números saem do que os usuários toleram e do que medimos hoje, e vêm com um acordo do que acontece quando o budget acaba.
:::

::: entrevista
"Por que não alertar quando a taxa de erro passar de 1%?"
???
Porque o limiar não tem relação com o impacto: dispara por picos irrelevantes de madrugada e nunca dispara para um vazamento lento que consome o budget do mês. Alerto pela taxa de queima do budget em duas janelas (14,4x em 1 h e 5 min para página; 6x em 6 h e 30 min para chamado): relevante, rápido para incidentes graves, e resolve logo depois da correção.
:::

::: entrevista
"Como você acompanha uma transação que passa por uma fila?"
???
Propagando o contexto do trace no cabeçalho da mensagem (traceparent W3C) e iniciando o span de consumo como filho desse contexto. O trace mostra a jornada inteira, e o espaço entre o span de publicação e o de consumo é o tempo na fila. Para fluxos de horas ou dias, uso links de span em vez de pai e filho.
:::

::: entrevista
"Seu Prometheus está ficando lento e caro. O que você investiga primeiro?"
???
Cardinalidade: as métricas com mais séries (`topk` por nome de métrica no próprio Prometheus). Quase sempre é um atributo de alta cardinalidade (id, URL em vez de rota, mensagem de erro) numa métrica. Corrijo na origem; no coletor, dá para remover atributos como paliativo. Depois, retenção e janelas das regras de gravação.
:::

::: entrevista
"O Keycloak caiu. O que acontece com o seu sistema?"
???
Tokens já emitidos continuam válidos até expirar, porque a API valida localmente com as chaves públicas em cache; logins e renovações falham. Endpoints públicos seguem funcionando porque a readiness não depende do Keycloak. A mitigação é o Keycloak com duas ou mais instâncias, PDB e banco com HA, e alerta de página para ele sem instância pronta. Não aumento a vida do token para "aguentar" quedas.
:::

::: entrevista
"Conte um incidente que você investigou."
???
Estrutura: contexto em uma frase, sintoma, linha do tempo (o que olhei e o que descartei), o momento em que estanquei, a causa, a correção e as ações do post-mortem, com números (budget consumido, tempo de detecção). No CreditFlow, o cenário do deploy travado é bom: a migração esperando lock, por que a versão antiga seguiu no ar, e o `lock_timeout` que transformou uma queda em um atraso.
:::

::: entrevista
"Cache fora: seu sistema deve cair ou ficar lento?"
???
Ficar lento, quase sempre. Timeout curto no cliente do cache, falha aberta para a fonte, cache em memória local como primeira camada, e proteção contra debandada na fonte. Cair por causa de cache é transformar uma otimização em dependência crítica. A exceção é quando o cache é a fonte de verdade de algo (sessão, rate limit): aí ele precisa da disponibilidade de um banco.
:::

::: entrevista
"Qual decisão do seu projeto você mudaria?"
???
Resposta honesta com custo: por exemplo, a senha do DocumentDB no estado do Terraform (limitação do provider; mitigada com estado só por RBAC; migraria para Entra ID), ou o Kafka no cluster, que foi ótimo para aprender e que, num time sem plantão, eu trocaria por um serviço gerenciado. Mostrar que você sabe o preço das suas decisões vale mais que defender todas.
:::
