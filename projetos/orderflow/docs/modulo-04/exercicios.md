# Módulo 4: Exercícios

Cada exercício é um commit. Os critérios de aceite dizem quando está pronto. Anote o que quebrou e
por quê num `NOTAS.md`: é o material das suas respostas de entrevista.

## Exercício 1: Subir de verdade e corrigir o que divergir

1. Rode `./deploy/k8s/kind/up.sh`. **Os Dockerfiles e os charts não foram executados no ambiente
   onde o curso foi escrito** (sem Docker daemon e sem o binário do Helm). Se algo falhar, leia o
   erro inteiro, investigue com os comandos da lição 4.3 e corrija.
2. Rode `helm lint` nos três charts com cada arquivo de values.
3. Faça um pedido e um pagamento via `kubectl port-forward` e confira nos logs que os eventos
   passaram pelo Kafka do namespace `infra`.

**Aceite:** os 4 pods `Running` e `Ready`; `helm lint` sem erros; `NOTAS.md` com cada correção e a causa.

## Exercício 2: Medir as imagens

Monte uma tabela no `NOTAS.md` com tamanho (`docker images`) e número de camadas (`docker history`) de:

| Imagem | Base |
|---|---|
| Orders | `aspnet:10.0-noble-chiseled` (a do curso) |
| Orders | `aspnet:10.0-noble` |
| Payments | `distroless/cc` + jlink (a do curso) |
| Payments | `gcr.io/distroless/java25-debian13:nonroot`, sem jlink |
| Payments | `eclipse-temurin:25-jre` |

Depois, mude uma linha de código Java, rebuilde, faça `docker push` para um registry local
(`docker run -d -p 5001:5000 registry:2`) e meça quantos bytes cada push enviou.

**Aceite:** tabela preenchida; uma frase explicando por que o segundo push do Payments é pequeno;
uma varredura com `trivy image` (ou `docker scout cves`) de duas das imagens, com a contagem de CVEs comparada.

## Exercício 3: Subida rápida da JVM com AOT cache

Implemente o AOT cache do Java 25 no `payments.Dockerfile` (lição 4.2, lab de quebra) **sem**
depender do Postgres no build. Meça o tempo até a readiness passar, com e sem o cache, num pod
com `requests.cpu: 250m`.

**Aceite:** os dois tempos no `NOTAS.md`, medidos 3 vezes cada; explicação do que o treino grava e
por que ele fica inválido se a versão do JDK do build for diferente da de execução.

<details><summary>Dica</summary>

Um perfil de treino (`application-aot.yml`) que desliga datasource, migrations e o cliente Kafka
na subida, ativado só no `RUN` do treino com `-Dspring.profiles.active=aot`. Pense se as classes
carregadas nesse perfil representam o que a aplicação carrega em produção.
</details>

## Exercício 4: Treino CKAD cronometrado

Sem olhar os charts, em no máximo **20 minutos**, só com `kubectl create ... --dry-run=client -o yaml`
e edição do YAML gerado:

1. Namespace `treino`, Deployment `echo` com `hashicorp/http-echo:1.0` e argumento `-text=ok`, 3 réplicas.
2. Service ClusterIP na porta 80 apontando para a 5678.
3. Readiness HTTP em `/`, requests de 50m/32Mi, limite de memória 64Mi.
4. Um pod temporário que faz `curl` no Service e mostra `ok`.
5. Escale para 5, troque a imagem para uma tag inexistente, veja o rollout travar, desfaça com `rollout undo`.

**Aceite:** os comandos no `NOTAS.md` e o tempo gasto. Repita até ficar abaixo de 12 minutos.

## Exercício 5: O PDB que trava o drain

Instale o Orders com `replicaCount: 1` e o PDB padrão (`maxUnavailable: 1`). Rode
`kubectl drain orderflow-worker --ignore-daemonsets --delete-emptydir-data`. Depois mude o PDB
para `minAvailable: 1` e repita.

**Aceite:** no `NOTAS.md`, o que aconteceu em cada caso, por que, e qual configuração você usaria
num AKS com upgrade automático de nós (lição 6.1) para um serviço com 1 réplica e para um com 3.

---

## 🧩 Desafio sem roteiro: um library chart para os três serviços

Os charts `orders`, `payments` e `payments-streams` têm templates quase idênticos. Crie um chart
`deploy/helm/orderflow-lib` do tipo `library` com os named templates (Deployment, Service,
ConfigMap, Secret, ServiceAccount, PDB, HPA, ScaledObject, HTTPRoute, SecretProviderClass) e
reduza cada chart de serviço a `Chart.yaml` (com a dependência), `values*.yaml` e arquivos de
template de uma linha.

**Critérios de aceite:**

- `helm template` de cada chart, com cada arquivo de values, gera **exatamente** o mesmo YAML de
  antes (compare com `diff` sobre a saída ordenada).
- Um serviço consegue **acrescentar** algo só dele (ex.: um sidecar no payments-streams) sem
  editar a library.
- O `README` do library chart documenta cada value aceito, com o padrão.
- Um teste automatizado (script ou `helm unittest`) que falhe se alguém quebrar a renderização.
- No `NOTAS.md`: o que você ganhou, o que ficou mais difícil (versão da library, quem aprova
  mudanças nela) e quando você **não** faria isso.
