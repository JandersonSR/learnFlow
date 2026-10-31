# 0008. Deploy por pipeline (push) com OIDC, rolling update e Helm `--rollback-on-failure`

- **Status:** Aceito
- **Data:** 2026-10-30
- **Decisores:** Janderson, revisão do time

## Contexto

O código está no GitHub; as imagens vão para o ACR e os serviços rodam no AKS. O jeito clássico
de dar ao pipeline acesso à Azure é um service principal com senha guardada como secret, com
renovação manual e risco de vazamento de uma credencial de longa duração. Os deploys precisam
acontecer em horário comercial sem janela de manutenção, com os dois serviços em versões
diferentes por alguns minutos (rolling update).

## Decisão

- **GitHub Actions** com workflows reutilizáveis: `ci.yml` (testes das duas stacks), `_imagem.yml`
  (build → scan Trivy → push), `_deploy.yml` (Helm), orquestrados pelo `cd.yml`.
- **OIDC com credenciais federadas**: nenhum segredo da Azure no GitHub. Uma identidade com `AcrPush`
  para as imagens e uma por ambiente para o AKS, cada uma aceitando só o subject do seu
  environment. Produção exige aprovação de revisor no environment `prod`.
- Imagem implantada **por digest**; a mesma imagem passa por dev e prod.
- `helm upgrade --install --rollback-on-failure --wait=watcher --timeout 10m`, com rolling update
  `maxSurge: 1`/`maxUnavailable: 0`, readiness como portão, `preStop` e PDB (lição 7.7).
- Migrations sempre compatíveis com a versão anterior (expand/contract).

## Alternativas consideradas

- **GitOps com Argo CD ou Flux** (o cluster puxa do Git). Melhor em segurança (nenhuma credencial do
  cluster fora dele), auditoria e correção de desvio. Rejeitado **por enquanto**: mais uma peça para
  operar e aprender ao mesmo tempo que o resto da plataforma, e o OIDC por environment já remove o
  maior risco do push. É o próximo passo natural.
- **Service principal com segredo.** Rejeitado pelo risco de credencial de longa duração.
- **Canário ou blue/green** (Argo Rollouts, Flagger). Reduz o raio de impacto de um bug que passa na
  readiness. Rejeitado no volume atual: rolling com rollback automático e alertas por SLO cobrem o
  risco a um custo muito menor.
- **Azure DevOps Pipelines.** Equivalente em capacidade; rejeitado por manter código e pipeline no mesmo lugar.

## Consequências

- Positivas: nenhuma credencial para vazar ou renovar; deploy sem downtime verificável; rollback
  automático quando a readiness falha; a imagem analisada é a que roda.
- Negativas: o pipeline tem acesso de escrita ao cluster durante o job (mitigado por identidade
  por ambiente e aprovação); `--rollback-on-failure` não pega bug que passa na readiness; rollback
  não desfaz migration (daí a regra de compatibilidade); os dois serviços implantados em sequência
  exigem contratos compatíveis nos dois sentidos (ADR 0005).
- Obrigatório: todo PR com migration ou mudança de contrato declara a compatibilidade com a versão
  anterior; actions de terceiros fixadas por SHA.

## Revisitar quando

- Houver um segundo cluster ou mais de três ambientes (GitOps escala melhor); ou
- um incidente for causado por um bug que passou na readiness e atingiu 100% do tráfego
  (aí o canário paga o custo); ou
- a auditoria exigir que nenhuma credencial do cluster saia dele.
