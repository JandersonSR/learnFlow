# Módulo 2: contrato da API: OpenAPI, Swagger e Scalar, ProblemDetails, versionamento

**Objetivo:** tratar a API como um contrato com quem integra: descrevê-la de forma que máquinas e pessoas leiam, padronizar erros e cabeçalhos, e evoluir sem quebrar ninguém.

## O que você vai conseguir fazer no fim

- Explicar a diferença entre a especificação OpenAPI e as interfaces que a mostram (Swagger UI, Scalar, ReDoc)
- Explicar por que o Swagger "sumiu" do template do .NET 9 e o que ficou no lugar
- Descrever um endpoint Minimal API de forma que a especificação gerada fique completa, inclusive os erros
- Dizer, para qualquer mudança, se ela quebra ou não quem já integra
- Proteger o contrato com um teste que falha quando a especificação muda sem querer

## Lições

| # | Lição | Tempo |
|---|---|---|
| 2.1 | [O contrato: OpenAPI, Swagger e Scalar](01-o-contrato.md) | 45 min |
| 2.2 | [Descrevendo bem cada endpoint](02-descrevendo-endpoints.md) | 60 min |
| 2.3 | [Erros, cabeçalhos e correlação como parte do contrato](03-erros-e-cabecalhos.md) | 45 min |
| 2.4 | [Versionar e evoluir sem quebrar ninguém](04-versionamento.md) | 75 min |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Antes de começar

```bash
cd aks-step-by-step
cp .env.example .env
docker compose up --build
```

Com a API de pé, abra `http://localhost:8080/docs` (Scalar) e `http://localhost:8080/openapi/v1.json` (a especificação). O compose sobe a API em `Development`, onde a documentação está ligada.

## Entregável do módulo

Um teste de contrato no aks-step-by-step (desafio da lição 2.4) e um guia de uma página para o time: **"Esta mudança na API quebra os parceiros?"**, com a tabela da lição 2.4 adaptada às APIs da empresa.
