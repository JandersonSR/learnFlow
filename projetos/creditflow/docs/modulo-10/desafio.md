# Desafio do módulo 10: a CVE de sexta-feira

Sexta, 17h. Sai uma CVE crítica, com correção, numa biblioteca do sistema presente na imagem base `aspnet:10.0-noble-chiseled-extra`. O scan agendado do Harbor marca a imagem de produção do CreditFlow, e a política do projeto passa a recusar o pull dela. Nada caiu ainda.

::: desafio O pedido
1. Escreva o **procedimento** (um runbook novo, `docs/runbooks/cve-na-imagem-base.md`) para sair dessa situação em menos de uma hora, do alerta ao digest novo rodando em prod, sem desligar nenhuma proteção do módulo.
2. Faça o pipeline **detectar sozinho** que a imagem base mudou: hoje o CI só roda quando há commit. Crie um gatilho que reconstrói a imagem quando a Microsoft publica uma base nova, sem rebuild desnecessário todo dia.
3. Faça o Harbor avisar em vez de você descobrir pelo `ImagePullBackOff`: um webhook do projeto para quando um scan encontrar vulnerabilidade, mandando para onde o time olha.
:::

## Critérios de aceite

- [ ] O runbook diz **quem** pode fazer cada passo e cobre: confirmar (`trivy image` na imagem de prod), reconstruir (que commit? nenhum: por quê?), promover pelo fluxo normal (PR dev → prod), e o que fazer se o autoescalador precisar de pods **antes** da imagem nova chegar.
- [ ] O gatilho do item 2 roda agendado, compara o digest atual da base (`docker buildx imagetools inspect mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled-extra --format '{{json .Manifest.Digest}}'`) com o usado no último build e só dispara o build quando mudou.
- [ ] O build reconstruído gera digest **novo**, assinado pelo `ci.yml@refs/heads/main` (o workflow agendado precisa ser o mesmo arquivo ou estar na identidade aceita pela política).
- [ ] O webhook do Harbor está configurado (evento "Scanning finished" ou equivalente da versão 2.15) e você mostrou uma notificação recebida.
- [ ] Um parágrafo: por que **não** é aceitável resolver com uma linha no `.trivyignore` nesse cenário.

::: dica Dica 1
O `workflow_dispatch` e o `schedule` podem ficar no próprio `ci.yml`, e um job inicial decide se o resto roda (`outputs` + `if:`). Guarde o digest da base usada num rótulo da imagem (`LABEL org.opencontainers.image.base.digest`) e leia o da imagem atual com `crane config` ou `imagetools inspect`.
:::

::: dica Dica 2
Rebuild sem commit gera a mesma versão de código com outra base. A tag `0.1.<run>-<sha>` muda pelo `run_number`, e o digest muda pelas camadas. O PR de deploy deixa isso explícito no corpo.
:::

::: solucao Pontos que uma boa resposta tem
- O rebuild não precisa de commit: o `FROM` sem digest pega a base nova (é por isso que o projeto **não** fixa a base por digest no Dockerfile; quem garante reprodutibilidade é o SBOM + proveniência). Quem fixa a base por digest troca o Dependabot pelo gatilho: tudo vira PR.
- Enquanto a imagem nova não chega, o HPA pode precisar de pods: nós já existentes têm a imagem em cache e sobem; nós novos não. Mitigação temporária aceitável: subir o mínimo do HPA/autoescalador de nós **antes** de o problema aparecer? Não: subir réplicas também cria pods em nós novos. O certo é priorizar a imagem nova; como último recurso, liberar temporariamente o pull **daquele digest** no Harbor (CVE allowlist do projeto com prazo de 24 h), registrado no incidente.
- `.trivyignore` não resolve: a CVE tem correção, e ignorá-la deixa a vulnerabilidade em produção para sempre; o `.trivyignore` é para falso positivo e CVE sem caminho de exploração, com data.
:::
