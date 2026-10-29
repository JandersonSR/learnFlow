# Módulo 6: contêiner e Kubernetes do zero

**Objetivo:** entender a imagem da API camada por camada, os objetos do Kubernetes que a fazem rodar, como o cluster decide se um pod está vivo e pronto, como um pod termina sem derrubar requisições, e como diagnosticar os estados de erro mais comuns.

## O que você vai conseguir fazer no fim

- Explicar cada linha do `Dockerfile` da API e por que a imagem final não tem shell nem root
- Desenhar o caminho de uma requisição até um contêiner: Service → Pod → contêiner, passando pelos rótulos
- Explicar a diferença entre startup, readiness e liveness, e o que acontece se cada uma estiver errada
- Explicar os 40 segundos de encerramento do pod e por que existe um `preStop` de 10 segundos
- Diagnosticar `Pending`, `ImagePullBackOff`, `CrashLoopBackOff`, `OOMKilled` e `0/1 Running` em minutos

## Lições

| # | Lição | Tempo |
|---|---|---|
| 6.1 | [A imagem da API, camada por camada](01-a-imagem.md) | 50 min |
| 6.2 | [Do contêiner ao pod: os objetos do Kubernetes](02-objetos-do-kubernetes.md) | 60 min |
| 6.3 | [Sondas, recursos e um encerramento sem perder requisições](03-sondas-e-encerramento.md) | 60 min |
| 6.4 | [Diagnóstico: do sintoma à causa](04-diagnostico.md) | 75 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Onde está a prática

Primeiro os módulos do [kub-learn-flow](https://github.com/JandersonSR/kub-learn-flow), no Minikube e sem custo; cada lição aqui aponta para o módulo de lá. Depois o [nível 01](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/01-aks-minimo.md) do aks-step-by-step, que leva a API para o AKS com um único YAML.

## Entregável do módulo

Uma tabela de diagnóstico para o time (a da lição 6.4, com os comandos e as saídas que **você** viu nos labs) e uma apresentação de 20 minutos sobre o encerramento do pod da lição 6.3.
