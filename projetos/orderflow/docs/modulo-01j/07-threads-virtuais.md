# 1J.7 Threads virtuais: o "async/await" do Java

Arquivos: `application.yml` (`spring.threads.virtual.enabled`), `infrastructure/PaymentEventsWorker.java`,
`infrastructure/QueuePaymentEventPublisher.java`

## O problema que async/await e threads virtuais resolvem

Uma requisição típica passa 95% do tempo **esperando**: banco, Kafka, adquirente. Com uma thread do
sistema operacional (thread de plataforma) por requisição, cada espera segura uma thread de ~1 MB de
pilha. Com 200 threads no pool, a requisição 201 fica na fila, mesmo com a CPU parada.

As duas plataformas resolveram isso de jeitos diferentes:

| | .NET | Java 21+ |
|---|---|---|
| Solução | `async/await`: o compilador transforma o método numa máquina de estados que **libera a thread** no `await` | **threads virtuais**: a JVM desmonta a thread virtual da thread real quando ela bloqueia em I/O |
| Como o código fica | `async Task<X>`, `await` em toda a cadeia ("contamina" as assinaturas) | código **síncrono normal**: `queue.put()`, `jdbc.query()`, `httpClient.send()` |
| Erro clássico | `.Result` / `.Wait()` → thread pool starvation | fixar a thread virtual numa thread real (ver abaixo) |

## Medido, não decorado

Na máquina onde este curso foi montado (2 núcleos), 10.000 tarefas que "esperam I/O" por 100 ms cada:

```
plataforma (pool de 200): 10000 tarefas de 100 ms de I/O simulado em 5199 ms
virtual (uma por tarefa): 10000 tarefas de 100 ms de I/O simulado em  189 ms
```

Com 200 threads, só 200 tarefas esperam ao mesmo tempo: 10.000 / 200 × 100 ms ≈ 5 s. Com threads
virtuais, as 10.000 esperam juntas. O código das tarefas é **idêntico** nos dois casos. Rode você mesmo:

```java
// Vt.java  →  java Vt.java
import java.time.*; import java.util.concurrent.*; import java.util.stream.*;
void main() throws Exception {
    int tasks = 10_000;
    for (String kind : new String[] {"plataforma (pool de 200)", "virtual (uma por tarefa)"}) {
        long t0 = System.nanoTime();
        try (ExecutorService ex = kind.startsWith("plat") ? Executors.newFixedThreadPool(200) : Executors.newVirtualThreadPerTaskExecutor()) {
            IntStream.range(0, tasks).forEach(i -> ex.submit(() -> { Thread.sleep(Duration.ofMillis(100)); return i; }));
        }
        IO.println("%s: %d tarefas de 100 ms de I/O simulado em %d ms".formatted(kind, tasks, (System.nanoTime() - t0) / 1_000_000));
    }
}
```

**Threads virtuais não deixam código mais rápido.** Elas deixam você esperar por mais coisas ao mesmo
tempo. Para trabalho de CPU (calcular hash, comprimir imagem) não ajudam em nada.

## Ligando no Spring

```yaml
spring:
  threads:
    virtual:
      enabled: true
```

Com isso, o Tomcat atende cada requisição numa thread virtual, e `@Async` e os schedulers também
passam a usá-las. O controller e o serviço continuam escritos de forma síncrona.

## Os cuidados

1. **Pinning (fixação).** Se a thread virtual bloquear num ponto em que a JVM não consegue
   desmontá-la, ela segura a thread real. Até o Java 23, o caso famoso era bloquear dentro de um bloco
   `synchronized`. **A partir do Java 24 (JEP 491) isso foi resolvido**, e no Java 25 `synchronized` não
   fixa mais. Ainda fixam: código nativo (JNI) e alguns drivers antigos. Diagnóstico: o evento JFR
   `jdk.VirtualThreadPinned`.
2. **Não crie pool de threads virtuais.** Elas são baratas; crie uma por tarefa
   (`Executors.newVirtualThreadPerTaskExecutor()`). Para limitar acesso a um recurso (ex.: no máximo
   20 conexões ao adquirente), use um `Semaphore`, não um pool pequeno.
