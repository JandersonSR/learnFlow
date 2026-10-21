# 1.1 Anatomia de um projeto .NET

## O mapa Node → .NET

| Node / TypeScript | .NET | Observação |
|---|---|---|
| `package.json` | `.csproj` | Dependências, versão do framework, opções de build |
| monorepo (workspaces) | solução `.slnx` | Agrupa vários projetos. O `.slnx` (XML enxuto) é o padrão do .NET 10; o `.sln` antigo ainda funciona |
| `tsconfig.base.json` | `Directory.Build.props` | Configuração herdada por todos os projetos da pasta |
| `node_modules` + npm | pacotes NuGet em cache global (`~/.nuget/packages`) | Não fica pasta gigante dentro do projeto |
| `npm install` | `dotnet restore` (automático no build) | |
| `npm run build` / `tsc` | `dotnet build` | Gera DLLs em `bin/` |
| `npm start` | `dotnet run` | |
| `npm test` | `dotnet test` | |
| `.env` | `appsettings.json` + variáveis de ambiente | Lição 1.5 |
| `index.ts` / `server.ts` | `Program.cs` | Ponto de entrada |

## Crie você mesmo (digite, não copie)

```bash
mkdir orderflow && cd orderflow
git init
dotnet new sln -n OrderFlow                       # cria OrderFlow.slnx
dotnet new web -o src/OrderFlow.Orders.Api        # projeto web VAZIO (sem controllers, sem exemplos)
dotnet sln add src/OrderFlow.Orders.Api
dotnet new xunit -o tests/OrderFlow.Orders.Tests
dotnet sln add tests/OrderFlow.Orders.Tests
dotnet add tests/OrderFlow.Orders.Tests reference src/OrderFlow.Orders.Api
```

Por que `web` e não `webapi`? O `webapi` traz um exemplo de previsão do tempo e um pacote de
OpenAPI que você ainda não pediu. Começar do vazio força você a entender cada linha que entra.

## O `.csproj`

Abra `src/OrderFlow.Orders.Api/OrderFlow.Orders.Api.csproj`. Repare que ele quase não tem nada:

- `Sdk="Microsoft.NET.Sdk.Web"` traz o ASP.NET Core inteiro: servidor web (Kestrel), Minimal APIs,
  injeção de dependência, configuração, logging, health checks e validação. **Nenhum pacote externo**
  é necessário no Módulo 1. Compare com o Node, onde você instalaria express, zod, pino, dotenv...
- O resto (versão do .NET, nullable etc.) vem do `Directory.Build.props`.

## O `Directory.Build.props`

Leia os comentários do arquivo na raiz. Os pontos que um sênior defende em code review:

- **`Nullable` = enable**: o compilador rastreia o que pode ser `null`. `string` significa
  "nunca nulo"; `string?` significa "pode ser nulo". É o `strictNullChecks` do TypeScript, só que
  verificado em toda chamada de método, inclusive de bibliotecas.
- **`TreatWarningsAsErrors`**: warning vira erro de build. Parece rígido; na prática evita o
  acúmulo de 300 warnings que ninguém lê.
- **`AnalysisLevel` = latest-recommended**: liga os analisadores de qualidade da Microsoft.
  Durante a construção deste curso, o analisador **CA1873 barrou um log com string interpolada**
  (lição 1.9 explica por que isso é um problema real). Você vai esbarrar nesses avisos; leia
  cada um, eles ensinam.

## `bin/` e `obj/`

`obj/` guarda arquivos intermediários do build; `bin/` guarda o resultado (as DLLs). Os dois vão
no `.gitignore`. Se algo estranho acontecer no build, apagar essas duas pastas resolve muita coisa.

## Teste rápido

```bash
dotnet build
dotnet run --project src/OrderFlow.Orders.Api
```

A API sobe em `http://localhost:5279` (porta definida em `Properties/launchSettings.json`, que
só vale para desenvolvimento local; em produção a porta vem de configuração, Módulo 4).

Próxima: [1.2 C# para quem vem de TypeScript](02-csharp-para-quem-vem-de-ts.md)
