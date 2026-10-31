# Módulo 1: do zero, solução, monolito modular e ambiente local

**Objetivo:** montar a solução do CreditFlow a partir de uma pasta vazia, entendendo cada arquivo que aparece: o que o SDK do .NET faz com ele, por que ele está ali e o que quebra sem ele. No fim, a solução compila, os testes de arquitetura impedem que um módulo use as classes de outro, o ambiente local sobe com um comando e existe um primeiro endpoint documentado em OpenAPI, com erros no formato ProblemDetails.

## O que você vai conseguir fazer no fim

- Criar uma solução `.slnx` com Host, BuildingBlocks e módulos, e explicar o papel de `Directory.Build.props` e da gestão central de pacotes
- Explicar como o Host descobre os módulos (catálogo explícito), como o perfil de execução filtra o que sobe e por que configuração errada derruba a subida
- Dizer o que entra e o que nunca entra no BuildingBlocks
- Explicar a diferença entre o projeto de um módulo e o seu `.Contracts`, e escrever testes de arquitetura que quebram o build quando a fronteira é furada
- Subir Postgres, MongoDB, Dragonfly, Kafka (KRaft), Kafka UI e Keycloak com `docker compose`, e explicar cada linha do arquivo
- Publicar um endpoint com OpenAPI nativo e Scalar, com erros em ProblemDetails (RFC 9457)

## O que você constrói

| Peça | No repositório |
|---|---|
| Solução e regras de build | [`CreditFlow.slnx`](https://github.com/JandersonSR/lending-plataform/blob/main/CreditFlow.slnx), [`Directory.Build.props`](https://github.com/JandersonSR/lending-plataform/blob/main/Directory.Build.props), [`Directory.Packages.props`](https://github.com/JandersonSR/lending-plataform/blob/main/Directory.Packages.props) |
| O processo | [`src/Host/CreditFlow.Host/Program.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Host/CreditFlow.Host/Program.cs) |
| Blocos compartilhados | [`src/BuildingBlocks/CreditFlow.BuildingBlocks`](https://github.com/JandersonSR/lending-plataform/blob/main/src/BuildingBlocks/CreditFlow.BuildingBlocks/Modulos/IModule.cs) |
| Testes de arquitetura | [`tests/CreditFlow.ArchitectureTests`](https://github.com/JandersonSR/lending-plataform/blob/main/tests/CreditFlow.ArchitectureTests/FronteirasTests.cs) |
| Ambiente local | [`deploy/local/docker-compose.yml`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/local/docker-compose.yml) |
| Decisões | [ADR 0001](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0001-monolito-modular.md) e [ADR 0002](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0002-perfis-de-execucao.md) |

## Pré-requisitos

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0) (`dotnet --version` mostra 10.0.x) e Docker com Compose v2
- Um editor com C#: Rider, Visual Studio ou VS Code com C# Dev Kit
- [Módulo 0](../00-visao-geral.md) lido
- Desejável: [Plataforma .NET, módulo 1](../../../plataforma-dotnet/docs/modulo-01/README.md) (monolito modular e DDD com mais teoria)

## Lições

| # | Lição | Tempo |
|---|---|---|
| 1.1 | [Do zero: `dotnet new`, slnx e gestão central de pacotes](01-do-zero-a-solucao.md) | 60 min |
| 1.2 | [O Host e o `IModule`: um processo, N perfis](02-host-e-imodule.md) | 75 min |
| 1.3 | [BuildingBlocks: o que é de todos (e o que não é)](03-building-blocks.md) | 50 min |
| 1.4 | [Fronteiras, `.Contracts` e testes de arquitetura](04-fronteiras-e-testes-de-arquitetura.md) | 75 min |
| 1.5 | [O ambiente local: cada serviço do compose explicado](05-ambiente-local.md) | 75 min |
| 1.6 | [Primeiro endpoint, OpenAPI + Scalar e ProblemDetails](06-primeiro-endpoint.md) | 60 min |
| — | [Desafio do módulo](desafio.md) | 2–3 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |

## Entregável

A solução compilando do zero, `dotnet test` verde (inclusive os testes de arquitetura) e o compose de pé. E uma conversa de 15 minutos com o seu time: "por que a nossa próxima API deveria (ou não) ser um monolito modular?", usando o ADR 0001 como roteiro.