3. **Cuidado com `ThreadLocal` pesado.** Com milhões de threads, um cache por thread vira milhões de
   caches. Para passar contexto (id de correlação, usuário), o Java 25 trouxe **Scoped Values**
   (JEP 506), a alternativa moderna e imutável.
4. **O pool de conexões continua sendo o limite.** 10.000 requisições simultâneas com um pool de 10
   conexões de banco = 9.990 esperando o pool. Threads virtuais mudam onde está o gargalo; não o eliminam.

## Cancelamento: interrupção no lugar do `CancellationToken`

Java não passa token de cancelamento por parâmetro. Cancelar uma thread é **interrompê-la**
(`thread.interrupt()`). Métodos bloqueantes (`queue.poll`, `Thread.sleep`, I/O) lançam
`InterruptedException` quando isso acontece. É assim que o `PaymentEventsWorker.stop()` acorda o loop:

```java
running = false;
thread.interrupt();                      // o poll() lança InterruptedException
thread.join(shutdownTimeout.toMillis()); // espera, com prazo
```

E por isso a regra da lição 1J.2: **nunca engula `InterruptedException`**. Quem engole quebra o
desligamento da aplicação inteira.

## O worker em detalhe

Compare com o `OrderEventsWorker` do .NET (lição 1.7):

| Cuidado | .NET | Java |
|---|---|---|
| loop de longa duração | `BackgroundService.ExecuteAsync` | thread virtual criada no `start()` |
| desligamento | `stoppingToken` | `running = false` + `interrupt()` |
| uma mensagem ruim não derruba tudo | `try/catch` por mensagem | `try/catch` por mensagem |
| se faltar o `try/catch` | o host **derruba a aplicação** (StopHost) | a thread **morre em silêncio** e a fila enche até travar todas as requisições |

A última linha é a mais traiçoeira: no Java não há ninguém derrubando o processo para avisar. Você
descobre quando o readiness começa a falhar por fila cheia, ou pior, quando não tem readiness.

Outro detalhe: `volatile boolean running`. Sem `volatile`, a JVM pode deixar o loop ler um valor
"em cache" e nunca ver o `false` que outra thread escreveu. É o tipo de bug que só aparece em
produção, com otimização do JIT ligada.

## O que o teste de estresse encontrou

Durante a construção do módulo, um experimento disparou 50 requisições simultâneas com a **mesma**
`Idempotency-Key`, com uma latência aleatória no gateway, 200 vezes seguidas. Resultado:

- **gravado: sempre um único pagamento** (o `putIfAbsent` atômico funcionou);
- **mas o gateway foi chamado até 50 vezes numa mesma rodada.**

Todas as 50 threads passaram pela checagem "essa chave já existe?" antes de qualquer uma gravar, e
todas chamaram o adquirente. Num gateway real sem deduplicação, seriam **50 cobranças no cartão do
cliente**, e o seu banco mostraria só uma.

Hoje o código se protege repassando a `idempotencyKey` ao adquirente (gateways sérios deduplicam por
ela), e o comentário no `PaymentService` documenta a limitação. Corrigir de verdade é o **Exercício 3**:
reservar a chave **antes** de chamar o gateway. É uma das perguntas de system design mais comuns em
entrevista de pagamentos, e agora você viu o bug acontecer, em vez de só ler sobre ele.

Uma segunda janela, mais estreita, foi encontrada **lendo o código**, não pelo experimento (que rodou
200 vezes sem reproduzi-la): uma requisição podia passar pela checagem de idempotência, outra gravar o
pagamento aprovado, e a primeira então responder **409** ("pedido já pago") a um retry legítimo, quando
o certo seria 200. A janela é de microssegundos, mas sob carga real acontece. Já está corrigida: antes
de lançar o 409, o serviço checa a chave de novo. Lição: teste de estresse que passa não prova
ausência de corrida; ele só não encontrou.

Próxima: [1J.8 Actuator, logging e testes](08-actuator-logging-testes.md)
