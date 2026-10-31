# Módulo 3: Perguntas de entrevista

Responda em voz alta antes de abrir. Estas são perguntas de sênior e staff: a resposta esperada inclui
o trade-off, não só a definição.

::: entrevista 1. O que é o dual write problem e como o Transactional Outbox resolve?
???
Uma operação que precisa mudar dois sistemas sem transação entre eles, como gravar o pedido no banco e
publicar no Kafka. Qualquer ordem deixa uma janela: crash entre as duas escritas = pedido sem evento ou
evento sem pedido. O outbox transforma em uma escrita só: o evento vai para uma tabela no mesmo banco, na
mesma transação. Um relay lê a tabela e publica. Publicação vira pelo menos uma vez (crash entre o ack e
marcar como publicado republica), por isso o eventId nasce na outbox e o consumidor deduplica. Como
efeito colateral bom, a API deixa de depender do Kafka para responder.
:::

::: entrevista 2. Como você garante a ordem dos eventos com vários pods rodando o relay?
???
O risco é dois relays pegarem lotes diferentes e publicarem fora de ordem eventos do mesmo agregado.
No OrderFlow, uma advisory lock por transação deixa um relay por vez, e o lote vai em ordem de id. A
ordem de id é de inserção e não de commit, mas, para o mesmo agregado, a concorrência otimista serializa
as transações, então por agregado as duas coincidem. Ao publicar, espero os acks em ordem e marco só o
prefixo que deu certo, com producer idempotente para nada passar à frente na mesma partição. Para
escalar, fatio por hash da chave, uma trava por fatia.
:::

::: entrevista 3. Outbox por polling ou CDC com Debezium?
???
Polling é simples, sem peças novas, latência do intervalo de polling e alguma carga no banco; serve para
a maioria dos casos. CDC lê o WAL, tem latência baixa e quase nenhuma carga, e a ordem é a de commit,
mas traz Kafka Connect, slot de replicação (que segura WAL se o conector parar e pode encher o disco do
banco) e mais coisa para operar. Começo com polling e migro quando volume ou latência pedirem, e quando
o time já operar Kafka Connect.
:::

::: entrevista 4. Como você faz um consumidor idempotente?
???
Primeiro, operações naturalmente idempotentes no domínio (marcar como pago duas vezes não faz nada).
Depois, uma tabela inbox com chave (consumidor, eventId): INSERT ON CONFLICT DO NOTHING na mesma
transação do efeito; se não inseriu, já foi processado. A chave primária resolve a concorrência entre
duas cópias simultâneas, sem SELECT antes. Se o efeito é numa API externa, passo o eventId como chave de
idempotência para ela. E decido onde a duplicata importa: pagamento sim, log não.
:::

::: entrevista 5. Exactly-once no Kafka existe?
???
Existe para Kafka → Kafka: transações do Kafka juntam consumir, produzir e confirmar o offset, e quem lê
com read_committed só vê o que foi confirmado. Kafka Streams usa isso. Quando o efeito sai do Kafka (um
banco, uma API), a transação do Kafka não cobre o outro sistema, e o padrão volta a ser pelo menos uma
vez com consumidor idempotente, que dá o efeito de exatamente uma vez.
:::

::: entrevista 6. Uma mensagem falha no consumer. O que você faz com ela?
???
Depende da natureza. Envenenada (não desserializa, campo obrigatório faltando): DLT na hora, porque
retry travaria a partição para sempre. Transitória (banco fora, timeout): tento sem limite com backoff
exponencial e jitter, sem DLT, porque o problema não é a mensagem; o lag cresce e o alerta avisa. Outra
(bug): poucas tentativas e DLT. A classificação olha a cadeia de causas. No Spring é o DefaultErrorHandler
com exceções não retentáveis e função de backoff; no .NET eu escrevo, e para a transitória longa fecho o
consumer e reabro, para não estourar o max.poll.interval.
:::

::: entrevista 7. Retry bloqueante ou retry topics?
???
Retry topics não travam a partição, mas quebram a ordem por chave: o evento seguinte do mesmo agregado
passa à frente do que está esperando no retry. Para eventos de um agregado, uso bloqueante. Para
mensagens independentes (notificações), retry topics são melhores.
:::

::: entrevista 8. O que você faz com o DLT?
???
Um por grupo consumidor, com bytes originais, mesma chave e headers de origem e erro. Alerta quando
recebe qualquer coisa, porque é sempre bug ou contrato quebrado. Retenção longa. E uma ferramenta de
replay: corrigido o bug, republica no tópico de origem; com consumidor idempotente, republicar é seguro.
DLT sem dono e sem alerta é lixeira.
:::

::: entrevista 9. Explique os modos de compatibilidade do Schema Registry e qual você escolheria.
???
BACKWARD: o schema novo lê dados escritos com o antigo; atualizo os consumidores primeiro. FORWARD: o
antigo lê dados do novo; atualizo o produtor primeiro. FULL: os dois. TRANSITIVE compara com todas as
versões, não só a última, o que importa quando alguém reprocessa dados antigos. Entre serviços de times
diferentes, com deploys independentes e retenção longa, escolho FULL_TRANSITIVE, que na prática limita as
mudanças a acrescentar e remover campos opcionais com default. Renomear vira acrescentar, produzir os dois
por um tempo e remover depois.
:::

::: entrevista 10. Avro, JSON Schema ou Protobuf entre um serviço Java e um .NET?
???
Os três funcionam com o registry. Escolhi Avro no OrderFlow pelas regras de compatibilidade mais
precisas, pelo formato compacto e porque o ecossistema Confluent gira em torno dele; no .NET, o serde de
JSON Schema da Confluent usa Newtonsoft, um segundo comportamento de JSON no serviço. Protobuf seria a
escolha se o time já usasse gRPC. E independente do formato: campos com semântica igual nas duas
linguagens. Mantive dinheiro e datas como texto porque os tipos lógicos do Avro têm suporte diferente no
C# e no Java.
:::

::: entrevista 11. Por que o produtor não deve registrar schemas sozinho?
???
Com auto-registro, o schema do código vai para o registry na primeira mensagem depois do deploy. Se for
incompatível, o erro aparece em produção, no producer. Com registro no pipeline, a checagem de
compatibilidade falha o build antes do deploy, e o producer só procura o id de um schema já aprovado.
:::

::: entrevista 12. Por que testar persistência com Testcontainers e não com banco em memória?
???
Porque o que estou testando é o que o banco garante: índice único, transação, locks, ON CONFLICT, xmin.
Um banco parecido não tem isso, e o teste passa provando que funciona contra algo que não roda em
produção. Deixo os testes de domínio e de contrato sem container, rápidos, e uso containers só onde o
comportamento do banco ou do broker é o objeto do teste.
:::
