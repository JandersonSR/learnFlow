# 1.3 DDD estratégico: contextos, linguagem e onde investir

A maioria das pessoas aprende DDD pelo lado errado: começa por entidade, objeto de valor e repositório, e sai criando agregado para tudo. DDD começa pelo **estratégico**: entender o negócio, dividir em contextos e decidir onde vale investir esforço de modelagem. O tático (lição 1.4) é ferramenta para as partes onde o investimento compensa.

::: conceito Domain-Driven Design
Uma forma de construir software em que o **modelo do negócio** guia o código. As palavras que os especialistas do negócio usam viram nomes de classes e métodos, e as regras vivem num lugar só, longe de HTTP, banco e fila.

Foi descrito por Eric Evans no livro de 2003. A ideia central: em sistemas complexos, a parte difícil não é a tecnologia, é entender e representar o negócio.
:::

## Subdomínios: onde o negócio ganha dinheiro

Todo sistema resolve vários problemas, mas eles não têm o mesmo peso. O DDD separa três tipos:

| Tipo | O que é | Onde investir | Exemplo numa plataforma de crédito com parceiros |
|---|---|---|---|
| **Principal** (*core*) | O que diferencia a empresa no mercado | Os melhores devs, modelagem rica, testes de regra | Análise de proposta, regras de crédito |
| **De suporte** | Necessário e específico do negócio, mas não diferencia | Bem feito, sem excesso | Cadastro de parceiros, cotas por plano |
| **Genérico** | Problema resolvido igual em toda empresa | Comprar, usar biblioteca ou fazer o mínimo | Consulta de CEP, envio de e-mail, autenticação |

