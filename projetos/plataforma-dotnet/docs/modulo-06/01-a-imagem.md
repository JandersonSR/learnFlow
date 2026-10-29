# 6.1 A imagem da API, camada por camada

::: conceito Contêiner e imagem
Uma **imagem** é um pacote com a aplicação e tudo de que ela precisa para rodar (runtime, bibliotecas, arquivos), em camadas empilhadas e somente leitura. Um **contêiner** é um processo rodando a partir de uma imagem, isolado dos outros pelo kernel (o que ele enxerga de arquivos, rede e processos). Não é uma máquina virtual: todos os contêineres de um nó dividem o mesmo kernel.
:::

::: video Docker in 100 Seconds (Fireship, em inglês)
https://www.youtube.com/watch?v=Gjnup-PuquQ
Imagem, contêiner, Dockerfile e camadas, em dois minutos.
:::

## O `Dockerfile` da API, linha a linha

Abra o [`Dockerfile`](https://github.com/JandersonSR/aks-step-by-step/blob/main/Dockerfile). Ele tem **dois estágios**:

```dockerfile
# ---------- estágio 1: build com o SDK (grande, só existe durante o build) ----------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props .editorconfig ./
COPY src/Agx.Cep.Api/Agx.Cep.Api.csproj src/Agx.Cep.Api/
# ... os outros .csproj, um por um ...
RUN dotnet restore src/Agx.Cep.Api/Agx.Cep.Api.csproj -r linux-x64 -p:PublishReadyToRun=true
COPY src/ src/
RUN dotnet publish src/Agx.Cep.Api/Agx.Cep.Api.csproj -c Release -o /app --no-restore \
    -r linux-x64 --self-contained false -p:PublishReadyToRun=true -p:UseAppHost=false

# ---------- estágio 2: só o runtime (pequeno, é o que vai para o registry) ----------
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra AS final
WORKDIR /app
COPY --from=build /app .
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Agx.Cep.Api.dll"]
```

::: porque Dois estágios
O SDK do .NET (compilador, ferramentas, cache de pacotes) tem centenas de megabytes e só serve para compilar. O primeiro estágio compila; o segundo começa de uma imagem só com o runtime e copia **apenas o resultado** (`COPY --from=build /app .`). A imagem que vai para o registry fica menor, sobe mais rápido em cada nó novo e tem muito menos coisa para ter vulnerabilidade.
:::

::: porque Por que copiar os `.csproj` antes do código
Cada instrução do Dockerfile vira uma camada, e o Docker reaproveita do cache toda camada cujas entradas não mudaram. Copiando **só os `.csproj`** e rodando o `restore`, a camada dos pacotes NuGet só é refeita quando um `.csproj` muda. Mudou uma linha de C#? O Docker reaproveita o `restore` (que leva minutos) e refaz só a partir do `COPY src/`.

É também por isso que um projeto novo exige uma linha nova aqui (a dica 5 do desafio da lição 1.7).
:::

::: previsao
Você altera **uma linha** do `ConsultarCepHandler.cs` e roda `docker build .` de novo. Quais instruções do estágio 1 rodam de verdade e quais vêm do cache? E se, em vez disso, você acrescentar um pacote no `Directory.Packages.props`?
???
**Uma linha de C#:** os `COPY` dos arquivos de projeto e o `RUN dotnet restore` vêm do **cache**. Rodam de verdade o `COPY src/ src/` (o conteúdo mudou) e o `RUN dotnet publish`. O estágio 2 refaz só o `COPY --from=build`.

**Pacote novo no `Directory.Packages.props`:** esse arquivo está no primeiro `COPY`. Mudou a entrada da camada, então ela e **todas as seguintes** são refeitas, inclusive o `restore`. É o comportamento correto: pacotes mudaram, precisa baixar.

Se o Dockerfile fizesse `COPY . .` antes do `restore`, qualquer mudança em qualquer arquivo refaria o `restore` inteiro, e cada build levaria minutos a mais.
:::

## A imagem final: `noble-chiseled-extra`

| Característica | O que significa | Por quê |
|---|---|---|
| **Chiseled** | Só os arquivos necessários para rodar .NET: sem shell (`sh`, `bash`), sem gerenciador de pacotes, sem `curl` | Quem conseguir executar código no contêiner não encontra ferramentas para continuar o ataque; e há muito menos pacotes para ter CVE |
| **`-extra`** | Inclui ICU e `tzdata` | Globalização (formatação, comparação de texto) e fusos horários. Sem `-extra`, o "dia de Brasília" da lição 1.7 lançaria exceção |
| **`USER $APP_UID`** | Roda com um usuário sem privilégios (UID 1654) que já existe na imagem | Processo comprometido não é root dentro do contêiner |
| **ReadyToRun** | O código é pré-compilado para linux-x64 no build | Menos tempo de subida, o que importa quando o HPA cria um pod novo num pico |
| **`EXPOSE 8080`** | Documenta a porta | Desde o .NET 8, a porta padrão das imagens é 8080, não 80: porta abaixo de 1024 exige root |

::: armadilha Sem shell, sem `kubectl exec ... bash`
Com a imagem chiseled, o hábito de "entrar no pod para ver" não funciona: `kubectl exec -it <pod> -- sh` falha porque não existe `sh`. Por isso o próprio chart usa `preStop: { sleep: ... }` (ação nativa do Kubernetes) em vez de um comando `sleep`, e por isso a lição 6.4 ensina `kubectl debug` com um contêiner efêmero. É uma troca consciente: menos conveniência, mais segurança.
:::

## Lab: olhar dentro da imagem

::: checkpoint
Na raiz do aks-step-by-step:

```bash
docker build -t cep-api:lab .
docker images cep-api:lab                       # tamanho final
docker history cep-api:lab                      # as camadas e o tamanho de cada uma
docker run --rm --entrypoint sh cep-api:lab     # tente abrir um shell
```

E compare com o tamanho da imagem do SDK: `docker images mcr.microsoft.com/dotnet/sdk:10.0`.
:::

::: solucao
- A imagem final deve ficar na casa das **poucas centenas de MB ou menos**, contra bem mais do SDK. A diferença é o que o estágio 2 deixa para trás.
- O `docker history` mostra as camadas da imagem base e, por cima, a camada do `COPY --from=build` com a aplicação publicada.
- O `docker run ... sh` falha com algo como `exec: "sh": executable file not found`. Não existe shell na imagem. Essa é a proteção funcionando.
:::

## Perguntas para responder sem olhar

::: pergunta
Para que serve o build em dois estágios?
???
O primeiro estágio usa o SDK para compilar; o segundo começa de uma imagem só com o runtime e copia apenas o resultado. A imagem final fica menor, sobe mais rápido e tem menos superfície para vulnerabilidades.
:::

::: pergunta
Por que o Dockerfile copia os `.csproj` e roda o `restore` antes de copiar o código?
???
Para aproveitar o cache de camadas: o `restore` só é refeito quando um arquivo de projeto muda. Mudanças no código reaproveitam a camada dos pacotes e o build fica muito mais rápido.
:::

::: pergunta
O que a imagem chiseled tira, e qual o custo disso no dia a dia?
???
Tira shell, gerenciador de pacotes e utilitários, e roda sem root. Reduz a superfície de ataque e as CVEs. O custo é não conseguir "entrar no pod" com `kubectl exec ... sh`: o diagnóstico passa a usar `kubectl debug` com contêiner efêmero, logs e métricas.
:::

**Próxima:** [6.2 Do contêiner ao pod](02-objetos-do-kubernetes.md).
