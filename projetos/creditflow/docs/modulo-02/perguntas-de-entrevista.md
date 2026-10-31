# Perguntas de entrevista do módulo 2

Decisão, motivo, custo. Em voz alta, antes de abrir.

::: entrevista
"Por que você não usa `double` para dinheiro? E onde arredonda?"
???
`double` é binário e não representa 0,1 exatamente; os erros somam e aparecem como centavo sumindo na conciliação. Uso `decimal`, base 10, exato para centavos. Arredondo em pontos escolhidos e escritos: o que vira cobrança (parcela, juros, amortização) em centavos com arredondamento bancário; intermediários com todas as casas; taxas só na apresentação. E a última parcela absorve a sobra, com teste de propriedade garantindo que a soma das amortizações é o principal.
:::

::: entrevista
"Explique Price e SAC para alguém de produto."
???
Price: parcela fixa; no começo quase tudo é juro, no fim quase tudo é amortização. SAC: amortização fixa; a parcela começa maior e cai. A SAC paga menos juros em reais porque devolve o dinheiro mais cedo, com a mesma taxa. A escolha é de fluxo de caixa do cliente, não de "qual é mais barata".
:::

::: entrevista
"O que é CET e como você calcula?"
???
A taxa interna de retorno do fluxo do cliente: recebe o valor liberado (principal menos IOF e tarifas) e paga as parcelas. Não tem fórmula fechada (polinômio de grau n), então uso Newton-Raphson com chute inicial na taxa de juros: converge em três ou quatro iterações. Com guardas: limite de iterações, derivada zero, taxa abaixo de −100%. A norma usa dias/365 no expoente; o projeto usa meses por didática.
:::

::: entrevista
"Como você testou um cálculo financeiro para ter confiança de que está certo?"
???
Três frentes. Valores de referência vindos de uma implementação independente (Python, Decimal, arredondamento explícito) e o CET conferido por um terceiro método (bisseção em float). Propriedades que valem para qualquer entrada (soma das amortizações, saldo zero, tudo em centavos). E casos de borda: taxa zero, limite de 365 dias, prazos e valores que não dividem exato. Testar contra valores gerados pelo próprio código só confirma os erros dele.
:::

::: entrevista
"Por que o seu agregado de simulação é imutável?"
???
Porque é a foto de uma oferta mostrada ao cliente. Mudar qualquer parâmetro é outra simulação. Isso garante que a proposta nasce dos números que o cliente viu, e a leitura do banco não recalcula: o motor pode mudar, a simulação gravada não.
:::

::: entrevista
"Você tem um endpoint público que consome CPU. Como protege?"
???
Rate limit por IP com janela fixa e 429 com `Retry-After`; atrás do Ingress, processando `X-Forwarded-For` só porque o Ingress é a única entrada. O limite é por pod (aceitável para abuso; para cota comercial, contador compartilhado). Guardas no algoritmo (iterações máximas), armazenamento com limite, e o módulo roda num deployment próprio que escala por CPU sem derrubar o resto.
:::

::: entrevista
"A taxa depende do score. E se o cliente revogou o consentimento?"
???
O dado existe, mas não pode ser usado para aquela finalidade (LGPD). A simulação continua, como anônima, na faixa de maior risco. A regra mora em Simulação; Clientes só informa o fato pelo contrato, que nem expõe CPF ou nome.
:::

::: entrevista
"Por que o evento `SimulacaoRealizada` não usa outbox?"
???
É estatística: perder um ocasionalmente não fere regra, e a simulação não tem transação relacional onde a outbox morar. Publico sem esperar o broker e só registro a falha: o Kafka fora não pode virar erro na simulação. Evento que move dinheiro ou estado (ContratoAssinado) vai pela outbox.
:::

::: entrevista
"Qual a diferença entre 2% ao mês e 24% ao ano?"
???
Juros compostos: a anual equivalente de 2% a.m. é `1,02^12 − 1 ≈ 26,82%`. "Vezes 12" subestima, e a diferença cresce com a taxa (4,49% a.m. é cerca de 69% a.a., não 54%).
:::

::: entrevista
"Às 22h em Brasília o servidor está em UTC. Que data de contratação você grava?"
???
A de Brasília: a data do negócio. Em UTC já seria o dia seguinte, e os dias do IOF (e os vencimentos) sairiam errados. O domínio recebe a data pronta; o caso de uso converte a partir de um `TimeProvider`, o que torna o teste determinístico. E a imagem precisa da base de fusos (ou um fallback para UTC−3).
:::
