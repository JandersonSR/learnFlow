# 0001. Dois serviços em stacks diferentes: Orders em .NET, Payments em Java

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** Janderson (autor), revisão do time

## Contexto

O OrderFlow tem dois domínios com ciclos de mudança diferentes: pedidos (regras de catálogo,
itens, cancelamento) e pagamentos (adquirente, estorno, conciliação). O projeto também é um
portfólio: precisa demonstrar integração entre times que não compartilham código, que é a
realidade de empresas médias e grandes no Brasil, onde .NET e Java convivem (bancos, varejo,
seguradoras) e times são donos de serviços em stacks diferentes.

Forças: um serviço por domínio dá dono claro e deploy independente; duas stacks dobram o custo
de ferramentas, pipelines, bibliotecas internas e conhecimento necessário para o plantão.

## Decisão

Orders em ASP.NET 10 (C# 14) e Payments em Java 25 com Spring Boot 4, com o **mesmo desenho** nos
dois (camadas Api/Application/Domain/Infrastructure, domínio sem framework, ProblemDetails RFC 9457,
mesmas probes). Os serviços não compartilham código nem banco: o único contrato é o formato dos
eventos no Kafka (ADR 0002 e 0005).

## Alternativas consideradas

- **Os dois em .NET.** Mais barato de operar e de manter. Rejeitado porque esconderia exatamente
  o problema que o projeto quer mostrar: contrato entre serviços que não podem compartilhar uma DLL.
- **Monólito modular em .NET** com os dois domínios como módulos. É a escolha certa para a maioria
  dos times do tamanho deste (lição 8.3). Rejeitado aqui pelo objetivo de estudo; registrado como
  a alternativa que um time real deveria considerar primeiro.
- **Payments em Node/TypeScript.** Stack que o autor domina. Rejeitado: não exercita nada novo, e
  Java tem mais demanda em vagas de backend de pagamentos.

## Consequências

- Positivas: deploy e escala independentes; falha do Payments não derruba a criação de pedidos;
  contrato explícito e versionado; aprendizado das duas stacks lado a lado.
- Negativas: duas toolchains no CI (dois jobs, duas imagens base, dois scanners de dependência);
  observabilidade com nomes de métricas diferentes (lição 7.3); toda biblioteca interna (cliente
  de idempotência, tracing do Kafka) existe duas vezes; o plantão precisa ler as duas stacks.
- Obrigatório a partir daqui: paridade de práticas. Toda decisão transversal (logs, erros,
  probes, telemetria) é tomada uma vez e implementada nas duas, com uma tabela de equivalência
  (`docs/modulo-01j/dotnet-vs-spring.md`).

## Revisitar quando

- O time tiver menos de duas pessoas confortáveis em cada stack para o plantão; ou
- o custo de manter duas versões de cada biblioteca interna passar do ganho de independência
  (sinal: PRs "iguais" sendo abertos nos dois serviços toda semana).
