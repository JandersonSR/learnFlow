# 10.2 Harbor: o registry que recusa imagem ruim

O Trivy no pipeline protege o que **passa pelo pipeline**. Ele não vê uma imagem enviada por fora (alguém com a credencial do registry), nem uma CVE publicada depois do deploy. O [nível 17](https://github.com/JandersonSR/aks-step-by-step/blob/main/niveis/17-harbor.md) traz a segunda barreira, que vale para qualquer um: o próprio registry recusa entregar imagem vulnerável.

::: conceito Harbor
Um registry de contêineres open source (projeto da CNCF), que você hospeda. Além de guardar imagens, tem projetos com controle de acesso, contas de robô, scan integrado com Trivy, replicação entre registries e políticas que bloqueiam o download de imagens que não atendem aos critérios.
:::

::: video Harbor Private Container Registry Introduction (MultiMagix, em inglês)
https://www.youtube.com/watch?v=vxTs0RvoyW4
O que o Harbor oferece além de um registry comum: projetos, robôs, scan e políticas.
:::

## O projeto `cep` e a política

Do [`infra/30-app/harbor.tf`](https://github.com/JandersonSR/aks-step-by-step/blob/main/infra/30-app/harbor.tf):

```hcl
resource "harbor_project" "cep" {
  name                   = "cep"
  public                 = false
  vulnerability_scanning = true   # analisa toda imagem que chega (scan on push)
  deployment_security    = "high" # bloqueia o PULL de imagem não analisada ou com High/Critical
}
```

::: porque Bloquear no pull, e não só no push
O bloqueio acontece **quando alguém tenta baixar** a imagem, inclusive o kubelet do cluster. Isso cobre três casos que o pipeline não cobre:

- **Imagem enviada por fora do pipeline:** se alguém conseguir publicar, o cluster não consegue usar.
- **CVE publicada depois:** o Harbor reanalisa as imagens; uma imagem que era boa e passou a ter uma Critical deixa de poder ser baixada. Um pod novo (num pico de HPA, num nó novo) não sobe com ela.
- **Imagem ainda não analisada:** logo depois do push, até o scan terminar, ninguém baixa.

O preço do terceiro caso: o pipeline precisa **esperar o scan do Harbor** antes de gravar a tag no Git, senão o Argo CD tentaria usar uma imagem que o cluster ainda não pode baixar. É o que o [`harbor-aguardar-scan.sh`](https://github.com/JandersonSR/aks-step-by-step/blob/main/scripts/harbor-aguardar-scan.sh) faz.
:::

::: armadilha O Harbor é mais rígido que o pipeline
O Trivy do pipeline usa `--ignore-unfixed`; a política do Harbor conta **também** as vulnerabilidades sem correção. Uma imagem pode passar no pipeline e ser bloqueada no Harbor. O caminho, nesse caso, é a lista de CVEs permitidas do projeto (`cve_allowlist` no `harbor_project`), revisada em PR como o `.trivyignore`, ou uma base mais nova.
:::

## Dois robôs, cada um com o mínimo

| Robô | Permissões | Quem usa | Onde mora a credencial |
|---|---|---|---|
| `pipeline` | push, pull e leitura do resultado do scan, só no projeto `cep` | GitHub Actions | Secrets do GitHub (`HARBOR_USER`, `HARBOR_SECRET`) |
| `cluster` | **só pull**, só no projeto `cep` | O kubelet de cada nó | Secret `harbor-pull` (tipo `dockerconfigjson`) no namespace `cep` |

::: porque Por que o robô do cluster não pode enviar
Se um atacante conseguir a credencial que o cluster usa (ela está num Secret, legível no namespace), com permissão de push ele poderia **substituir** uma imagem por outra maliciosa com a mesma tag. Só com pull, o pior que ele faz é baixar imagens que já existem.

E por que essas credenciais são **secrets** no GitHub, enquanto os IDs da Azure eram **variáveis** (lição 8.1)? Porque usuário e segredo de robô dão acesso sozinhos, sem nenhum token federado. É a mesma regra aplicada com coerência: o que dá acesso é segredo; o que só identifica não é.
:::

::: porque Por que o pull secret não vem do Key Vault
Todo o resto dos segredos do projeto vem do Key Vault pelo driver CSI. A credencial do Harbor é exceção: quem a usa é o **kubelet**, para baixar a imagem **antes** de o contêiner existir, e portanto antes de qualquer volume CSI ser montado. Por isso ela é um Secret comum, criado pelo Terraform da camada 30.
:::

::: previsao
Você usa o robô do pipeline para enviar uma imagem antiga ao Harbor (`aspnet:6.0` retagueada como `harbor.<base>/cep/teste:1`) e cria um pod no namespace `cep` com ela, usando o `harbor-pull`. O que acontece com o push? E com o pod?
???
O **push funciona**: o robô do pipeline tem permissão de enviar, e o Harbor aceita e agenda o scan.

O **pod fica em `ImagePullBackOff`**. No `kubectl describe pod`, os Events mostram o erro do registry com uma mensagem do Harbor citando a política de segurança do projeto (imagem com vulnerabilidades acima do permitido, ou ainda não analisada).

É exatamente a "prova da política" do guia do nível 17. Apague o repositório `teste` depois.
:::

## O registry dentro do cluster que ele abastece

::: armadilha
No laboratório, o Harbor roda **dentro do próprio AKS** que baixa imagens dele. É simples e barato, mas cria uma dependência circular: se o cluster cair ou precisar ser recriado, o registry cai junto, e os pods novos não têm de onde baixar a imagem. O projeto se prepara para isso com um **nome fixo** (`harbor.<base>`): tudo aponta para o nome, nunca para o cluster, e o nível 18 leva o Harbor para fora trocando só o DNS.

Em produção, o registry fica fora do cluster da aplicação: um ACR gerenciado, ou um Harbor num cluster de plataforma separado.
:::

## Perguntas para responder sem olhar

::: pergunta
O que a política `deployment_security = "high"` do Harbor faz, e o que ela cobre que o scan no pipeline não cobre?
???
Bloqueia o download de imagens não analisadas ou com vulnerabilidades High/Critical. Cobre imagens enviadas por fora do pipeline, CVEs publicadas depois do deploy (pods novos não sobem com a imagem) e o intervalo antes do scan terminar.
:::

::: pergunta
Por que o robô usado pelo cluster só tem permissão de pull?
???
Porque a credencial dele fica num Secret no namespace e pode ser lida por quem tem acesso ali. Com push, um atacante poderia substituir imagens por versões maliciosas; só com pull, ele no máximo baixa o que já existe.
:::

::: pergunta
Por que o pipeline espera o scan do Harbor antes de gravar a tag no Git?
???
Porque, com a política ligada, o cluster não consegue baixar uma imagem ainda não analisada. Se a tag fosse para o Git antes, o Argo CD tentaria usá-la e os pods ficariam em `ImagePullBackOff` até o scan terminar, ou para sempre, se ele reprovar.
:::

**Próxima:** [10.3 Além do scan](03-alem-do-scan.md).
