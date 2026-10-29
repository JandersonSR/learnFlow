# 9.2 O estado: o arquivo mais sensível do projeto

::: conceito Estado do Terraform
Um arquivo (JSON) com o mapa entre cada `resource` do código e o recurso real na Azure (o id, os atributos conhecidos). É com ele que o Terraform sabe que o `azurerm_key_vault.kv` do código é o cofre `kv-cep4k2x9` da assinatura, e que precisa atualizar aquele e não criar outro.
:::

Sem o estado, o Terraform não sabe o que já criou. Um `apply` tentaria criar tudo de novo (e falharia nos nomes que já existem), e um `destroy` não saberia o que apagar.

## Onde o estado fica, e por quê

No nível 10, o estado vai para um storage da Azure, criado pelo [`bootstrap.sh`](https://github.com/JandersonSR/aks-step-by-step/blob/main/infra/00-bootstrap/bootstrap.sh):

```hcl
# infra/10-azure/versions.tf
backend "azurerm" {
  key = "cep/10-azure.tfstate"
}
# o resto vem do infra/backend.hcl, gerado pelo bootstrap:
#   resource_group_name, storage_account_name, container_name = "tfstate", use_azuread_auth = true
```

| Escolha | Por quê |
|---|---|
| **Remoto, não no computador de quem roda** | Duas pessoas (ou a pessoa e o pipeline) precisam do mesmo estado. Um arquivo local diverge no primeiro dia |
| **Trava (*lock*)** | O backend `azurerm` usa um *lease* do blob: enquanto alguém roda `apply`, ninguém mais consegue |
| **Versionamento do blob ligado** | Se o estado for corrompido ou apagado, volta-se a uma versão anterior |
| **`use_azuread_auth = true` e sem chave de conta** (`--allow-shared-key-access false`) | Acesso só por identidade do Entra ID, com papel `Storage Blob Data Contributor`. Não existe uma chave mestra do storage para vazar |
| **Fora do `destroy`** | O storage é criado pelo bootstrap, não pelo Terraform das camadas. O `destruir.sh` apaga o ambiente, e o estado (vazio, mas íntegro) continua |

::: porque O problema do ovo e da galinha
O Terraform guarda o estado num storage. Quem cria esse storage? Se fosse o próprio Terraform, o estado do storage teria de ficar em algum lugar antes de o storage existir. Por isso o projeto cria o storage com um script `az` simples (a camada 00), uma vez, e todo o resto usa esse storage. É uma solução comum: o bootstrap é imperativo e pequeno; todo o resto é declarativo.
:::

::: previsao
Você e um colega rodam `terraform apply` na camada 10 ao mesmo tempo, cada um da sua máquina, com mudanças diferentes. O que acontece? E se o estado estivesse num arquivo local, versionado no Git?
???
Com o backend remoto, quem começou primeiro pega a trava. O segundo recebe um erro de **lock** (`Error acquiring the state lock`), com o id da trava e quem a segura, e não faz nada. Depois que o primeiro terminar, o segundo roda de novo, e o plano dele já considera a mudança do primeiro.

Com o estado num arquivo local versionado no Git, **não existe trava**: os dois aplicam ao mesmo tempo, cada um com uma visão desatualizada do outro, e criam conflitos reais na Azure (um desfaz a mudança do outro). Depois, os dois tentam commitar o `terraform.tfstate`, e o merge de um JSON de estado é uma receita para corromper o mapeamento.

O caso extremo da trava: o `apply` de alguém é interrompido (internet caiu) e a trava fica presa. Existe `terraform force-unlock <id>`, para usar **só** depois de confirmar que ninguém está rodando.
:::

## O estado contém segredos

::: armadilha
O projeto gera as senhas do banco com `random_password` e grava direto no Key Vault: ninguém digita nem vê (veja [`dados.tf`](https://github.com/JandersonSR/aks-step-by-step/blob/main/infra/10-azure/dados.tf)). Ótimo. Mas o valor gerado **fica gravado no estado**, em texto claro. Marcar o output como `sensitive` só esconde da tela, não do arquivo.

Consequências práticas:

- **Quem lê o estado lê as senhas.** O acesso ao storage do estado é tão sensível quanto o acesso ao Key Vault. Por isso: sem chave de conta, acesso por papel, poucas pessoas.
- **Nunca** coloque o estado no Git, nem num storage com acesso público.
- O `.gitignore` do projeto exclui `backend.hcl`, `estado.tfvars`, `*.tfstate` e a pasta `.terraform`.

Alternativas para não ter o segredo no estado existem (gerar a senha fora do Terraform, usar identidade em vez de senha onde dá), e o próprio projeto vai nessa direção sempre que pode: o pipeline e os pods não têm senha nenhuma, só identidades.
:::

## Comandos de estado que você vai usar

| Comando | Quando |
|---|---|
| `terraform state list` | Ver o que o estado conhece |
| `terraform state show <recurso>` | Ver os atributos de um recurso como o Terraform os conhece |
| `terraform import <recurso> <id da Azure>` | Trazer para o Terraform um recurso que já existe (criado à mão) |
| `terraform state mv` | Renomear um recurso no código sem destruir e recriar (ou use um bloco `moved`) |
| `terraform force-unlock <id>` | Liberar uma trava presa, depois de confirmar que ninguém está rodando |

::: porque Por que o nível 10 apaga e recria em vez de importar
O nível 10 manda apagar o resource group feito à mão e deixar o Terraform criar do zero. Num laboratório, é o caminho mais rápido e mais limpo. Num ambiente que não pode cair, o caminho seria `terraform import` recurso por recurso, conferindo com `plan` até ele dizer "No changes". É trabalhoso, e é o trabalho real de quem leva infraestrutura existente para código.
:::

## Perguntas para responder sem olhar

::: pergunta
Para que serve o estado do Terraform?
???
É o mapa entre cada recurso do código e o recurso real na nuvem. Sem ele, o Terraform não sabe o que já criou: tentaria recriar tudo e não saberia o que destruir.
:::

::: pergunta
Por que o estado fica num storage remoto, com trava e versionamento?
???
Remoto para todos (pessoas e pipeline) usarem o mesmo estado; trava para dois `apply` não rodarem juntos; versionamento para voltar se o estado for corrompido ou apagado.
:::

::: pergunta
Por que o acesso ao estado deve ser tratado como acesso a segredos?
???
Porque o estado guarda os atributos dos recursos em texto claro, inclusive senhas geradas pelo Terraform. Quem lê o estado lê as senhas, mesmo que os outputs estejam marcados como `sensitive`.
:::

**Próxima:** [9.3 Camadas, dependências e o dia a dia](03-camadas.md).
