# 4.2 A imagem do Payments: camadas do Spring Boot, jlink e distroless

Arquivos: [`deploy/docker/payments.Dockerfile`](../../deploy/docker/payments.Dockerfile), [`payments.Dockerfile.dockerignore`](../../deploy/docker/payments.Dockerfile.dockerignore)

```bash
docker build -f deploy/docker/payments.Dockerfile -t orderflow/payments:dev .
docker run --rm -p 8081:8081 orderflow/payments:dev
curl -s localhost:8081/actuator/health/readiness
```

A versão ingênua de uma imagem Java é `FROM eclipse-temurin:25-jdk` + `COPY target/app.jar` + `java -jar`. Funciona, e tem três problemas que esta lição resolve um por um: **camada única gigante**, **JDK inteiro em produção** e **JVM que não sabe que está num container**.

## Problema 1: o fat jar é uma camada só

O `spring-boot-maven-plugin` gera um *fat jar*: seu código (alguns KB) + todas as dependências (dezenas de MB: Spring, Tomcat, Jackson, driver do Postgres, cliente Kafka). Num `COPY app.jar`, uma linha alterada no seu código gera um jar novo, uma camada nova de 60 MB, e cada nó do cluster baixa 60 MB de novo a cada deploy.

O Spring Boot resolve com o *jarmode* `tools`:

```dockerfile
RUN java -Djarmode=tools -jar application.jar extract --layers --destination extracted
```

| Diretório | Conteúdo | Muda quando |
|---|---|---|
| `dependencies/` | jars de terceiros com versão fixa | você sobe a versão do Boot ou de uma biblioteca |
| `spring-boot-loader/` | o carregador do Boot | quase nunca |
| `snapshot-dependencies/` | jars `-SNAPSHOT` | a cada build delas |
| `application/` | o **seu** código e o `application.jar` "fino" | todo commit |

Uma instrução `COPY` por diretório, na ordem acima, gera quatro camadas. Num deploy normal só a última muda: alguns KB.

::: conceito O `application.jar` extraído
Não é o fat jar. É um jar pequeno com as suas classes e um `MANIFEST.MF` cujo `Class-Path` aponta para `lib/*.jar` (que vieram das outras camadas). Por isso o `ENTRYPOINT` continua sendo `java -jar application.jar`, e a JVM acha as dependências pelo manifest, sem o class loader especial do fat jar (o que, de bônus, deixa a subida um pouco mais rápida).
:::

::: armadilha Tutorial antigo: `layertools`
No Spring Boot 2 e 3 o comando era `java -Djarmode=layertools -jar app.jar extract`, e os diretórios ficavam com outra estrutura. A documentação do Boot 4 usa `-Djarmode=tools ... extract --layers`. Se copiar um Dockerfile da internet e o build falhar com "Unsupported jarmode", é isso.
:::

## Problema 2: o JDK inteiro em produção

O JDK traz compilador (`javac`), ferramentas (`jshell`, `jcmd`...), e módulos que um serviço web nunca usa (Swing, CORBA já saiu, mas `java.desktop` ainda pesa). Desde o Java 9 a plataforma é **modular** (JPMS), e o `jlink` monta um runtime só com os módulos que você escolher.

Quais módulos? O `jdeps` analisa o bytecode e responde:

```dockerfile
RUN jdeps --ignore-missing-deps -q --recursive --multi-release 25 --print-module-deps \
        --class-path 'extracted/dependencies/lib/*:extracted/snapshot-dependencies/lib/*' \
        extracted/application/application.jar > jdeps-modules.txt
```

E o `jlink` monta o runtime em `/jre`:

```dockerfile
 && jlink --add-modules "$(cat jdeps-modules.txt),${EXTRA_MODULES}" \
        --strip-debug --no-man-pages --no-header-files --compress=zip-6 --output /jre
```

::: porque Por que somar `EXTRA_MODULES` à mão
O `jdeps` lê referências **estáticas** no bytecode. O Spring carrega muita coisa por **reflexão** e `ServiceLoader`; o driver JDBC, os provedores de criptografia do SASL (o SCRAM do Kafka, Módulo 5) e o JMX/JFR do Actuator também. Nenhum deles aparece para o `jdeps`. O sintoma de módulo faltando só aparece **em execução**: `ClassNotFoundException: javax.security.sasl.SaslClient` na primeira conexão autenticada com o Kafka, ou `NoSuchAlgorithmException` no TLS. A lista extra do Dockerfile é a "vacina" contra os casos conhecidos. Toda vez que adicionar uma biblioteca, rode o serviço de verdade (testes de integração) **contra a imagem**, não só na sua máquina.
:::

