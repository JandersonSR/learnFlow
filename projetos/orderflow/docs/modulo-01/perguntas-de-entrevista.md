# Módulo 1: Perguntas de entrevista

Responda **em voz alta** antes de abrir a resposta. Cronometre: em entrevista, uma boa resposta
cabe em 1 a 2 minutos. As respostas abaixo são o que um sênior diria, não o mínimo para passar.

---

### 1. Explique os tempos de vida da DI no ASP.NET. Qual o risco de misturar?

<details><summary>Resposta</summary>

Singleton: uma instância para a aplicação, precisa ser thread-safe. Scoped: uma por requisição
HTTP, o padrão para serviços de aplicação e `DbContext`. Transient: nova a cada resolução.

O risco é a **dependência cativa**: um singleton que recebe um scoped prende aquela instância para
sempre. Com `DbContext`, isso vira um contexto compartilhado entre threads, com dados
inconsistentes e exceções intermitentes. Em Development o host valida isso na subida e falha;
em Production a validação fica desligada e o bug passa. Regra: dependência com tempo de vida
igual ou maior que quem a recebe. Quando um singleton precisa de algo scoped (ex.: um
BackgroundService que usa `DbContext`), ele cria um escopo com `IServiceScopeFactory`.
</details>

---

### 2. Por que `async` de ponta a ponta? O que acontece se eu usar `.Result`?

<details><summary>Resposta</summary>

`.Result` e `.Wait()` bloqueiam uma thread do thread pool esperando I/O. Sob carga, várias
requisições bloqueiam várias threads; o pool cresce devagar (injeção gradual de threads), as
requisições novas ficam na fila e a latência explode. É o *thread pool starvation*: CPU baixa,
API travada. Em código com contexto de sincronização (UI, ASP.NET antigo), ainda pode dar
deadlock. Async de ponta a ponta libera a thread enquanto espera o I/O. E sempre repasse o
`CancellationToken`, para parar o trabalho quando o cliente desiste ou o pod recebe SIGTERM.
</details>

---

### 3. Como você garante que um `POST` de pagamento não cobra duas vezes?

<details><summary>Resposta</summary>

Idempotency-Key: o cliente gera uma chave única por intenção e manda em todo retry. O servidor
grava a chave de forma **atômica** com o resultado (constraint única no banco, ou
`GetOrAdd` em memória); retry com a mesma chave devolve o resultado original sem reexecutar.
Também guardo um hash do corpo para recusar a mesma chave com payload diferente, e defino um
prazo de expiração para as chaves.

E não paro na borda: o domínio também é idempotente (marcar como pago duas vezes não faz nada),
porque o evento de pagamento pode chegar duplicado pelo Kafka, que entrega *at-least-once*.
Cuidado clássico de implementação: *check-then-act* sem atomicidade cria corrida; testo com
requisições concorrentes de verdade, não uma de cada vez.
</details>

---

### 4. Liveness e readiness: qual a diferença e o que você coloca em cada uma?

<details><summary>Resposta</summary>

Liveness responde "o processo travou?"; se falhar, o Kubernetes reinicia o container. Readiness
responde "posso receber tráfego?"; se falhar, o pod sai do Service sem reiniciar.

Na liveness coloco quase nada: se o processo responde HTTP, está vivo. Nunca dependência
externa: se o Kafka oscila, todas as liveness falham juntas e o Kubernetes reinicia todos os
pods, transformando lentidão em queda total. Na readiness coloco o que impede **este pod** de
atender bem: fila interna cheia, cache ainda aquecendo. Dependência compartilhada na readiness
também exige cuidado, pelo mesmo motivo de falha em massa. Para apps que demoram a subir, uso
startup probe para não matar o pod durante a inicialização.
</details>

---

### 5. O que é o dual write problem e como resolve?

<details><summary>Resposta</summary>

É quando uma operação precisa alterar dois sistemas, por exemplo gravar o pedido no banco e
publicar o evento no Kafka. Não há transação entre os dois: se o processo cai entre uma escrita e
outra, fica inconsistente (pedido salvo sem evento, ou evento publicado sem pedido). Nenhuma ordem
resolve.

