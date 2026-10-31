# Módulo 5: cache com Dragonfly

**Objetivo:** pôr um cache na frente da tabela de taxas da simulação, o endpoint mais chamado do CreditFlow, sabendo o que ele resolve, o que ele quebra e como ele se comporta quando cai. E sair com uma regra clara do que **nunca** vai para cache num sistema de crédito.

## O que você vai conseguir fazer no fim

- Explicar o que é o Dragonfly, como ele difere do Redis por dentro, e por que trocar um pelo outro é trocar a imagem
- Ler o `TabelaDeTaxasEmCache` e explicar chave, versão da chave, validades de L1 e L2, tags e serialização
- Provar que 200 simulações simultâneas com a chave fria fazem **uma** ida à origem por processo
- Classificar dados de crédito em "pode cachear", "pode com cuidado" e "nunca"
- Invalidar por evento entre réplicas (pub/sub) e dizer o limite de divergência que sobra
- Derrubar o Dragonfly e mostrar que a simulação continua respondendo

## O que você constrói

- [`Simulacao/Infrastructure/Cache/`](https://github.com/JandersonSR/lending-plataform/tree/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Infrastructure/Cache): o decorador com HybridCache, a invalidação e o registro resiliente
- Testes de integração contra um Dragonfly em contêiner: [`CacheDeTaxasTests.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/tests/CreditFlow.IntegrationTests/Cache/CacheDeTaxasTests.cs)
- O ADR [`0005-dragonfly.md`](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0005-dragonfly.md)

## Pré-requisitos

- Módulo 2 (o módulo Simulação e a tabela de taxas por faixa de score)
- O curso Plataforma .NET, **módulo 4**, que ensina a base que este módulo aplica a crédito:
  - [4.1 Por que três camadas de cache](../../../plataforma-dotnet/docs/modulo-04/01-tres-camadas.md) (cache-aside, validades)
  - [4.2 HybridCache por dentro e a debandada](../../../plataforma-dotnet/docs/modulo-04/02-hybridcache-e-debandada.md)
  - [4.3 Quando o cache falha](../../../plataforma-dotnet/docs/modulo-04/03-quando-o-cache-falha.md) (parâmetros da connection string)
- Você já usou Redis em Node (`ioredis`/`node-redis`): os comandos são os mesmos

## Lições

| # | Lição | Tempo |
|---|---|---|
| 5.1 | [Dragonfly: o que é e por que no lugar do Redis](01-dragonfly.md) | 40 min |
| 5.2 | [HybridCache na tabela de taxas](02-hybridcache-nas-taxas.md) | 60 min |
| 5.3 | [O que cachear em crédito, e o que nunca](03-o-que-cachear.md) | 40 min |
| 5.4 | [Invalidação por evento e cache fora do ar (lab)](04-invalidacao-e-cache-fora.md) | 75 min |
| — | [Desafio do módulo](desafio.md) | 2 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |

Tempo estimado: **6 a 7 horas**, contando o desafio.

## Entregável do módulo

O desafio resolvido e, para uma API da sua empresa, a lista dos três dados mais lidos com a classificação "pode / com cuidado / nunca" e a validade escolhida, justificada pela pergunta: **quanto tempo este dado pode estar errado, e quem paga se estiver?**
