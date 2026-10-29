# Perguntas de entrevista do módulo 9

Responda em voz alta antes de abrir. Decisão, motivo e custo, em menos de dois minutos.

## Revisão dos módulos anteriores

::: pergunta
Como o pod da API lê o Key Vault sem guardar senha?
???
Workload Identity: o token da ServiceAccount, assinado pelo cluster, é trocado por acesso de uma identidade gerenciada com credencial federada para aquele namespace e ServiceAccount, com papel só de leitura de segredos naquele cofre.
:::

::: pergunta
Por que o rate limiting quebra se a API não processar os cabeçalhos `X-Forwarded-*`?
???
Porque todas as requisições chegam do IP do proxy (NGINX), e todos os clientes passam a dividir o mesmo limite.
:::

## Terraform

::: entrevista
"Por que usar Terraform em vez de scripts com a CLI da nuvem?"
???
Porque é declarativo: descrevo o resultado e a ferramenta calcula as mudanças, o que torna o ambiente reproduzível, revisável em PR e com um plano antes de cada mudança. Scripts imperativos descrevem passos, quebram quando rodados de novo e não mostram o que vai mudar. Mantenho scripts só para o bootstrap do estado, que precisa existir antes do Terraform.
:::

::: entrevista
"Como você gerencia o estado do Terraform num time?"
???
Backend remoto com trava e versionamento (no Azure, um storage com lease do blob e versionamento), acesso por identidade sem chave de conta, poucas pessoas com acesso, porque o estado contém segredos em texto claro. Nunca no Git. Estados separados por camada e por ambiente. E `force-unlock` só depois de confirmar que ninguém está aplicando.
:::

::: entrevista
"Como você revisa uma mudança de infraestrutura?"
???
Pelo plano, não só pelo diff do código. O plano vai na descrição do PR, e confiro cada destruição e cada recriação (`forces replacement`), que é onde mora o risco de perder dados. O CI valida formato e sintaxe. Mudanças em recursos com dados ganham uma checagem extra e, se for o caso, `prevent_destroy`.
:::

::: entrevista
"Alguém mudou um recurso pelo portal. O que acontece e o que você faz?"
???
É drift: o próximo plano mostra a diferença e o apply desfaz. Converso com quem mudou: se a mudança era necessária, vira código num PR no mesmo dia; se não, o apply corrige. Para atributos que a plataforma muda sozinha, uso `ignore_changes`, com cuidado para não esconder drift real. E o ideal é que ninguém tenha permissão de escrita no portal em produção, só o pipeline.
:::

::: entrevista
"Como você organiza um projeto Terraform grande?"
???
Em camadas com estados separados, por ritmo de mudança e por dependência: a base da nuvem, a plataforma no cluster, a configuração das aplicações. As camadas se ligam por outputs lidos com `terraform_remote_state`, que funcionam como contrato. Ambientes diferentes usam o mesmo código com variáveis e estados diferentes. Versões de providers fixadas no arquivo de trava, que vai para o Git.
:::

::: entrevista
"Como trazer para o Terraform uma infraestrutura que já existe?"
???
Com `terraform import` (ou blocos `import`) recurso por recurso: escrevo o código do recurso, importo, rodo o plano e ajusto o código até o plano dizer "No changes". É trabalhoso; num laboratório, apagar e recriar é mais rápido, mas em produção o import é o caminho sem indisponibilidade.
:::

**Próximo módulo:** [Módulo 10: Harbor e cadeia de suprimentos](../modulo-10/README.md).
