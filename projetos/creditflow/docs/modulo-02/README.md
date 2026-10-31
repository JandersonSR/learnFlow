# Módulo 2: domínio de crédito, o módulo Simulação

**Objetivo:** entender a matemática de um empréstimo a ponto de explicá-la para o negócio (juros compostos, Price, SAC, IOF, CET) e transformá-la num módulo com DDD de verdade: value objects que não aceitam valor inválido, um agregado imutável, um motor de cálculo puro testado ao centavo, e um endpoint público protegido por rate limit.

## O que você vai conseguir fazer no fim

- Calcular à mão (ou numa planilha) a primeira linha de uma tabela Price e de uma SAC, e explicar por que as parcelas de uma são iguais e as da outra caem
- Explicar o IOF de uma operação de crédito e por que ele faz o CET ser maior que a taxa de juros
- Explicar o que é TIR, por que não existe fórmula fechada para ela e como o Newton-Raphson a encontra em 3 ou 4 passos
- Justificar `decimal` em vez de `double`, arredondamento bancário e "ajuste na última parcela"
- Modelar `ValorDoEmprestimo`, `PrazoEmMeses`, `FaixaDeScore` e o agregado `SimulacaoDeEmprestimo`, com o motor de cálculo como função pura
- Publicar um endpoint sem login com rate limit por IP, e testar o cálculo contra uma implementação independente

## O que você constrói

| Peça | No repositório |
|---|---|
| Motor de cálculo | [`Domain/Calculo/`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Domain/Calculo/MotorDeCalculo.cs) |
| Agregado e value objects | [`SimulacaoDeEmprestimo.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Domain/SimulacaoDeEmprestimo.cs), [`ValoresDaSimulacao.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Domain/ValoresDaSimulacao.cs) |
| Caso de uso e portas | [`Application/`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Application/CasosDeUso.cs) |
| Endpoints | [`Api/SimulacaoEndpoints.cs`](https://github.com/JandersonSR/lending-plataform/blob/main/src/Modules/Simulacao/CreditFlow.Modules.Simulacao/Api/SimulacaoEndpoints.cs) |
| Testes | [`tests/CreditFlow.Modules.Simulacao.Tests`](https://github.com/JandersonSR/lending-plataform/blob/main/tests/CreditFlow.Modules.Simulacao.Tests/MotorDeCalculoTests.cs) |

## Pré-requisitos

- [Módulo 1](../modulo-01/README.md) concluído (solução compilando, compose de pé)
- Python 3 na máquina, para a lição 2.6 (conferir a conta de outro jeito)
- Matemática do ensino médio: potência e porcentagem. O resto é construído aqui

::: armadilha Didático, não regulatório
Alíquotas de IOF, a fórmula do CET e as faixas de taxa do CreditFlow são **didáticas**. Elas seguem a estrutura real, mas antes de usar em qualquer coisa de verdade, confira a regulação vigente do Banco Central e da Receita Federal.
:::

## Lições

| # | Lição | Tempo |
|---|---|---|
| 2.1 | [Juros compostos e o vocabulário do crédito](01-juros-compostos.md) | 40 min |
| 2.2 | [Price × SAC, com uma tabela de verdade](02-price-e-sac.md) | 60 min |
| 2.3 | [IOF e CET: a TIR por Newton-Raphson](03-iof-e-cet.md) | 75 min |
| 2.4 | [`decimal`, arredondamento e o centavo que some](04-decimal-e-arredondamento.md) | 45 min |
| 2.5 | [Value objects, o agregado e o caso de uso](05-modelo-e-caso-de-uso.md) | 60 min |
| 2.6 | [Endpoint público, rate limit e testes: conferi a conta de dois jeitos](06-endpoint-e-testes.md) | 75 min |
| — | [Desafio: carência](desafio.md) | 3–4 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |

## Entregável

Uma planilha (ou script) sua com a tabela Price de R$ 10.000 em 12 meses a 2% a.m., batendo ao centavo com a resposta do `POST /v1/simulacoes`. E uma explicação de cinco minutos, para alguém de produto, de por que o CET é maior que a taxa de juros.
