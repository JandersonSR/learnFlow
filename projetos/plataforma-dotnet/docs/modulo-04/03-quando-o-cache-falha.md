# 4.3 Quando o cache falha

Um cache bem desenhado tem uma propriedade simples: **se ele sumir, o sistema fica mais lento, não fora do ar**. Esta lição testa essa propriedade e mostra as configurações que a garantem.

## A connection string do Dragonfly, parâmetro por parâmetro

Do `values.yaml` do chart:

```yaml
ConnectionStrings__Cache: "dragonfly.cache.svc.cluster.local:6379,abortConnect=false,connectTimeout=1000,syncTimeout=500"
```

| Parâmetro | O que faz | Sem ele |
|---|---|---|
| `dragonfly.cache.svc.cluster.local` | DNS interno do Service `dragonfly` no namespace `cache` | — |
| `abortConnect=false` | Se o Dragonfly estiver fora quando a API sobe, a conexão é criada assim mesmo e tenta reconectar em segundo plano | A API **não sobe** enquanto o cache estiver fora: um componente opcional virou obrigatório |
| `connectTimeout=1000` | Espera no máximo 1 s para conectar | O padrão é bem maior; a primeira requisição depois de uma queda fica pendurada |
| `syncTimeout=500` | Cada operação espera no máximo 500 ms | Com o cache lento, cada requisição esperaria o padrão (segundos) antes de desistir e ir ao banco |

::: porque Timeouts curtos de propósito
O Dragonfly responde em cerca de 1 ms quando está bem. Se ele demorar 500 ms, já não está ajudando: ir ao banco seria mais rápido. Um timeout curto transforma "cache lento" em "cache ausente", e a API segue pelo banco. Um timeout longo faria o cache lento deixar **todas** as requisições lentas.
:::

## Lab: derrubar o cache

::: quebra
Com o `docker compose up` rodando:

```bash
# 1. Esquente um CEP e meça
curl -s -o /dev/null -w "%{time_total}s\n" localhost:8080/v1/cep/01001000
curl -si localhost:8080/v1/cep/01001000 | grep -i x-cache

# 2. Derrube o Dragonfly
docker compose stop dragonfly

# 3. Repita com o mesmo CEP e com um CEP novo
curl -si localhost:8080/v1/cep/01001000 | grep -i x-cache
curl -si localhost:8080/v1/cep/20040020 | grep -i x-cache
curl -s -o /dev/null -w "%{time_total}s\n" localhost:8080/v1/cep/01310100

# 4. Volte com ele
docker compose start dragonfly
```

Antes de rodar o passo 3, escreva: a API responde? Com que `X-Cache-Camada`? Fica mais lenta? Quanto?
:::

::: solucao
- **A API responde em todos os casos.** É a propriedade que importa.
- **O CEP já consultado** pode vir com `X-Cache-Camada: memoria`, porque o L1 (memória do pod) não depende do Dragonfly e ainda vale por até 5 minutos. Depois que o L1 vencer, vem `banco`.
- **O CEP novo** vem de `fonte`, como viria de qualquer jeito.
- **A latência** sobe um pouco nas requisições que tentam o Dragonfly: cada tentativa espera no máximo o `connectTimeout`/`syncTimeout`, e o cliente do Redis passa a falhar rápido enquanto a conexão está marcada como caída.

Olhe os logs da API (`docker compose logs api`): aparecem avisos de conexão com o Redis. É o que você quer: o problema fica visível nos logs e nas métricas, mas não chega ao parceiro.

No cluster, o equivalente está no guia do nível 14: `kubectl scale deploy dragonfly -n cache --replicas=0`.
:::

::: previsao
E se alguém mudasse o `syncTimeout` para `10000` (10 segundos) e o Dragonfly ficasse **lento** (não fora: respondendo em 8 segundos por causa de um disco ruim ou de CPU no limite)? O que aconteceria com a API?
???
Cada requisição que consulta o L2 esperaria **8 segundos** pela resposta do Dragonfly, que chegaria dentro do timeout. A API ficaria lenta para **todos** os parceiros, as requisições se acumulariam, os pods ficariam com threads ocupadas esperando, e o HPA talvez escalasse mais pods, que também esperariam o Dragonfly.

