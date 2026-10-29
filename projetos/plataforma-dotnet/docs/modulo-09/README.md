# Módulo 9: Terraform: infraestrutura em camadas, estado remoto e revisão em PR

**Objetivo:** tratar a infraestrutura como código: entender o ciclo plan/apply, o que é o estado e por que ele é o arquivo mais sensível do projeto, por que o ambiente é dividido em camadas, e como mudar infraestrutura com a mesma revisão que se faz em código.

## O que você vai conseguir fazer no fim

- Explicar provider, resource, data source, variável, output e estado com exemplos do projeto
- Ler um `terraform plan` e dizer o que vai ser criado, alterado, destruído ou recriado
- Explicar por que o estado fica num storage remoto, com trava e versionamento, e por que ele contém segredos
- Explicar a divisão em camadas (00, 10, 20, 30) e como uma camada lê a saída da outra
- Reconhecer e corrigir *drift* (o ambiente diferente do código)

## Lições

| # | Lição | Tempo |
|---|---|---|
| 9.1 | [Infraestrutura como código e o ciclo plan/apply](01-iac-e-plan.md) | 50 min |
| 9.2 | [O estado: o arquivo mais sensível do projeto](02-estado.md) | 50 min |
| 9.3 | [Camadas, dependências e o dia a dia](03-camadas.md) | 60 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Onde está a prática

[Nível 10](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/10-terraform.md) do aks-step-by-step e a pasta [`infra/`](https://github.com/JandersonSR/aks-step-by-step/tree/main/infra). O gabarito tem as mesmas camadas em [`squad-dotnet-kubernetes/infra`](https://github.com/JandersonSR/squad-dotnet-kubernetes/tree/main/infra). Para aprofundar, a trilha [Terraform AKS e Event Hubs](trilha:terraform-aks-e-event-hubs).

## Entregável do módulo

Um PR no seu fork mudando uma configuração de infraestrutura (por exemplo, `nos_max`), com o `terraform plan` colado na descrição e uma frase explicando cada linha do plano.
