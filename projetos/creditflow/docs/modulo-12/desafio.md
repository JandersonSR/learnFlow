# Desafio do módulo 12: a jornada sintética

O SLO do desembolso sofre com pouco tráfego (lição 12.2): em dev, e de madrugada em prod, três desembolsos por hora fazem um único atraso parecer catástrofe, e uma hora sem nenhum desembolso não diz se a jornada está funcionando. A saída das empresas grandes: **tráfego sintético**, uma jornada completa executada por um robô em intervalos fixos, medida à parte.

::: desafio O pedido
1. Um `CronJob` (no chart do CreditFlow, desligado por padrão) que, a cada 5 minutos, executa a jornada inteira com um usuário sintético: obtém token (client credentials do `creditflow-testes` em dev, ou um client próprio), cria cliente, simula, propõe, contrata, e espera o desembolso concluir (com prazo).
2. A jornada sintética registra o próprio resultado como métrica (`creditflow_sintetico_jornada_total{etapa, resultado}` e a duração por etapa), sem contaminar as métricas de negócio reais.
3. Um SLO de **disponibilidade da jornada** baseado no sintético (ex.: 99% das execuções concluem em até 7 minutos) e o alerta de queima correspondente.
4. Prove que o sintético detecta os quatro incidentes do game day, e diga em quanto tempo cada um seria detectado.
:::

## Critérios de aceite

- [ ] O CronJob roda com `concurrencyPolicy: Forbid`, `activeDeadlineSeconds`, imagem mínima e sem root (Pod Security `restricted`).
- [ ] O usuário sintético é **marcado** (um claim ou um cabeçalho) e as métricas de negócio da lição 12.1 o excluem; os contratos sintéticos não vão para relatórios financeiros.
- [ ] O desembolso sintético usa o gateway PIX simulado (nunca um gateway real), e você explicou como garantiria isso em prod.
- [ ] Regras de gravação e alerta no chart `deploy/k8s/observabilidade`, passando no `helm template` e com o `PrometheusRule` válido.
- [ ] Uma tabela: incidente do game day × minutos até o alerta do sintético × minutos até o alerta de SLO real.

::: dica Dica 1
A jornada pode ser um script k6 (o projeto já tem `load/`) rodando como Job: o k6 exporta métricas por OTLP ou remote write. Ou um pequeno console .NET usando o mesmo `requests.http` como roteiro. Escolha pelo que dá menos código para manter.
:::

::: dica Dica 2
Para métrica de um processo que vive segundos (um Job), "puxar" não funciona: o Prometheus pode nunca raspar. Empurre: OTLP para o Collector (que já existe) é o caminho natural.
:::

::: solucao Pontos que uma boa solução tem
- k6 com `K6_OTEL_*` (ou o exportador de remote write) apontando para o Collector; atributos `creditflow.sintetico=true`.
- Exclusão: atributo `creditflow.origem=sintetico` nas métricas de negócio (baixa cardinalidade, 2 valores) e as regras de SLO real filtrando `creditflow_origem!="sintetico"`; ou um `client_id` próprio que o código reconhece.
- Em prod, o perfil de contratação do usuário sintético é marcado no cadastro (um CPF de teste reservado) e o adaptador de PIX roteia esses contratos para o simulador. Sem essa garantia **no código**, não rode sintético de contratação em prod: rode só até a simulação.
- Detecção esperada: cenário 1 (worker parado) e 4 (deploy travado não afeta a versão antiga: o sintético NÃO detecta, e isso é correto) mostram o valor e o limite da técnica.
:::
