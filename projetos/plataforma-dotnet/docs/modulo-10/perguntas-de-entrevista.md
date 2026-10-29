# Perguntas de entrevista do módulo 10

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
Por que o estado do Terraform deve ser tratado como segredo?
???
Porque guarda os atributos dos recursos em texto claro, inclusive senhas geradas pelo Terraform, mesmo com outputs marcados como `sensitive`.
:::

::: pergunta
O que significa `-/+` num plano do Terraform?
???
O recurso será destruído e recriado, porque um atributo que não pode mudar no lugar mudou (`forces replacement`). Em recursos com dados, significa recomeçar vazio.
:::

## Segurança da cadeia de suprimentos

::: entrevista
"Como você garante que imagens vulneráveis não chegam a produção?"
???
Em camadas. Imagem base mínima e atualizada (`--pull` em todo build). Scan no PR e antes do push, bloqueando High e Critical com correção disponível, com exceções registradas e revisadas. Um registry que analisa ao receber e recusa entregar imagem vulnerável ou não analisada, o que cobre imagens enviadas por fora e CVEs publicadas depois. E monitoramento contínuo do que já está rodando, porque o pipeline não vê CVE nova em imagem antiga.
:::

::: entrevista
"O scan reprovou e o deploy de uma correção urgente está travado. O que você faz?"
???
Primeiro entendo a CVE: está na base, num pacote direto ou num transitivo, e tem correção? Se tem, atualizo (rodar de novo o build traz a base nova; o NuGet se atualiza ou fixa) e sigo. Se não tem e o risco é baixo no nosso uso, registro uma exceção com motivo e data de revisão, aprovada por outra pessoa, e publico a correção urgente. O que não faço é desligar o scan.
:::

::: entrevista
"Por que bloquear só vulnerabilidades com correção disponível?"
???
Porque bloquear por uma sem correção não reduz o risco, não há para onde atualizar, e impede publicar outras correções, inclusive de segurança. As sem correção ficam visíveis e monitoradas, e o registry, que é mais rígido, permite uma lista de exceções revisada.
:::

::: entrevista
"Como você dá ao cluster acesso ao registry?"
???
Com uma credencial só de leitura e só do projeto da aplicação: um robô de pull no Harbor, ou, no ACR, o papel `AcrPull` para a identidade do cluster, sem senha. Nunca com a mesma credencial do pipeline, que tem push: quem lesse o Secret no cluster poderia substituir imagens.
:::

::: entrevista
"Tag ou digest no deploy?"
???
Digest é o mais seguro: identifica exatamente a imagem analisada, e uma tag movida no registry não muda o que roda. No mínimo, tags imutáveis no registry e uma tag por build (nunca `latest`), para não acabar com versões diferentes rodando sob o mesmo nome em nós diferentes.
:::

::: entrevista
"O que vem depois do scan numa cadeia de suprimentos madura?"
???
SBOM publicado com cada imagem, para responder rápido "onde usamos a biblioteca X". Assinatura das imagens pelo pipeline e controle de admissão no cluster que só aceita imagens assinadas. Atestações de proveniência (de qual commit e pipeline veio). E atualização automatizada de dependências com Dependabot ou Renovate, com testes e scan em cada PR.
:::

**Próximo módulo:** [Módulo 11: GitOps com Argo CD](../modulo-11/README.md).