**Lento é pior que fora.** Fora, o erro é rápido e a API segue pelo banco. Lento, o erro nunca vem. É por isso que todo acesso a dependência precisa de timeout curto e explícito, e é a mesma lógica dos timeouts do cliente do ViaCEP (`AttemptTimeout` de 3 s, total de 8 s, no `CepModulo`).
:::

## O Dragonfly no cluster: decisões de operação

Do chart [`infra/20-plataforma/charts/dragonfly`](https://github.com/JandersonSR/aks-step-by-step/tree/main/infra/20-plataforma/charts/dragonfly):

| Decisão | Por quê |
|---|---|
| Uma instância, sem disco, sem réplica | É cache: se o pod reiniciar, a API lê do banco e o cache esquenta de novo. Persistência e réplica custariam sem ganho |
| `--cache_mode=true` | Cheio, ele descarta as chaves menos usadas em vez de recusar gravações. É o comportamento certo para um cache |
| `--maxmemory=256mb` com limite de 512 MiB no contêiner | Folga entre o que o Dragonfly usa para dados e o limite do contêiner, para estruturas internas e picos. Sem folga, o Kubernetes mata o pod por falta de memória (`OOMKilled`) |
| Sem senha | Só alcançável dentro do cluster. Para produção, o guia recomenda `--requirepass` com a senha no Key Vault e uma NetworkPolicy liberando só o namespace `cep` |

::: armadilha
"Só alcançável dentro do cluster" significa alcançável por **qualquer pod** do cluster, inclusive um que tenha sido comprometido em outro namespace. Num cluster compartilhado por vários times, cache sem senha e sem NetworkPolicy é um vazamento esperando acontecer: qualquer um lê e escreve nos dados em cache. A NetworkPolicy é o que torna o "só dentro do cluster" verdadeiro.
:::

## Invalidação: o problema difícil

Hoje, um CEP só sai do cache quando a validade acaba. Se um dado precisar ser corrigido **agora** (um endereço errado gravado no banco), ele continua sendo servido por até 60 minutos pela memória.

| Opção | Como | Custo |
|---|---|---|
| Esperar vencer | Nada | Até 60 min de dado errado |
| Remover a chave | `memoria.RemoveAsync("cep:01001000")` num endpoint administrativo ou numa ferramenta | Remove do L2 e do L1 **do pod que executou**; os outros pods mantêm o L1 por até 5 min |
| Tags | Gravar com `tags: ["uf:SP"]` e chamar `RemoveByTagAsync("uf:SP")` | Invalida grupos de chaves de uma vez |
| Validades menores | Diminuir `Cep__MemoriaEmMinutos` | Mais idas ao banco |

::: porque Por que o L1 curto importa aqui
A invalidação chega ao L2 (compartilhado), mas cada pod tem o próprio L1. O L1 de 5 minutos é o que limita quanto tempo um pod pode continuar com a versão antiga depois de uma remoção. É mais um motivo para ele ser bem menor que o L2.
:::

## Perguntas para responder sem olhar

::: pergunta
Para que serve `abortConnect=false` na connection string do Redis/Dragonfly?
???
Para a aplicação subir mesmo com o cache fora, conectando em segundo plano quando ele voltar. Sem isso, um componente opcional (o cache) impediria a API de subir.
:::

::: pergunta
Por que um cache lento é pior que um cache fora do ar, e como o projeto se protege?
???
Fora, as operações falham rápido e a API segue pelo banco. Lento, cada requisição espera a resposta e a API inteira fica lenta. O projeto usa timeouts curtos (`connectTimeout=1000`, `syncTimeout=500`) para transformar cache lento em cache ausente.
:::

::: pergunta
Remover uma chave do HybridCache invalida o dado em todos os pods na hora?
???
Não. Remove do L2 (compartilhado) e do L1 do pod que executou a remoção. Os outros pods mantêm o L1 até ele vencer, por isso o L1 tem validade curta (5 minutos).
:::

**Próxima:** [Perguntas de entrevista do módulo](perguntas-de-entrevista.md).