A solução padrão é o **Transactional Outbox**: na mesma transação do banco, grava o pedido e uma
linha numa tabela `outbox` com o evento. Um processo separado (polling ou CDC com Debezium) lê a
outbox e publica no Kafka, marcando como enviado. Isso garante *at-least-once* na publicação; por
isso o consumidor precisa ser idempotente. A alternativa é *listen to yourself*: publicar só no
Kafka e o próprio serviço consumir para atualizar o banco, com outros trade-offs de consistência.
</details>

---

### 6. Por que `decimal` e não `double` para dinheiro?

<details><summary>Resposta</summary>

`double` é ponto flutuante binário: valores como 0,1 não têm representação exata, e
`0.1 + 0.2` dá `0.30000000000000004`. Em soma de muitos itens, o erro acumula e o total não fecha
com o meio de pagamento. `decimal` é base 10, com 28 a 29 dígitos significativos, e representa
centavos exatamente. É mais lento, o que é irrelevante perto de uma ida ao banco. No banco, o tipo
equivalente é `numeric(18,2)` (ou mais casas se houver câmbio ou impostos com mais precisão).
</details>

---

### 7. Minimal APIs ou Controllers? Como você decide?

<details><summary>Resposta</summary>

Para serviços novos, Minimal APIs: menos cerimônia, melhor desempenho e, desde o .NET 8, paridade
de recursos para a maior parte dos casos (grupos, filtros, validação nativa no .NET 10,
`TypedResults` que alimentam o OpenAPI). Organizo por recurso em métodos de extensão, não tudo no
`Program.cs`. Controllers fazem sentido em base legada que já os usa (consistência vale mais que
moda) ou quando o time depende de algo específico do MVC. O que não faço é misturar os dois sem
critério no mesmo serviço.
</details>

---

### 8. Um `BackgroundService` lançou exceção. O que acontece?

<details><summary>Resposta</summary>

Desde o .NET 6, o padrão (`BackgroundServiceExceptionBehavior.StopHost`) é encerrar a aplicação
inteira, levando a API junto. Por isso o loop de consumo tem `try/catch` **por mensagem**: a
mensagem ruim é registrada e encaminhada para retry ou dead letter, e o loop continua. O catch
externo trata só o `OperationCanceledException` do desligamento. E o serviço precisa respeitar o
`stoppingToken`, porque o Kubernetes dá 30 segundos entre o SIGTERM e o SIGKILL.
</details>

---

### 9. Por que injetar `TimeProvider` em vez de usar `DateTime.UtcNow`?

<details><summary>Resposta</summary>

Testabilidade e determinismo. Regras com tempo (expiração, prazos, "pedido pendente há mais de 30
minutos é cancelado") viram testes impossíveis ou lentos com o relógio real. Com `TimeProvider`
injetado, o teste passa um relógio falso e avança o tempo quando quer. Também abstrai timers
(`CreateTimer`), o que permite testar retries com backoff sem esperar de verdade.
</details>

---

### 10. (Pergunta de staff) Onde você colocaria a validação neste sistema e por quê?

<details><summary>Resposta</summary>

Em camadas com responsabilidades diferentes. Na borda (DTO), validação de **formato** do
contrato daquela entrada: obrigatórios, tamanhos, faixas; resposta 400 com o caminho do campo. No
**domínio**, invariantes de negócio que valem para qualquer entrada: HTTP, consumer Kafka, job
de migração; respostas 422 ou 409 com código estável. Na **persistência**, as garantias finais que
só o banco dá sob concorrência: constraint única, chave estrangeira, versão para concorrência
otimista. Duplicar uma regra em duas camadas é aceitável quando cada uma protege algo diferente
(ex.: UX na borda e integridade no domínio); o que evito é a regra de negócio só no endpoint,
porque o primeiro consumer de evento vai ignorá-la.
</details>

---

Próximo: [Módulo 1-J: Java 25 e Spring Boot 4](../modulo-01j/README.md)
