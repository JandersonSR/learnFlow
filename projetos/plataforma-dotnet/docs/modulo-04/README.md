# Módulo 4: cache em camadas: HybridCache, Dragonfly e o que fazer quando o cache cai

**Objetivo:** entender por que a API tem três camadas de cache, o que cada uma resolve, como o HybridCache as junta, onde o desenho atual ainda deixa a fonte exposta, e como a API se comporta quando o Dragonfly cai.

## O que você vai conseguir fazer no fim

- Explicar cache-aside e as alternativas, e por que um cache nunca é a fonte da verdade
- Justificar as três validades (5 minutos, 60 minutos, 30 dias) sem consultar
- Ler o `ConsultarCepHandler` e explicar cada passo do fluxo memória → banco → fonte
- Explicar o que é a debandada (*cache stampede*) e onde o handler atual está protegido e onde não está
- Prever o comportamento da API com o Dragonfly fora e escolher os timeouts certos

## Lições

| # | Lição | Tempo |
|---|---|---|
| 4.1 | [Por que três camadas de cache](01-tres-camadas.md) | 50 min |
| 4.2 | [HybridCache por dentro e a debandada](02-hybridcache-e-debandada.md) | 75 min |
| 4.3 | [Quando o cache falha](03-quando-o-cache-falha.md) | 50 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Onde está a prática

[Nível 14](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/14-dragonfly.md) do aks-step-by-step. Os labs rodam no `docker compose`, que já sobe o Dragonfly.

## Entregável do módulo

Um ADR curto respondendo: **"Para os dados de [escolha uma tela ou API da empresa], que camadas de cache e que validades?"**, com a conta de quanto tempo um dado desatualizado pode ser servido e quem aceita isso.