Num teste com JDK 21 (o ambiente onde este curso foi escrito não tinha o 25), o `jlink` com `java.base`, `java.sql`, a lista extra e ainda o `jdk.localedata` gerou um runtime de 58 MB. Um JDK completo passa de 300 MB. Meça o seu com `du -sh` no Exercício 2.

::: dica
`jdk.localedata` ficou de fora: só a localidade padrão (inglês). É o mesmo trade-off do ICU na imagem chiseled do .NET (lição 4.1). Precisa formatar em pt-BR? Acrescente o módulo.
:::

::: video How to use jlink, jpackage and docker to put your Java on a diet (em inglês)
https://www.youtube.com/watch?v=SRHqm9XjGOs
jdeps e jlink na prática, montando um runtime Java só com os módulos necessários.
:::

## Problema 3 (e o mais grave): a JVM e os limites do container

::: previsao
O pod do Payments tem `limits.memory: 512Mi` e roda num nó de 16 GB. Sem nenhuma flag, qual o tamanho máximo do heap que a JVM 25 escolhe? E o que acontece se a aplicação usar mais memória que o limite?
???
A JVM moderna (desde o 10, e por padrão) **lê o cgroup** do container: enxerga 512 MiB, não 16 GB. O heap máximo padrão é **25%** disso: 128 MiB. Pouco para um Spring Boot com tráfego, e você teria `OutOfMemoryError` de heap mesmo com memória sobrando no limite.

Se a memória **total do processo** (heap + metaspace + pilhas + buffers diretos + code cache + a memória nativa do cliente Kafka) passar de 512 MiB, quem age é o **kernel**: mata o processo com `SIGKILL`. O pod aparece como `OOMKilled` (código de saída 137), sem stack trace, sem log de erro. É o diagnóstico mais confuso para quem vem do Node.
:::

Por isso o `ENTRYPOINT`:

```dockerfile
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", "-jar", "application.jar"]
```

- **`MaxRAMPercentage=75`**: heap até 75% do limite (384 MiB de 512). Os 25% restantes são para o que não é heap. Para o payments-streams (Módulo 5) o Dockerfile usa 60%, porque o RocksDB aloca memória nativa fora do heap.
- **`ExitOnOutOfMemoryError`**: um `OutOfMemoryError` de heap deixa a JVM num estado imprevisível (uma thread morreu, as outras seguem). Melhor sair: o Kubernetes reinicia, o `restartCount` sobe, o alerta toca.

E no chart (lição 4.6), a variável `JDK_JAVA_OPTIONS=-XX:ActiveProcessorCount=2`.

::: porque O problema da CPU sem limite
O chart **não** define limite de CPU (lição 4.4 explica o throttling). Sem limite, o cgroup não informa cota, e a JVM vê **todos os núcleos do nó** (digamos 16). Ela dimensiona por isso: threads do G1, threads do compilador JIT, o paralelismo do `ForkJoinPool.commonPool()`. Com `requests.cpu: 250m`, essas 16 threads competem por um quarto de núcleo. `ActiveProcessorCount` diz à JVM "considere 2". O .NET tem o mesmo problema e o resolve sozinho com `DOTNET_PROCESSOR_COUNT` ou lendo a cota; e desde o .NET 9 o GC adaptativo (DATAS) reduz o estrago do Server GC em containers.
:::

`JDK_JAVA_OPTIONS` é lida pelo launcher `java` (JDK 9+) e **soma** às flags do `ENTRYPOINT`, sem você precisar reescrevê-lo. Prefira ela a `JAVA_TOOL_OPTIONS` para flags da aplicação: a segunda também é lida por ferramentas como `jcmd`, o que confunde.

## Distroless: sem shell, sem Java, e ainda assim roda Java

```dockerfile
FROM gcr.io/distroless/cc-debian13:nonroot AS runtime
COPY --from=build /jre /opt/java
```

As imagens *distroless* do Google são o equivalente Java/Go/Python do chiseled: Debian 13 recortado, sem shell, sem gerenciador de pacotes. A variante `cc` tem glibc **e libstdc++**; usamos ela (não a `base`) porque as bibliotecas de compressão do cliente Kafka (snappy, zstd) e o RocksDB do Módulo 5 são nativas em C/C++. A tag `:nonroot` roda como UID 65532.

