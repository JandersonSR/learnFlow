# 7.1 A imagem: multi-stage, cache de restore e chiseled

O básico de imagem .NET (estágios, por que copiar `.csproj` antes do código, o que é uma imagem chiseled) está na lição [6.1 do curso Plataforma .NET](../../plataforma-dotnet/docs/modulo-06/01-a-imagem.md). Leia lá se algum desses termos for novo. Aqui o problema é outro: o CreditFlow é um **monolito modular** com mais de quinze projetos, uma única imagem que vira quatro processos diferentes, e precisa rodar em `amd64` e `arm64`.

::: video Docker in 100 Seconds (Fireship, em inglês)
https://www.youtube.com/watch?v=Gjnup-PuquQ
Revisão rápida de imagem, contêiner e camadas antes de entrar nos detalhes.
:::

## O problema do "copie os `.csproj` um por um"

Na API simples da Plataforma, o Dockerfile copiava cada `.csproj` com uma linha `COPY`. Com cinco módulos, cada um com dois projetos, mais BuildingBlocks e Host, são doze linhas, e **cada projeto novo exige lembrar de mexer no Dockerfile**. Esquecer não quebra o build: o `restore` só fica incompleto, o `publish` restaura de novo no estágio seguinte, e o cache some sem ninguém perceber.

O [`Dockerfile`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/docker/Dockerfile) do CreditFlow resolve com um estágio a mais:

```dockerfile
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS dependencias
WORKDIR /src
COPY . .
RUN find . -type f \
      ! -name '*.csproj' ! -name '*.slnx' ! -name 'Directory.Build.props' \
      ! -name 'Directory.Packages.props' ! -name 'global.json' ! -name 'nuget.config' \
      -delete \
 && find . -type d -empty -delete
```

::: conceito Cache de camadas por conteúdo
O BuildKit decide se reaproveita uma instrução comparando as **entradas** dela. Para `COPY --from=estagio`, a entrada é o **conteúdo** dos arquivos copiados (um checksum), não o histórico de como eles foram produzidos.
:::

O estágio `dependencias` copia tudo e apaga tudo que não define dependência. Ele roda de novo a cada build (o `COPY . .` muda sempre), mas o **resultado** só muda quando um `.csproj` ou um `props` muda. No estágio seguinte:

```dockerfile
COPY --from=dependencias /src ./
RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages \
    dotnet restore src/Host/CreditFlow.Host/CreditFlow.Host.csproj -a $TARGETARCH
```

Como o conteúdo copiado é igual ao do build anterior, o `COPY --from` vem do cache, e o `restore` também.

::: previsao
Você muda uma linha de `CalculadoraPrice.cs` e roda o build de novo. O estágio `dependencias` roda? O `restore` roda? E se você criar um módulo novo, `CreditFlow.Modules.Cobranca`, com o `.csproj` dele?
???
**Uma linha de C#:** o estágio `dependencias` **roda** (o `COPY . .` mudou), mas produz exatamente os mesmos arquivos. O `COPY --from=dependencias` vem do cache, o `restore` também. Rodam o `COPY src/` e o `publish`.

**Módulo novo:** o `find` mantém o `.csproj` novo, o conteúdo de `dependencias` muda, e o `restore` roda de novo. Sem você tocar no Dockerfile. É esse o ganho: o Dockerfile deixa de ser uma lista que precisa ser mantida à mão.
:::

## O cache do NuGet que não entra na imagem

`RUN --mount=type=cache,id=nuget,target=/root/.nuget/packages` monta um diretório **do BuildKit**, que sobrevive entre builds na mesma máquina, durante aquele `RUN`. Os pacotes baixados ficam lá e não viram camada. Na próxima vez que o `restore` precisar rodar (porque um `.csproj` mudou), ele baixa só o que é novo.

