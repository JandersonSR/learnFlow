# 1J.1 Anatomia: Maven, pom.xml e o projeto Spring

## O mapa .NET → Java

| .NET | Java (Maven) | Observação |
|---|---|---|
| `.csproj` | `pom.xml` | Dependências, versão do Java, plugins de build |
| NuGet | Maven Central | Repositório público de pacotes |
| `dotnet build` | `./mvnw compile` | |
| `dotnet test` | `./mvnw test` | |
| `dotnet run` | `./mvnw spring-boot:run` | |
| `dotnet publish` | `./mvnw package` | Gera `target/payments-0.1.0-SNAPSHOT.jar` |
| `bin/` + `obj/` | `target/` | Vai no `.gitignore` |
| `namespace` | `package` | **Em Java o pacote precisa bater com a pasta** |
| `.slnx` com vários projetos | POM "pai" com `<modules>` | Não usamos aqui: um serviço, um POM |

A outra ferramenta de build do mundo Java é o **Gradle** (script em Kotlin ou Groovy, mais rápido,
padrão no Android). Maven é mais comum em empresa e mais simples de ler, por isso usamos Maven.
Saiba que os dois existem.

## O `mvnw` (Maven Wrapper)

`mvnw` é um script que baixa a versão certa do Maven sozinho, para todo mundo do time (e o CI) usar
a mesma. É o equivalente a fixar a versão do SDK num `global.json`. Este repositório **não traz o
wrapper**, porque ele precisa ser baixado da internet. Gere uma vez:

```bash
# Opção A: tem o Maven instalado (https://maven.apache.org/install.html)
cd java/payments
mvn -N wrapper:wrapper

# Opção B: gere um projeto vazio em https://start.spring.io (Maven, Java 25, Spring Boot 4.1.x)
#          e copie mvnw, mvnw.cmd e a pasta .mvn para java/payments/
```

Depois, sempre `./mvnw` (Linux/macOS/Git Bash) ou `mvnw.cmd` (Windows).

## Ferramentas

| Ferramenta | Instalação |
|---|---|
| **JDK 25** (Eclipse Temurin, grátis) | https://adoptium.net (Windows: `winget install EclipseAdoptium.Temurin.25.JDK`) |
| **IntelliJ IDEA** | https://www.jetbrains.com/idea/ (a edição gratuita atende este curso). VS Code com "Extension Pack for Java" também funciona |

Confira com `java -version` (deve mostrar 25).

## O `pom.xml`

Abra `java/payments/pom.xml` e leia os comentários. Os três pontos que importam:

1. **`spring-boot-starter-parent`**: o POM pai fixa as versões de centenas de bibliotecas que
   funcionam juntas (BOM, *bill of materials*). Por isso as dependências não têm `<version>`. Trocar a
   versão do Spring Boot numa linha atualiza tudo de forma coerente.
2. **Starters**: pacotes "guarda-chuva". `spring-boot-starter-webmvc` traz Tomcat, Spring MVC e
   Jackson. **Atenção: no Spring Boot 4 o nome mudou** de `spring-boot-starter-web` para
   `spring-boot-starter-webmvc`; o nome antigo ainda funciona, mas está depreciado. Muito tutorial na
   internet usa o antigo.
3. **Starters de teste por tecnologia** (novidade do Boot 4): `spring-boot-starter-webmvc-test`, que
   já traz JUnit 5, AssertJ e Mockito.

## Estrutura de pastas (convenção Maven, não é opcional)

```
java/payments/
  pom.xml
  src/main/java/com/orderflow/payments/     código
    PaymentsApplication.java                main (o Program.cs)
    domain/                                 Java puro, zero Spring
    application/                            casos de uso + interfaces (portas), zero Spring
    infrastructure/                         implementações em memória, zero Spring
    config/                                 a "fiação" do Spring (beans, propriedades, health)
    api/                                    controllers, DTOs, tratamento de erro
  src/main/resources/application.yml        configuração (o appsettings.json)
  src/test/java/...                         testes, espelhando os pacotes de main
```

Repare que **as mesmas camadas** do Orders aparecem aqui. Só `config/` é novo: no .NET a fiação
mora no `Program.cs`; no Spring, em classes `@Configuration`.

## Rodando

```bash
cd java/payments
./mvnw spring-boot:run
# Tomcat started on port 8081
```

As requisições de exemplo estão em `java/payments/requests.http` (o IntelliJ abre direto).

Próxima: [1J.2 Java para quem sabe TypeScript e C#](02-java-para-quem-sabe-ts-e-csharp.md)
