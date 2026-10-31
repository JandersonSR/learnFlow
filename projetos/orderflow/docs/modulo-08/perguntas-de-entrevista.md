# Módulo 8: Perguntas de entrevista

Perguntas de entrevista de sênior avançado, tech lead e staff. Responda em voz alta, 2 minutos no
máximo. A resposta boa aqui quase nunca é "a tecnologia X": é o **critério** que leva a X, e o
número que mudaria a escolha.

::: entrevista
"Microsserviços ou monólito?"
???
Depende de times e de deploy, não de tecnologia. Microsserviço compra autonomia: cada time
implanta e escala o seu sem coordenar com os outros. O preço é rede no meio de toda chamada,
consistência eventual, observabilidade distribuída e operação multiplicada. Com um time só e
domínios ainda mudando, começo por um monólito modular com limites bem definidos (módulos que não
leem as tabelas uns dos outros e conversam por eventos internos); separo um módulo quando um time
diferente passa a ser dono dele, ou quando ele precisa escalar ou implantar num ritmo diferente.
:::

::: entrevista
"Você tem um sistema com dois serviços em linguagens diferentes. Como garante que um não quebra o outro?"
???
O contrato é o formato da mensagem, então ele é verificado na produção e no CI: schema no
registro (Avro, no OrderFlow) com compatibilidade FULL_TRANSITIVE e auto-registro desligado: o
pipeline registra o schema, e uma versão incompatível falha ali, antes de qualquer mensagem.
Mudança compatível: só campo opcional, e o consumidor implanta antes do produtor. Mudança
incompatível vira tópico novo com período de publicação dupla. E observabilidade com o mesmo
padrão de propagação nos dois lados, para que um problema de contrato apareça como um trace com
erro e não como um sumiço.
:::

::: entrevista
"Como você escreve e mantém registros de decisões de arquitetura?"
???
ADRs curtos no repositório, um por decisão cara de desfazer: contexto, decisão, alternativas com
o motivo da rejeição, consequências incluindo as negativas, e um gatilho concreto para revisitar.
Nascem como Proposto num PR e são a pauta da revisão de design; aceitos, não se editam: uma
mudança de ideia é um ADR novo que substitui o antigo, o que preserva o histórico do porquê.
:::

::: entrevista
"Seu sistema precisa crescer 100 vezes. Por onde você começa?"
???
Pelos números, não pelas caixas. Estimo a carga no pico em cada peça (requisições, mensagens,
escritas, bytes por dia) e comparo com o limite de cada uma na configuração atual. O gargalo
costuma não ser o óbvio: no meu projeto, o consumidor chamava um adquirente de 300 ms dentro do
processamento por partição; pela lei de Little, a vazão máxima era partições divididas pela
latência. A primeira mudança foi desacoplar a chamada lenta do consumo. Sharding fica por último,
depois de particionamento por data, réplicas de leitura e cache.
:::

::: entrevista
"Kafka ou uma fila como RabbitMQ ou Service Bus?"
???
A pergunta que decide é se alguém vai ler o passado ou se vários consumidores independentes
precisam do mesmo fato. Se sim, Kafka: log retido, replay, consumidores novos sem tocar no
produtor, ordem por chave. Se a mensagem é trabalho para um destinatário, fila: reentrega, DLQ e
paralelismo livre prontos, gerenciada e barata. Sistemas maduros costumam ter os dois. E admito
quando o meu próprio projeto usa Kafka num volume em que uma fila bastaria.
:::

::: entrevista
"Outbox com polling ou CDC?"
???
Os dois resolvem o dual write. Polling não exige peça nova e falha de forma contida (eventos
atrasam), mas gera carga e bloat no banco e tem latência de polling. CDC tem latência baixa e quase
nenhuma carga, e um conector serve a serviços em linguagens diferentes, mas exige Kafka Connect e
um slot de replicação que, sem consumidor, retém WAL até encher o disco. Começo por polling e
migro quando o polling aparece entre as consultas caras ou quando já existe alguém operando Connect.
:::

::: entrevista
"Como você conduz uma revisão de design?"
???
Documento curto enviado antes, com problema em números, proposta, duas alternativas, modos de falha,
plano de entrega em passos compatíveis e perguntas em aberto. Na reunião, leitura silenciosa no
começo, tempo gasto nas perguntas em aberto e nos comentários de maior impacto, e uma decisão no
fim: aprovado, aprovado com mudanças com dono, ou nova rodada com o que falta. As perguntas que eu
sempre faço: o que acontece quando a dependência cai, quando a mensagem repete, como é o rollback,
qual número quebra isto, e qual a coisa mais simples que resolveria 80%.
:::

::: entrevista
"Você é o único sênior de um time grande. Como evita virar gargalo de code review?"
???
Divido a revisão por risco. Checklist no template de PR (escopo, contrato, concorrência,
operação, segurança, testes), CODEOWNERS com pelo menos dois donos por área, e prefixos nos
comentários (bloqueante, sugestão, nit) para o autor saber o que impede o merge. Reservo a minha
revisão para contratos e concorrência, onde ela vale mais, e peço que júniors revisem o meu código:
aprendem lendo e às vezes acham o bug. O indicador é o tempo de PR esperando revisão.
:::

::: entrevista
"Conte uma decisão técnica sua que estava errada."
???
(Use a sua; o modelo é este.) No meu sistema de pagamentos, a idempotência garantia um registro
por chave, e um teste de estresse com 50 requisições simultâneas mostrou que o adquirente era
chamado até 50 vezes: a verificação acontecia antes, mas a chamada externa não estava protegida. O
erro foi tratar idempotência como propriedade do banco, e não do efeito. Corrigi reservando a chave
antes da chamada externa e repassando a chave ao adquirente, e passei a contar efeitos externos nos
testes de concorrência, não só registros.
:::

::: entrevista
"Como você mede se uma arquitetura está funcionando, depois de entregue?"
???
Por SLOs ligados ao cliente (taxa de sucesso e latência dos fluxos que importam), pela frequência
de deploy e taxa de falha de mudança, pelo tempo de recuperação nos incidentes, e pelo custo por
transação. E por um sinal humano: quantas pessoas além de mim conseguem diagnosticar um problema
sozinhas com o painel e o runbook. Se só eu consigo, a arquitetura não está entregue.
:::