::: armadilha
No GitHub Actions, cada job começa numa máquina nova: o cache montado começa vazio. O que salva o CI é o `cache-from: type=gha` / `cache-to: type=gha,mode=max` do `docker/build-push-action` (veja o [`ci.yml`](https://github.com/JandersonSR/lending-plataform/blob/main/.github/workflows/ci.yml)), que guarda as **camadas** no cache do GitHub. Os dois se complementam: o `gha` guarda o resultado do `restore`; o `--mount=type=cache` acelera quando o `restore` precisa rodar.
:::

## Duas arquiteturas sem emulação

```dockerfile
FROM --platform=$BUILDPLATFORM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS build
ARG TARGETARCH
RUN ... dotnet restore ... -a $TARGETARCH
RUN ... dotnet publish ... -a $TARGETARCH --no-restore
```

`$BUILDPLATFORM` é a arquitetura da máquina que compila; `$TARGETARCH` é a da imagem que você pediu (`amd64` ou `arm64`). O SDK roda **nativo** e faz compilação cruzada com `-a` (o .NET aceita `amd64` como apelido de `x64`). Sem o `--platform=$BUILDPLATFORM`, o buildx emularia o SDK inteiro em arm64 via QEMU, e o build levaria dez vezes mais.

::: porque Por que se importar com arm64
Nós Azure Arm (Cobalt 100 na série `Dpsv6`, Ampere na `Dpsv5`) e os Macs com Apple Silicon. Uma imagem multi-arquitetura roda nos dois sem você pensar nisso. O estágio final (`FROM mcr.microsoft.com/dotnet/aspnet:...` sem `--platform`) segue o `$TARGETPLATFORM` automaticamente.
:::

## O estágio final, linha por linha

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION}-noble-chiseled-extra AS final
WORKDIR /app
COPY --from=build /app ./
USER $APP_UID
ENV ASPNETCORE_HTTP_PORTS=8080 TZ=America/Sao_Paulo CreditFlow__Versao=${VERSAO}
EXPOSE 8080
HEALTHCHECK ... CMD ["dotnet", "CreditFlow.Host.dll", "--healthcheck"]
ENTRYPOINT ["dotnet", "CreditFlow.Host.dll"]
```

| Linha | O que faz | Por quê |
|---|---|---|
| `noble-chiseled-extra` | Ubuntu 24.04 "fatiado": só o runtime e as bibliotecas que ele carrega. Sem shell, sem `apt`, sem usuário root ativo | Menos pacote = menos CVE e nada para um invasor usar. O `-extra` traz **ICU e tzdata** |
| `COPY --from=build /app ./` **sem** `--chown` | Os arquivos ficam do root, só leitura para o processo | Um processo comprometido não consegue reescrever as próprias DLLs |
| `USER $APP_UID` | Roda como o usuário 1654, que já existe na imagem | O chart reforça com `runAsNonRoot: true` e `runAsUser: 1654` |
| `ENV ASPNETCORE_HTTP_PORTS=8080` | Kestrel escuta na 8080 | Portas abaixo de 1024 exigem privilégio |
| `TZ=America/Sao_Paulo` | Fuso do contêiner | Logs e datas "do dia" do negócio. Só funciona porque o `-extra` traz o tzdata |
| `HEALTHCHECK` | Verificação de saúde do Docker | Só vale para `docker run` e compose. O Kubernetes **ignora** e usa as sondas |

::: previsao
Por que `-extra` e não a `noble-chiseled` simples, que é menor? Pense no que o CreditFlow formata na simulação.
???
A `chiseled` simples roda em **modo de globalização invariante**: não tem ICU. `valor.ToString("C", new CultureInfo("pt-BR"))` ou lança `CultureNotFoundException` ou formata como cultura invariante (`¤10,000.00`), dependendo da configuração. Para um sistema de crédito que devolve tabela de parcelas em reais, isso é bug de produção. O `-extra` custa uns 30 MB a mais e traz ICU e fuso horário.
:::

## O HEALTHCHECK sem curl

A imagem chiseled não tem `curl`, `wget` nem `sh`. O padrão `HEALTHCHECK CMD curl -f http://localhost:8080/healthz` simplesmente não executa. A saída do projeto: o próprio Host aceita o argumento `--healthcheck`, faz um GET em `/healthz/live` com `HttpClient` e sai com 0 ou 1, **antes** de montar a aplicação. O Docker roda `dotnet CreditFlow.Host.dll --healthcheck` dentro do contêiner.

::: armadilha
Não confunda com a sonda do Kubernetes. Quem decide se o pod recebe tráfego ou é reiniciado é a `readinessProbe`/`livenessProbe` do chart (lição 7.3), que o **kubelet** executa de fora. Um `HEALTHCHECK` que falha no Kubernetes não faz nada.
:::

## Lab: olhar a imagem por dentro

```bash
docker buildx build -f deploy/docker/Dockerfile -t creditflow:dev --load .
docker image ls creditflow:dev
docker run --rm --entrypoint sh creditflow:dev           # falha: não existe shell
docker run --rm -e CREDITFLOW__MODULOS=Simulacao -p 8080:8080 creditflow:dev &
docker inspect --format '{{.Config.User}} {{json .State.Health}}' $(docker ps -lq)
```

Mude uma linha de qualquer `.cs` e rode o build de novo com `--progress=plain`. Procure `CACHED` nas linhas do `restore`.

::: dica
Para depurar um contêiner sem shell no Kubernetes, use um contêiner efêmero com ferramentas: `kubectl debug -it <pod> --image=busybox --target=creditflow`. Visto na lição [6.4 da Plataforma](../../plataforma-dotnet/docs/modulo-06/04-diagnostico.md).
:::

## Perguntas para responder sem olhar

::: pergunta
Como o Dockerfile do CreditFlow evita listar cada `.csproj` e ainda assim aproveita o cache do `restore`?
???
Um estágio copia o repositório inteiro e apaga tudo que não é `.csproj`/`props`/`slnx`. O próximo estágio copia o resultado desse estágio. Como o cache do `COPY --from` é por conteúdo, ele só invalida quando um arquivo de dependência muda.
:::

::: pergunta
Para que servem `--platform=$BUILDPLATFORM` e `-a $TARGETARCH` juntos?
???
O SDK roda na arquitetura nativa de quem compila (sem emulação) e gera binários para a arquitetura alvo. Sem isso, o buildx emularia o SDK com QEMU para gerar a imagem arm64, muito mais devagar.
:::

::: pergunta
O que a imagem chiseled não tem, e que consequência prática isso traz para o HEALTHCHECK e para a depuração?
???
Não tem shell, gerenciador de pacotes nem utilitários (curl). O HEALTHCHECK precisa ser feito pelo próprio binário da aplicação, e a depuração no cluster usa contêiner efêmero (`kubectl debug`) com uma imagem de ferramentas.
:::

**Próxima:** [7.2 Um chart, quatro perfis](02-um-chart-quatro-perfis.md).