| Opção | Tamanho | Controle | Quando usar |
|---|---|---|---|
| `eclipse-temurin:25-jre` | o maior | nenhum esforço | protótipo; quando precisa de shell para depurar |
| `gcr.io/distroless/java25-debian13:nonroot` | médio (JRE completo) | baixo esforço, sem shell | o padrão razoável |
| **distroless/cc + jlink** (este curso) | o menor | você mantém a lista de módulos | quando tamanho e superfície de ataque importam, e há testes de integração contra a imagem |

::: armadilha `RUN` sem shell
No estágio distroless, `RUN qualquer-coisa` em forma shell falha (`/bin/sh: not found`). Se precisar rodar algo no estágio final, use a forma exec, `RUN ["java", "..."]`. É assim que a documentação do Spring Boot gera o **AOT cache** do Java 25 (um "treino" que acelera a subida): `RUN java -XX:AOTCacheOutput=app.aot -Dspring.context.exit=onRefresh -jar application.jar`.
:::

::: quebra Lab: o AOT cache e o banco que não existe no build
A documentação do Boot 4 sugere um treino no build para o AOT cache do Java 25. Acrescente ao estágio `runtime`:

```dockerfile
RUN ["java", "-XX:AOTCacheOutput=app.aot", "-Dspring.context.exit=onRefresh", "-jar", "application.jar"]
```

e troque o `ENTRYPOINT` para incluir `-XX:AOTCache=app.aot`. Builde **depois** do Módulo 3 (com Postgres e Flyway/JPA). O que acontece?
:::

::: solucao
O treino sobe o contexto do Spring até o `onRefresh`. Com JPA e migrations, a inicialização tenta **conectar no Postgres**, que não existe dentro do `docker build`. O build falha (ou espera o timeout do Hikari e falha). Saídas possíveis: um perfil de treino que desliga a conexão (`spring.datasource.hikari.initialization-fail-timeout=-1`, migrations desligadas), ou gerar o cache num passo do CI com os serviços disponíveis. É uma otimização real (subida bem mais rápida, ótimo para escalar com KEDA), mas com custo de complexidade: por isso não está no Dockerfile padrão, está no Exercício 3.
:::

## O cache do Maven

```dockerfile
COPY java/payments/pom.xml .
RUN --mount=type=cache,id=m2,target=/root/.m2 mvn -B -q dependency:go-offline
COPY java/payments/src ./src
RUN --mount=type=cache,id=m2,target=/root/.m2 mvn -B -q -DskipTests package
```

Mesma ideia do restore do .NET: o `pom.xml` sozinho primeiro. O `dependency:go-offline` não baixa **tudo** (plugins carregados só no `package` às vezes escapam), mas com o cache montado, o que faltar é baixado uma vez e fica.

`-DskipTests`: os testes não rodam dentro do build da imagem. Rodam no CI (Módulo 7) num passo próprio, que publica o relatório e falha o pipeline. Dentro do `docker build`, a saída dos testes vira texto num log de build que ninguém lê, e o build fica lento a cada mudança.

## Perguntas para responder sem olhar

::: pergunta
Por que extrair as camadas do Spring Boot em vez de copiar o fat jar?
???
Porque o fat jar é uma camada única: qualquer mudança no código gera dezenas de MB novos para enviar ao registry e baixar em cada nó. Extraído em dependências, loader, snapshots e aplicação, só a última camada (KB) muda num deploy comum.
:::

::: pergunta
Um pod Java aparece como `OOMKilled` sem nenhum log de erro. O que aconteceu e como você investiga?
???
O processo inteiro (heap + memória não-heap) passou do `limits.memory` e o kernel o matou com SIGKILL; a JVM não teve chance de logar. Investigo com `kubectl describe pod` (Last State: OOMKilled, exit 137), comparo o limite com `MaxRAMPercentage` (heap grande demais deixa pouco para metaspace, threads, buffers diretos, bibliotecas nativas), e meço a memória nativa com Native Memory Tracking (`-XX:NativeMemoryTracking=summary` + `jcmd`) num ambiente de teste. Correção: reduzir o percentual do heap ou aumentar o limite, nunca tirar o limite.
:::

::: pergunta
O `jdeps` disse que a aplicação usa `java.base,java.sql,java.naming`. Por que confiar só nisso é perigoso?
???
O `jdeps` só vê referências estáticas. Spring, drivers JDBC, provedores de segurança (SASL/SCRAM, TLS) e o Actuator usam reflexão e ServiceLoader. Os módulos faltando só aparecem em execução, às vezes num caminho raro (primeira conexão TLS, primeiro login SASL). Por isso a lista extra e testes de integração contra a imagem final.
:::

**Próxima:** [4.3 Kubernetes por dentro: do `kubectl apply` ao pod rodando](03-kubernetes-por-dentro.md)
