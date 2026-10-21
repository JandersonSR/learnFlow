# Módulo 1-J: Perguntas de entrevista (Java / Spring)

Responda em voz alta antes de abrir. Em vaga Java, estas aparecem quase sempre; as últimas são de
nível staff.

---

### 1. Qual o escopo padrão de um bean no Spring e que cuidado isso exige?

<details><summary>Resposta</summary>

Singleton: uma instância por contexto, compartilhada por todas as requisições, em várias threads ao
mesmo tempo. Então o bean não pode guardar estado de requisição em campo; estado por requisição vive
em variáveis locais e parâmetros. Todo campo deve ser `final` e apontar para algo imutável ou
thread-safe. Existem `@RequestScope` e `prototype`, mas são exceção. Para quem vem do .NET é o
inverso do costume, em que o serviço de aplicação é Scoped. E um bean singleton que precisa de algo
com escopo menor recebe um `ObjectProvider<T>` (ou um proxy de escopo) em vez da instância direta,
pelo mesmo motivo da dependência cativa do .NET.
</details>

---

### 2. Threads virtuais substituem programação reativa (WebFlux)?

<details><summary>Resposta</summary>

Para o caso mais comum, serviços que passam a maior parte do tempo esperando I/O, sim: dão
escalabilidade parecida com código síncrono simples, fácil de ler, depurar e com stack trace normal.
Reativo ainda faz sentido para streaming com backpressure de ponta a ponta (ex.: servidor de eventos
via SSE com milhares de conexões longas) ou base de código que já é reativa. Threads virtuais não
ajudam em trabalho de CPU e não removem limites de recursos: o pool de conexões do banco continua
sendo o gargalo, então limito concorrência com `Semaphore`, não com pool pequeno de threads. Cuidados:
pinning (código nativo; `synchronized` deixou de fixar a partir do Java 24) e `ThreadLocal` pesado.
</details>

---

### 3. `equals`, `hashCode` e `==`: qual a relação? E o `BigDecimal`?

<details><summary>Resposta</summary>

`==` compara referência; `equals` compara valor conforme a classe define. O contrato: se `a.equals(b)`,
então `a.hashCode() == b.hashCode()`; quebrar isso faz `HashMap` e `HashSet` perderem elementos.
Records geram os dois corretamente. Pegadinha clássica: `Integer` entre -128 e 127 vem de cache, então
`==` "funciona" no teste com valores pequenos e falha em produção. No `BigDecimal`, `equals` compara
valor **e escala** (`10.0` ≠ `10.00`), então para comparar valor uso `compareTo`, e evito `BigDecimal`
como chave de `HashMap` sem normalizar a escala. E construo sempre a partir de `String`, nunca de
`double`.
</details>

---

### 4. Exceções verificadas: você usa? Como trata `InterruptedException`?

<details><summary>Resposta</summary>

Para regra de negócio e erros de infraestrutura uso unchecked, como o próprio Spring faz: checked
espalha `throws` por todas as camadas e não combina com lambdas e streams. Checked faz sentido
quando o chamador realmente pode e deve se recuperar, o que é raro. `InterruptedException` nunca
engulo: restauro a flag com `Thread.currentThread().interrupt()` e então encerro a tarefa ou converto
para unchecked. Engolir a interrupção impede o shutdown gracioso de parar a thread, e no Kubernetes
isso vira SIGKILL depois do prazo.
</details>

---

### 5. Como o Spring sabe validar o corpo da requisição? Qual o erro comum?

<details><summary>Resposta</summary>

Com o starter de validation no classpath, o Spring MVC aplica Bean Validation (Hibernate Validator)
nos parâmetros anotados com `@Valid` (ou `@Validated`). O erro comum é esquecer o `@Valid`: as
anotações do DTO ficam lá e nada é validado. Outro é validar só no DTO e esquecer o domínio, e o
primeiro consumer de Kafka passa por cima das regras. Também sobrescrevo o tratamento de
`MethodArgumentNotValidException` para devolver ProblemDetail com os erros por campo, porque o padrão
não diz quais campos falharam.
</details>

---

### 6. `@Transactional` não funcionou. O que você investiga?

<details><summary>Resposta</summary>

