# Módulo 10: Harbor e a cadeia de suprimentos

**Objetivo:** garantir que o que roda no AKS é exatamente o que o CI construiu a partir da `main`, sem vulnerabilidade crítica conhecida, e que ninguém consegue trocar a imagem no caminho. Você monta o caminho inteiro: build e scan no GitHub Actions, push no **Harbor** com uma conta de robô que só faz isso, assinatura **keyless** com cosign, SBOM anexado, e um controlador de admissão no cluster que **recusa** o pod se a imagem não tiver a assinatura certa.

## O que você vai conseguir fazer no fim

- Explicar os pontos onde uma cadeia de suprimentos é atacada, com um caso real de 2026
- Ler o `ci.yml` e dizer por que cada ação é fixada por SHA e por que o scan vem antes do push
- Organizar o Harbor em projetos, robôs com escopo mínimo, política de bloqueio por severidade, retenção e cache de proxy
- Assinar uma imagem por digest sem guardar chave nenhuma, e explicar o papel do Fulcio e do Rekor
- Configurar o policy-controller para aceitar só imagens assinadas pelo workflow da `main`, e provar que uma imagem não assinada é recusada

## O que você constrói

- [`.github/workflows/ci.yml`](https://github.com/JandersonSR/lending-plataform/blob/main/.github/workflows/ci.yml) e [`deploy/docker/.trivyignore`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/docker/.trivyignore)
- O Harbor em [`infra/terraform/20-plataforma/harbor.tf`](https://github.com/JandersonSR/lending-plataform/blob/main/infra/terraform/20-plataforma/harbor.tf) e o segredo de pull em [`deploy/k8s/plataforma/templates/harbor-pull.yaml`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/plataforma/templates/harbor-pull.yaml)
- A política de assinatura [`ClusterImagePolicy creditflow-assinada`](https://github.com/JandersonSR/lending-plataform/blob/main/deploy/k8s/plataforma/templates/emissor-e-segredos.yaml)
- A ADR [0008: Harbor e não ACR](https://github.com/JandersonSR/lending-plataform/blob/main/docs/adr/0008-harbor.md)

## Pré-requisitos

- Módulo 9 aplicado (o Harbor sobe na camada 20-plataforma) e o Gateway com TLS (módulo 11 instala a configuração de plataforma; para este módulo basta o Harbor responder em `https://harbor.<dominio>`)
- `cosign` 3.x e `crane` ou `docker buildx imagetools` na máquina
- A base deste assunto está no módulo 10 da Plataforma: [Trivy e o que vem dentro da imagem](../../plataforma-dotnet/docs/modulo-10/01-cadeia-e-trivy.md), [Harbor](../../plataforma-dotnet/docs/modulo-10/02-harbor.md) e [digest, SBOM e assinatura](../../plataforma-dotnet/docs/modulo-10/03-alem-do-scan.md). Aqui não repetimos o que é um CVE nem o que é um digest; aplicamos com robôs, cache e verificação no cluster

## Lições

| # | Lição | Tempo |
|---|---|---|
| 10.1 | [Onde a cadeia é atacada, e o CI que se defende](01-a-cadeia-e-o-ci.md) | 60 min |
| 10.2 | [Harbor: projetos, robôs e política de bloqueio](02-harbor-projetos-e-robos.md) | 60 min |
| 10.3 | [Cache de proxy: o Docker Hub sem o limite do Docker Hub](03-cache-de-proxy.md) | 35 min |
| 10.4 | [Assinatura keyless e verificação no cluster](04-assinatura-e-verificacao.md) | 75 min |
| — | [Desafio do módulo](desafio.md) | 2–3 h |
| — | [Perguntas de entrevista](perguntas-de-entrevista.md) | 30 min |

Tempo estimado: **7 a 8 horas**, contando o desafio.

## Entregável do módulo

Um print (ou o log) de três tentativas no namespace `creditflow`: uma imagem do CI da `main` aceita, a mesma imagem por **tag** de outro repositório recusada, e uma imagem sem assinatura recusada, com a mensagem do policy-controller de cada uma.
