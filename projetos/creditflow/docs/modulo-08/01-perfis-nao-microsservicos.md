# 8.1 Perfis, não microsserviços (ainda)

A Simulação é pública e recebe rajadas de tráfego. O worker de Pagamentos fica parado metade do dia e de repente tem 2.000 contratos para desembolsar. Clientes e Propostas têm carga baixa e estável. Escalar o processo inteiro para atender a Simulação multiplica, junto, os pools de conexão com o Postgres de módulos que não precisavam de nada.

A resposta "padrão de mercado" seria quebrar em microsserviços. A resposta do CreditFlow é outra, e entender por que é o que separa uma decisão de arquitetura de uma moda.

## O que se quer de verdade

Separe o desejo da solução:

| Necessidade | Microsserviços dão? | Perfis dão? |
|---|---|---|
| Simulação escalar sem escalar o resto | Sim | **Sim** |
| Rajada na Simulação não degradar Propostas | Sim | **Sim** (pods diferentes, recursos diferentes) |
| Worker escalar pela fila | Sim | **Sim** |
| Deploy independente por time | Sim | Não (uma imagem) |
| Stack diferente por módulo | Sim | Não |
| Banco realmente isolado por módulo | Sim | Parcial (schemas separados, mesmo servidor) |

As três primeiras linhas são o problema de hoje. As três últimas são problemas de **organização** que o CreditFlow não tem: um time, um ritmo de deploy, uma stack.

## O que é um perfil

A mesma imagem sobe com duas variáveis ([ADR 0002](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0002-perfis-de-execucao.md)):

```yaml
# trecho do Deployment gerado pelo chart para o perfil worker-pagamentos
env:
  - name: CREDITFLOW__MODULOS
    value: Pagamentos
  - name: CREDITFLOW__PAPEL
    value: worker
```

O `Program.cs` tem um catálogo explícito de módulos e registra só os do perfil. O papel decide o resto: `api` mapeia endpoints; `worker` não mapeia nada de negócio e liga os consumidores. Em Pagamentos ([`PagamentosModule.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Pagamentos/CreditFlow.Modules.Pagamentos/PagamentosModule.cs)):

```csharp
services.AddOutboxRelay<PagamentosDbContext>();          // nos dois papéis: api e worker gravam eventos

if (EhWorker(configuration))
    services.AddConsumidorKafka(configuration, GrupoDeConsumidores, [Topicos.Propostas])
            .Manipular<ContratoAssinado, AoContratoAssinado>();
```

| Perfil | Módulos | Papel | Requests | Escala |
|---|---|---|---|---|
| `api-geral` | Clientes, Propostas, Notificacoes | api | 250m / 384Mi | HPA CPU 70%, 2 a 6 |
| `api-simulacao` | Simulacao | api | **500m** / 256Mi, sem limite de CPU | HPA CPU **60%**, 2 a **12** |
| `api-pagamentos` | Pagamentos | api | 100m / 256Mi | fixo, 2 |
| `worker-pagamentos` | Pagamentos | worker | 100m / 256Mi | **KEDA lag**, 1 a **6** |

::: analogia
Na linha de montagem, a estação de solda é o gargalo e a de embalagem fica ociosa. Você não constrói outra fábrica para a solda: põe mais soldadores **na mesma fábrica**, com o mesmo procedimento e as mesmas peças. Perfis são isso: mais gente na estação que precisa, todos treinados pelo mesmo manual (a mesma imagem).
:::

## O roteamento por caminho

O chart gera um `HTTPRoute` (Gateway API) com uma regra por perfil que tem rotas ([`rotas.yaml`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/helm/creditflow/templates/rotas.yaml)):

```yaml
rules:
  - matches: [{ path: { type: PathPrefix, value: /v1/simulacoes } }]
    backendRefs: [{ name: creditflow-api-simulacao, port: 80 }]
  - matches: [{ path: { type: PathPrefix, value: /v1/pagamentos } }]
    backendRefs: [{ name: creditflow-api-pagamentos, port: 80 }]
  - matches: [{ path: { type: PathPrefix, value: / } }]
    backendRefs: [{ name: creditflow-api-geral, port: 80 }]
```

::: conceito Prefixo mais longo vence
Na Gateway API (e no Ingress), quando mais de uma regra casa, vence a de **prefixo mais longo**, não a primeira da lista. `/v1/simulacoes/123` casa com `/v1/simulacoes` e com `/`; vence `/v1/simulacoes`. Por isso `/` pode estar em qualquer posição e só pega o resto. E `PathPrefix` casa por **segmento**: `/v1/simulacoes` não casa `/v1/simulacoesX`.
:::

::: previsao
O worker-pagamentos não tem rota nem Service (`servico: false` no values). Um colega diz: "então ele nem precisa da porta 8080". Ele está certo?
???
Não. Ninguém chama o worker por HTTP de negócio, mas o **kubelet** chama: startup, readiness e liveness são HTTP na 8080 (`/healthz/live` com o batimento do laço de consumo, lição 6.4). Sem a porta, as sondas falham e o pod reinicia em laço. A porta existe; o que não existe é Service e rota, porque nenhum outro pod deve achar o worker.
:::

## O que os perfis NÃO resolvem

::: armadilha O pool de conexões multiplica
Cada réplica abre seu próprio pool. `api-simulacao` em 12 réplicas × pool do Mongo; `worker-pagamentos` em 6 × `Maximum Pool Size=40` do Postgres = 240 conexões só dele, mais as APIs. O Flexible Server tem `max_connections` por SKU. Escala automática que não olha esse teto troca "fila no Kafka" por "too many connections" no Postgres, que derruba **todos** os módulos. Faça a conta antes de subir um máximo (lição 8.4).
:::

::: armadilha Rate limit em memória é por pod
A Simulação limita 30 requisições por minuto por IP **em cada pod** (`Simulacao__RequisicoesPorMinuto`). Com 12 réplicas, o limite efetivo de um IP vira até 360/min, dependendo de como o balanceador distribui. Para limite global, o contador precisa ficar fora do pod (Dragonfly, ou no gateway de borda). Escalar muda o comportamento de proteções que pareciam fixas.
:::

## Perguntas para responder sem olhar

::: pergunta
O que perfis de execução dão e o que não dão, comparados a microsserviços?
???
Dão escala e isolamento de carga por módulo com uma imagem só, sem rede entre módulos. Não dão deploy independente, stack diferente por módulo nem banco realmente separado.
:::

::: pergunta
Num HTTPRoute com regras `/` e `/v1/pagamentos`, para onde vai `/v1/pagamentos/desembolsos`?
???
Para a regra `/v1/pagamentos`: vence o prefixo mais longo, independentemente da ordem das regras.
:::

**Próxima:** [8.2 CPU-bound × I/O-bound](02-cpu-bound-io-bound.md).
