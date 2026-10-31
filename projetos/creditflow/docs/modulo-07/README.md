# Módulo 7: contêiner, Kubernetes e Helm com perfis de execução

**Objetivo:** empacotar o CreditFlow numa imagem pequena, sem shell e sem root, e publicá-lo no Kubernetes com **um chart e quatro Deployments** (api-geral, api-simulacao, api-pagamentos, worker-pagamentos), cada um com as sondas, os recursos e a escala que fazem sentido para ele. As migrações rodam como Job antes da versão nova subir, e a plataforma que o CreditFlow usa (Kafka com Strimzi, Dragonfly e Keycloak por operadores) roda no mesmo cluster. Tudo sobe num **kind** local, sem nuvem.

## O que você vai conseguir fazer no fim

- Explicar cada linha do `Dockerfile` e por que a imagem final é `aspnet:10.0-noble-chiseled-extra`
- Fazer o `dotnet restore` vir do cache quando só o código C# mudou, num monolito com 15+ projetos
- Ler o chart `creditflow` e prever o YAML que um perfil gera, incluindo as armadilhas do `mergeOverwrite`
- Escolher readiness, liveness e startup para uma API CPU-bound e para um worker de Kafka, e defender a escolha
- Aplicar o DDL dos módulos como Job em hook, sem travar o primeiro deploy e sem dar DDL para a aplicação
- Ler os recursos do Strimzi (KRaft, `KafkaNodePool`, `KafkaTopic`, `KafkaUser`), do Dragonfly e do Keycloak como código
- Subir o CreditFlow inteiro num kind e quebrar de propósito quatro coisas

## O que você constrói

- [`deploy/docker/Dockerfile`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/docker/Dockerfile)
- O chart [`deploy/helm/creditflow/`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/helm/creditflow/values.yaml) com `values.schema.json`
- Os charts de plataforma [`deploy/k8s/dados/`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/dados/values.yaml) (Kafka e Dragonfly) e [`deploy/k8s/keycloak/`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/keycloak/values.yaml)
- O laboratório [`deploy/k8s/local/subir.sh`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/local/subir.sh)

## Pré-requisitos

- Módulos 1 a 6 (a solução compila e roda no `docker compose`; o Kafka e a saga estão prontos)
- Docker (com buildx), [kind](https://kind.sigs.k8s.io/), `kubectl` e Helm 3.18+ ou 4.x
- Uns 8 GB de RAM livres para o laboratório completo
- Kubernetes e Helm básicos. Se pod, Service, sondas e `helm upgrade` ainda são novidade, faça antes os módulos 6 e 7 do curso [Plataforma .NET](../../plataforma-dotnet/docs/modulo-06/README.md): este módulo **não repete** aquela base, ele aplica num sistema maior e vai além

## Lições

| # | Lição | Tempo |
|---|---|---|
| 7.1 | [A imagem: multi-stage, cache de restore e chiseled](01-a-imagem.md) | 60 min |
| 7.2 | [Um chart, quatro perfis](02-um-chart-quatro-perfis.md) | 75 min |
| 7.3 | [Sondas, recursos e escala por perfil](03-sondas-recursos-e-escala.md) | 60 min |
| 7.4 | [Migrações como Job](04-migracoes-como-job.md) | 50 min |
| 7.5 | [A plataforma dentro do cluster: Strimzi, Dragonfly e Keycloak](05-plataforma-no-cluster.md) | 75 min |
| 7.6 | [Tudo num kind, e quatro quebras](06-laboratorio-kind.md) | 2 h |
| — | [Desafio do módulo](desafio.md) | 2–3 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |

Tempo estimado: **9 a 10 horas**, contando o desafio.

## Entregável do módulo

O CreditFlow rodando no kind com os quatro perfis prontos, e um quadro de uma página (pode ser no próprio README do seu fork) com **uma linha por perfil**: módulos, papel, sondas e por que, recursos e por que, como escala.
