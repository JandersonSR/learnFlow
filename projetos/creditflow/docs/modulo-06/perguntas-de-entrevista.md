# Perguntas de entrevista do módulo 6

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos. Estas perguntas aparecem em entrevistas de sênior e staff em fintechs e bancos digitais, quase sempre com "e se cair no meio?" logo depois.

## Revisão dos módulos anteriores

::: pergunta
Por que os endpoints do CreditFlow pedem policies e não roles? (módulo 3)
???
A policy descreve o caso de uso ("operar pagamentos"); a role, quem é a pessoa. Quando a regra de quem pode mudar, muda num lugar só (`Politicas.cs`), e o endpoint continua igual.
:::

::: pergunta
Por que Pagamentos usa Postgres e não MongoDB? (módulo 4)
???
Porque o módulo depende de transação entre agregado, outbox e inbox, de índice único como regra de negócio (um desembolso por proposta) e de `FOR UPDATE SKIP LOCKED`. Tudo isso é natural no Postgres.
:::

## Mensageria e saga

::: entrevista
"Como você garante que um evento é publicado quando o dado é gravado?"
???
Outbox transacional: o evento vai para uma tabela do mesmo banco, no mesmo `SaveChanges` da mudança. Um relay publica depois, com `acks=all` e produtor idempotente, e marca como publicada. Nada se perde depois do commit; pode haver duplicata se o relay cair entre publicar e marcar, então o consumidor é idempotente. Publicar "depois do commit" num interceptor ou num `try/catch` é dual write com outra roupa.
:::

::: entrevista
"Você tem vários pods rodando o relay. Como evita duplicar e como mantém a ordem?"
???
Duplicar entre relays ao mesmo tempo, o `FOR UPDATE SKIP LOCKED` evita. Ordem, não: dois relays com lotes diferentes podem publicar eventos da mesma chave em paralelo, principalmente com fila acumulada. No CreditFlow cada chave cai numa faixa fixa (hash estável), o relay trava faixas com SKIP LOCKED e publica cada chave em sequência. Medi num protótipo: 913 eventos fora de ordem sem faixas, zero com faixas. Alternativas: relay único com advisory lock (gargalo) ou CDC com Debezium (mais uma peça).
:::

::: entrevista
"Exactly-once existe?"
???
De ponta a ponta com sistemas externos, não. O que existe é "pelo menos uma vez" na entrega com efeito idempotente: inbox na mesma transação do efeito, transições de estado com guarda, chave de idempotência no gateway. O Kafka tem transações e EOS, mas só cobrem leitura-processamento-escrita **dentro** do Kafka; não cobrem o Postgres nem o PSP.
:::

::: entrevista
"Uma mensagem está falhando no seu consumidor. O que você faz?"
???
Classifico. Transitória (banco, timeout, concorrência): repito a mesma mensagem com recuo, sem avançar, para sempre, voltando ao `Consume()` periodicamente para não sair do grupo. Permanente (JSON inválido, versão desconhecida, transição impossível): DLT na hora, com origem e motivo nos cabeçalhos, e sigo. Desconhecida: algumas tentativas e DLT. E alerto em DLT > 0 e no lag, porque DLT que ninguém olha é lixeira.
:::

::: entrevista
"Saga orquestrada ou coreografada?"
???
Depende do número de passos e de compensações cruzadas. Com dois ou três participantes e um fluxo linear, coreografia: cada um reage a eventos, sem peça nova. O custo é o fluxo não estar escrito em lugar nenhum, então mantenho diagrama e trace distribuído. A partir de quatro ou cinco passos, prazos e compensações que dependem umas das outras, orquestrador (MassTransit, Temporal), porque aí o fluxo espalhado vira o problema.
:::

::: entrevista
"O gateway de pagamento deu timeout. O dinheiro saiu?"
???
Não sei, e o sistema tem de ser desenhado assumindo isso. Toda ordem leva chave de idempotência fixa por desembolso; repito com a mesma chave e o PSP devolve a mesma transação. Antes de desistir, consulto o PSP pela chave e, se nada foi processado, cancelo a chave para um envio atrasado ser recusado. Só então compenso. Se nem a consulta responde, não compenso: deixo o consumidor tentar mais tarde e alerto pelo lag. Melhor atrasar do que mentir sobre dinheiro.
:::

::: entrevista
"Por que você não chama a API externa dentro da transação do banco?"
???
Porque a transação seguraria uma conexão do pool e as travas pelo tempo da chamada, que pode ser de segundos num timeout. Com várias réplicas e o gateway lento, o pool esgota e módulos que não têm nada a ver param. Divido: transação curta antes (registra a intenção e a tentativa), chamada externa fora, transação curta depois (registra o resultado), cada parte idempotente.
:::

::: entrevista
"Como você versiona eventos?"
???
Leitor tolerante: o consumidor ignora campos desconhecidos, então acrescentar campo opcional não muda a versão. Mudança que quebra (renomear, remover, mudar tipo ou significado) é um record novo com versão nova, e durante a transição o produtor publica as duas ou os consumidores são atualizados antes. Tipo e versão em cabeçalho, para o consumidor decidir sem desserializar. A chave faz parte da versão do tópico: mudar a chave é tópico novo.
:::

::: entrevista
"Quando você dispensaria a inbox?"
???
Quando o efeito se reconhece pelo estado: uma transição com guarda (`Contratada → Liberada`; se já está `Liberada`, no-op) ou uma criação com chave natural única. A inbox é indispensável quando o efeito não se reconhece: somar, enviar e-mail, chamar sistema externo sem idempotência.
:::

::: entrevista
"Quanto tempo você guarda a inbox?"
???
Mais que a retenção do tópico. Se o tópico guarda 7 dias, a inbox guarda 14: se alguém resetar os offsets do grupo para o início, tudo o que ainda está retido precisa ser reconhecido como processado. Limpo em lotes para não gerar uma transação gigante.
:::

**Próximo módulo:** [Módulo 7: contêiner, Kubernetes e Helm](../modulo-07/README.md).
