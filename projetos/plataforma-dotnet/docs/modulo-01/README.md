# Módulo 1: ASP.NET 10 como monolito modular com DDD

**Objetivo:** entender por que a API de CEP é um monolito modular, ler o código dela sabendo o papel de cada projeto, aplicar DDD onde ele compensa (e reconhecer onde não compensa) e criar um segundo módulo com regra de negócio de verdade.

## O que você vai conseguir fazer no fim

- Explicar a diferença entre monolito em camadas, monolito modular e microsserviços, e quando escolher cada um, com custos concretos
- Desenhar as dependências entre os projetos da solução e dizer o que impede um módulo de usar as classes de outro
- Separar DDD estratégico (contextos, linguagem, subdomínios) de DDD tático (entidade, objeto de valor, agregado, evento)
- Justificar por que o módulo de CEP **não** tem agregado rico, e por que o de Parceiros tem
- Tratar falha prevista com `Resultado<T>` e código de erro estável, sem exceção
- Criar o módulo Parceiros do zero, com um teste que impede a fronteira de ser furada

## Lições

| # | Lição | Tempo |
|---|---|---|
| 1.1 | [O problema: por que não microsserviços, e por que não só camadas](01-o-problema.md) | 45 min |
| 1.2 | [Anatomia do projeto: quem pode enxergar quem](02-anatomia-do-projeto.md) | 60 min |
| 1.3 | [DDD estratégico: contextos, linguagem e onde investir](03-ddd-estrategico.md) | 60 min |
| 1.4 | [DDD tático: objeto de valor, entidade e agregado no código](04-ddd-tatico.md) | 90 min |
| 1.5 | [Erros previstos sem exceção: `Resultado<T>` e códigos estáveis](05-erros-e-resultado.md) | 45 min |
| 1.6 | [Como os módulos conversam sem se acoplar](06-comunicacao-entre-modulos.md) | 60 min |
| 1.7 | [Desafio: o módulo Parceiros](07-desafio-modulo-parceiros.md) | 3 a 5 h |
| — | [Perguntas de entrevista do módulo](perguntas-de-entrevista.md) | 30 min |

## Antes de começar

```bash
git clone https://github.com/JandersonSR/aks-step-by-step
cd aks-step-by-step
dotnet build
dotnet test --filter "Categoria!=Integracao"
```

Deixe o repositório aberto ao lado. As lições citam arquivos reais; abra cada um quando aparecer.

::: checkpoint
Você deve conseguir rodar `docker compose up --build` e receber 200 em `curl -i localhost:8080/v1/cep/01001000`. Se não rodar, resolva isso primeiro: o resto do módulo assume que você consegue experimentar.
:::

## Entregável do módulo

Um ADR curto (meia página) respondendo: **"Na nossa empresa, o próximo sistema deveria nascer como monolito modular ou como microsserviços?"** Use os argumentos das lições 1.1 e 1.6 com números do seu contexto (tamanho do time, quantos deploys por semana, quantas equipes mexem no mesmo código).

E uma apresentação de 20 minutos para o time sobre a lição 1.4.