`@Transactional` funciona por proxy. As causas clássicas: chamada interna (`this.metodo()`) não passa
pelo proxy; método `private` (ou `final`) não é interceptado; exceção verificada não faz rollback por
padrão (só `RuntimeException` e `Error`, a não ser com `rollbackFor`); a exceção foi capturada dentro
do método; ou a classe não é um bean do Spring (foi criada com `new`). Também confiro a propagação:
uma `REQUIRES_NEW` interna comita mesmo se a externa der rollback. E num serviço com eventos, lembro
que transação do banco não cobre a publicação no Kafka: o dual write problem, resolvido com outbox.
</details>

---

### 7. Como você garante que um pagamento não seja cobrado duas vezes?

<details><summary>Resposta</summary>

Em camadas. O cliente manda `Idempotency-Key`. O serviço **reserva** a chave de forma atômica antes de
qualquer efeito colateral (constraint única no banco, status `IN_PROGRESS`), e só quem ganhou a
reserva chama o adquirente; os outros esperam o resultado ou recebem "em andamento". A mesma chave vai
para o adquirente, que deduplica do lado dele, cobrindo o caso de o nosso processo morrer no meio da
chamada. Guardo o hash do corpo para recusar a mesma chave com payload diferente, e tenho um processo
de reconciliação para chaves presas em `IN_PROGRESS`. Erro comum que já vi acontecer num teste:
checar se a chave existe e só gravar depois da chamada; com 50 requisições concorrentes, todas passam
pela checagem e o gateway é chamado 50 vezes, embora só um pagamento seja gravado.
</details>

---

### 8. (Staff) Dois serviços em linguagens diferentes trocam eventos. Como evitar que um quebre o outro?

<details><summary>Resposta</summary>

O contrato é a mensagem, não uma classe compartilhada: nada de biblioteca "comum" com DTOs entre
Java e .NET, porque isso acopla o deploy. Defino o esquema explicitamente (Avro ou Protobuf com Schema
Registry, ou JSON Schema) com regra de compatibilidade (normalmente `BACKWARD`): campo novo é opcional
com default, campo não é removido nem renomeado sem versão nova. O produtor valida contra o registro
antes de publicar, e o CI roda teste de contrato. Padronizo também o que fica fora do payload:
chave da mensagem (`orderId`, para ordem por pedido), headers de correlação e tracing, formato de
data (ISO-8601 UTC) e dinheiro (string decimal ou centavos inteiros, nunca float). E o consumidor é
tolerante: ignora campos desconhecidos.
</details>

---

### 9. (Staff) Java ou .NET para um serviço novo? Como você decide?

<details><summary>Resposta</summary>

Tecnicamente, para um backend de API e eventos, as duas plataformas são equivalentes em desempenho
e maturidade; não decido por benchmark. Decido pelo que custa mais no longo prazo: quem vai manter (o
que o time domina e o que o mercado local contrata), o que o resto da empresa usa (bibliotecas
internas, observabilidade, CI, padrões de segurança), e o ecossistema específico do problema (por
exemplo, Kafka Streams só existe na JVM; integração forte com Azure e Microsoft favorece .NET).
Adicionar uma linguagem nova custa caro em pipelines, imagens base, patches e plantão; então a
pergunta real é "o ganho paga esse custo?". Registro a decisão num ADR.
</details>

---

### 10. Explique o ciclo de vida de desligamento de um serviço Spring no Kubernetes.

<details><summary>Resposta</summary>

O Kubernetes marca o pod como terminando, remove do Service (de forma assíncrona) e envia SIGTERM.
O Spring inicia o shutdown gracioso: o readiness vai para `REFUSING_TRAFFIC`, o Tomcat para de
aceitar conexões novas e espera as requisições em andamento até `timeout-per-shutdown-phase`; depois os
beans são destruídos (`destroyMethod`, `@PreDestroy`, `SmartLifecycle.stop`), o que no nosso caso para o
worker. Tudo precisa caber no `terminationGracePeriodSeconds` (30 s por padrão), senão vem o SIGKILL.
Como a remoção do Service não é instantânea, costumo pôr um `preStop` com um `sleep` curto para não
perder requisições que ainda chegam ao pod nos primeiros segundos.
</details>