::: porque Por que o módulo de CEP não tem modelo rico
Consulta de CEP é **genérico**. Não há regra de negócio própria: o endereço é o que os Correios dizem. Por isso o [`EnderecoCache`](https://github.com/JandersonSR/aks-step-by-step/blob/main/src/Modules/Agx.Modules.Cep/Data/EnderecoCache.cs) é uma classe com propriedades e um método de validade, e o esforço do módulo foi para cache, resiliência e observabilidade.

Colocar agregado, fábrica, repositório e eventos de domínio num CRUD de CEP seria **gastar a complexidade no lugar errado**. Isso também é DDD: decidir onde não aplicar o tático.
:::

::: armadilha
"Modelo anêmico" (só propriedades, sem comportamento) é um problema **no subdomínio principal**, onde as regras ficam espalhadas por services e controllers. Num subdomínio genérico, ele é a escolha certa. Quem critica todo modelo anêmico por reflexo ainda não separou subdomínios.
:::

## Contexto delimitado (*bounded context*)

::: conceito Bounded context
Um limite dentro do qual cada palavra tem **um significado só**. A mesma palavra pode significar coisas diferentes em contextos diferentes, e está tudo bem.
:::

Exemplo: "Parceiro".

- No contexto de **Cadastro**, Parceiro tem CNPJ, razão social, contatos e plano contratado.
- No contexto de **Cobrança**, Parceiro tem forma de pagamento, dia de vencimento e faturas.
- No contexto de **Consulta de CEP**, Parceiro é só "quem está pedindo", para aplicar o limite de requisições.

Tentar criar **uma** classe `Parceiro` que sirva aos três é o caminho da classe com 60 propriedades que ninguém entende. Cada contexto tem o seu modelo.

**No monolito modular, um módulo é um contexto delimitado.** É por isso que cada módulo tem seu schema e suas classes: o `Parceiro` do módulo Parceiros e o "quem pediu" do módulo Cep podem evoluir sem combinar.

## Linguagem ubíqua: o código fala a língua do negócio

Repare que o código do projeto está em português: `Resultado`, `Erro`, `ConsultarCep`, `RegistradorDeConsultas`, `FonteIndisponivel`. Não é gosto pessoal.

::: porque
Se o time de produto e o suporte falam "consulta", "cota", "parceiro", e o código fala `Request`, `Quota`, `Partner`, toda conversa passa por uma tradução, e a tradução é onde os mal-entendidos nascem. A linguagem ubíqua é a **mesma** palavra na reunião, no ticket, no teste e na classe.

O custo: misturar português com o inglês das bibliotecas (`Handle`, `DbContext`, `MapGet`). O time da squad aceitou esse custo; o que não se aceita é cada dev traduzir do seu jeito.
:::

## Mapa de contextos: como os contextos se relacionam

Quando um contexto depende de outro, a relação tem nome. Três padrões que aparecem no projeto e no dia a dia:

| Padrão | O que é | No projeto |
|---|---|---|
| **Camada anticorrupção** | Uma tradução na borda, para o modelo de fora não contaminar o seu | `ViaCepClient` traduz o JSON do ViaCEP para `EnderecoFonte`, atrás da interface `IFonteCep` |
| **Linguagem publicada** | Um contrato público, versionado, que o contexto oferece a quem quiser | O evento `CepConsultado` em `Agx.Cep.Contratos` |
| **Conformista** | Você aceita o modelo do outro como está, sem traduzir | Seria usar o JSON do ViaCEP direto no handler (o projeto não faz isso) |

::: previsao
Amanhã a empresa troca o ViaCEP por uma API paga, com outro formato de JSON e outros nomes de campos. Quantos arquivos do módulo Cep precisam mudar? Quais?
???
Idealmente **um arquivo novo** (o cliente da API paga, implementando `IFonteCep`) e **uma linha** no `CepModulo` (registrar o novo cliente no lugar do `ViaCepClient`). O handler, o cache, o banco e os testes de regra não mudam, porque falam com `IFonteCep` e `EnderecoFonte`, nunca com o JSON de fora.

É o valor da camada anticorrupção: a troca do fornecedor fica contida na borda.

Se o handler usasse o JSON do ViaCEP direto (conformista), a troca espalharia mudanças por todo o módulo.
:::

## Vídeos

::: video What is DDD - Eric Evans - DDD Europe 2019 (em inglês)
https://www.youtube.com/watch?v=pMuiVlnGqjk
O próprio autor explicando o que DDD é e o que não é. Repare quanto tempo ele passa em modelo e linguagem, e quão pouco em padrões táticos.
:::

::: video Domain Driven Design (DDD): Tudo que você precisa saber (Full Cycle, em português)
https://www.youtube.com/watch?v=bL8OK_oF0TI
Visão geral em português, com foco no lado estratégico.
:::

Para aprofundar o estratégico (Event Storming, mapa de contextos completo e BDD), veja a trilha [DDD Estratégico, Event Storming e BDD](trilha:nova-ddd-estrategico-event-storming-e-bdd) aqui no learnFlow. Leitura curta e boa: [Bounded Context, de Martin Fowler](https://martinfowler.com/bliki/BoundedContext.html).

## Exercício: classifique o seu sistema

::: desafio
Pegue o sistema principal da empresa onde você trabalha. Liste de 6 a 10 áreas (cadastro, propostas, cobrança, notificações, relatórios...) e classifique cada uma como principal, de suporte ou genérica.

**Critérios de aceite:**
- No máximo duas áreas principais. Se deu mais, você está chamando de principal o que é só importante
- Para cada área genérica, escreva o que poderia ser comprado ou substituído por biblioteca
- Para a área principal, escreva três palavras que o negócio usa e que deveriam aparecer no código exatamente assim

Leve o resultado para um tech lead ou PO e pergunte se concordam. A conversa vale mais que a tabela.
:::

## Perguntas para responder sem olhar

::: pergunta
Qual a diferença entre DDD estratégico e tático, e por qual se começa?
???
Estratégico: entender o negócio, separar subdomínios, definir contextos delimitados, a linguagem e como os contextos se relacionam. Tático: os padrões de código (entidade, objeto de valor, agregado, evento de domínio, repositório) usados **dentro** de um contexto. Começa-se pelo estratégico, porque é ele que diz onde vale a pena aplicar o tático.
:::

::: pergunta
Um colega quer refatorar o módulo de CEP para "fazer DDD direito", com agregado e eventos de domínio. O que você responde?
???
Que consulta de CEP é subdomínio genérico, sem regra própria: o modelo simples é a escolha certa ali. O esforço de modelagem rica deve ir para o subdomínio principal. Melhor investimento no CEP: cache, resiliência, observabilidade e testes da integração.
:::

::: pergunta
O que é uma camada anticorrupção e onde ela aparece no projeto?
???
Uma tradução na borda que impede o modelo de um sistema externo de se espalhar pelo seu. No projeto: `ViaCepClient` converte o JSON do ViaCEP em `EnderecoFonte`, e o resto do módulo só conhece a interface `IFonteCep`.
:::

**Próxima:** [1.4 DDD tático](04-ddd-tatico.md).
