# Perguntas de entrevista do módulo 1

Responda em voz alta, como numa entrevista, **antes** de abrir cada resposta. Grave no celular se puder: ouvir a própria resposta mostra onde você enrola. Uma boa resposta de sênior tem a decisão, o motivo e o custo, nessa ordem, em menos de dois minutos.

## Revisão do módulo 0

Perguntas que já apareceram. Se errar alguma, volte à lição antes de seguir.

::: pergunta
Por que existem duas camadas de memória na API (no processo e no Dragonfly)?
???
A do processo é a mais rápida e não depende de rede; o Dragonfly é compartilhado entre os pods e evita que cada um vá ao banco pela mesma chave. Uma resolve latência, a outra resolve duplicação entre réplicas.
:::

::: pergunta
No fluxo de deploy com Argo CD, quem tem a credencial do cluster?
???
O Argo CD, dentro do cluster. O pipeline só grava a tag nova no Git.
:::

## Arquitetura

::: entrevista
"Vocês vão começar um sistema novo com um time de 8 pessoas. Microsserviços ou monolito?"
???
Monolito modular, com os módulos desenhados como contextos delimitados: schema próprio, contrato público pequeno, teste de arquitetura guardando a fronteira. Motivo: com 8 pessoas, o custo operacional de microsserviços (rede, consistência eventual, N pipelines, rastreamento distribuído) é maior que o ganho, e ainda não sabemos quais partes precisam escalar separado. Custo: um deploy só e falhas que podem derrubar o processo inteiro. Revisitaria a decisão se um módulo mostrasse escala, ritmo de deploy ou tecnologia muito diferentes do resto, e aí a extração é barata porque a fronteira já existe.
:::

::: entrevista
"Como você garante que os módulos de um monolito modular não se acoplem com o tempo?"
???
Em camadas. No compilador: projetos separados e tudo `internal`, exceto um contrato público pequeno. Em teste: um teste de arquitetura que falha se a superfície pública mudar ou se um módulo referenciar outro. No banco: schema e usuário por módulo, sem permissão no schema dos outros, o que bloqueia até SQL escrito à mão. E na revisão: nenhum `JOIN` entre módulos. Disciplina sozinha não escala; o que escala é a regra que quebra o build.
:::

::: entrevista
"O que é um SharedKernel, e qual o risco dele?"
???
Código compartilhado por todos os módulos, como o `Resultado<T>` e o `Erro`. O risco é virar depósito de "utilitários": tudo que entra nele vira dependência de todos os módulos e passa a exigir coordenação para mudar. Só entra o que é igual para todos e quase nunca muda. Duplicar um helper entre dois módulos costuma ser melhor que colocá-lo no kernel.
:::

## DDD

::: entrevista
"Explique DDD para alguém que só conhece CRUD."
???
É modelar o software a partir do negócio. Começa pelo estratégico: dividir o sistema em contextos onde cada palavra tem um significado só, usar no código as palavras que o negócio usa, e decidir onde investir: modelagem rica no que diferencia a empresa, solução simples ou comprada no que é genérico. Dentro dos contextos importantes, o tático ajuda a manter as regras num lugar só: objetos de valor sempre válidos, agregados que protegem invariantes, eventos que avisam o que aconteceu.
:::

::: entrevista
"Todo sistema deveria usar DDD?"
???
O estratégico, quase sempre: separar contextos e usar a linguagem do negócio custa pouco e evita muita confusão. O tático, não. Em subdomínio genérico ou CRUD sem regras, agregados e eventos de domínio só adicionam código. No projeto da API de CEP, o módulo de CEP é genérico e tem modelo simples de propósito; o de Parceiros tem regra de cota e usa agregado.
:::

::: entrevista
"O que é um agregado e como você decide o tamanho dele?"
???
Um grupo de objetos que muda junto, com uma raiz que é a única porta de entrada e que garante as invariantes. O tamanho é decidido pelas regras, não pelas tabelas: entra o que é necessário para garantir a regra numa transação. Agregado grande demais gera contenção e leitura desnecessária. No caso da cota, o `Parceiro` carrega o contador do dia, não o histórico de consultas.
:::

::: entrevista
"Seu agregado garante uma regra, mas a API roda em 6 pods. A regra continua garantida?"
???
Não só pelo agregado: ele garante dentro de um processo. Entre processos, preciso de controle de concorrência no banco. Concorrência otimista com uma versão (no PostgreSQL, a coluna `xmin`): quem salva por último recebe conflito, relê e decide de novo. Para contadores com muita disputa, um `UPDATE` atômico com a condição no `WHERE` evita as novas tentativas.
:::

## Erros e contratos

::: entrevista
"Exceção ou Result pattern?"
???
Os dois, cada um no seu lugar. Falha prevista, que é parte do negócio (não encontrado, regra violada, validação), volta como valor: a assinatura mostra que pode falhar, não custa stack trace e não polui o monitoramento. Falha que não deveria acontecer (bug, configuração errada) é exceção, que vira 500, log e alerta. A tradução para HTTP fica num lugar só, na borda.
:::

::: entrevista
"Como dois módulos devem trocar informação?"
???
Se um precisa da resposta para decidir, chamada síncrona por um contrato público pequeno, que o outro implementa por dentro. Se é só um aviso, evento: em memória se for no mesmo processo e perder um aviso for tolerável; mensageria (Kafka) se for para outro processo ou não puder se perder. Nunca por tabela compartilhada.
:::

## Para treinar a fala

Escolha três perguntas acima e explique para alguém do time que não seja de backend. Se a pessoa entender, você entendeu.

**Próximo módulo:** [Módulo 2: contrato da API](../modulo-02/README.md).
