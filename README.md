# learnFlow

Site com todas as trilhas de estudo num menu: guia técnico (24 volumes), trilhas avançadas, certificações e trilhas por tecnologia, além dos guias em PDF.

- **Menu** com busca (atalho `/`), filtro por categoria e "Em andamento".
- **Progresso por trilha** no menu, lido dos checklists de cada trilha, e um painel geral.
- **"Continuar de onde parei"** abre a última trilha visitada.
- **Links entre trilhas** (as cenas "já vistas em outra trilha") apontam para as páginas do próprio site.
- **Exportar e importar progresso.** O progresso fica no navegador, então use isso para levar o progresso do computador para o celular (ou o contrário).
- Funciona no celular e respeita o tema claro ou escuro do aparelho.

## Estrutura

```
conteudo/            ← os arquivos originais (.html das trilhas e .pdf dos guias)
scripts/build.mjs    ← gera o site em dist/
scripts/menu.html    ← modelo da página do menu
vercel.json          ← build e cabeçalhos da hospedagem
```

O nome do arquivo define a categoria:

| Começa com | Categoria |
|---|---|
| `Vol 01 - ...` | Guia Técnico |
| `Nova - ...` | Trilhas avançadas |
| `Cert - ...` | Certificações |
| qualquer outro | Trilhas por tecnologia |

## Caminhos de carreira

No menu, o seletor **Carreira** (e a seção "Por onde começar") mostra as trilhas na ordem recomendada para cada objetivo, separadas em etapas com uma meta de saída, o progresso do caminho e o **próximo passo** (a primeira trilha da ordem ainda não concluída). O caminho escolhido fica salvo no navegador e no endereço (`#carreira-staff`), então dá para mandar o link de um caminho.

Os caminhos ficam em `scripts/carreiras.mjs` e podem misturar trilhas, certificações e módulos de projetos guiados. Para criar ou mudar um, edite a lista usando o nome do arquivo de cada trilha (sem `.html`); o build avisa se algum nome não existir em `conteudo/`.

## Projetos guiados

Cursos práticos em Markdown, módulo a módulo. Hoje são dois: o **OrderFlow** (.NET e Java ligados por Kafka) e o **Plataforma .NET em Produção** (a stack ASP.NET + Kafka + Kubernetes + Helm + Harbor + Argo CD + Terraform + Azure, ensinada peça por peça). Ficam em `projetos/<nome>/`:

```
projetos/orderflow/README.md        visão do projeto (vira "sobre o projeto")
projetos/orderflow/docs/README.md   mapa do curso, com a tabela "Mapa dos módulos"
projetos/orderflow/docs/**.md       lições, exercícios e perguntas de entrevista
```

O build transforma cada `.md` numa página do site e cada linha da tabela "Mapa dos módulos" (`| # | Módulo | Status | Certificação |`) num cartão em **Projetos guiados**. Módulo com link e status "pronto" abre; os outros aparecem como "em breve". Cada página tem o botão **Marcar como lida**, e o progresso do módulo aparece no menu e nos caminhos de carreira.

Para publicar um módulo novo: copie os `.md` para a pasta do módulo e troque a linha dele na tabela para `[Nome](modulo-02/README.md) | ✅ pronto`. Nos caminhos de carreira, um módulo entra como `"orderflow:2"`.

### Blocos de ensino

As lições podem usar blocos que viram componentes na página. A sintaxe é `::: tipo [título]` até `:::`, e `???` separa o que fica escondido até a pessoa clicar:

````markdown
::: previsao
O que acontece se o pod reiniciar agora?
???
A resposta, que só aparece depois de a pessoa escrever o palpite e clicar.
:::

::: video Título do vídeo (canal, idioma)
https://www.youtube.com/watch?v=ID
Uma linha dizendo por que assistir.
:::
````

| Tipo | Vira |
|---|---|
| `conceito`, `analogia`, `porque`, `armadilha`, `checkpoint`, `repo` | Caixa destacada com o rótulo do tipo |
| `previsao` | Pergunta + campo para o palpite (salvo no navegador) + resposta escondida |
| `pergunta`, `entrevista` | Pergunta + resposta escondida |
| `quebra`, `desafio` | Lab de quebra e desafio sem roteiro |
| `dica`, `solucao` | Bloco recolhido, aberto com um clique |
| `video` | Vídeo do YouTube que só carrega ao clicar, com link para abrir no YouTube |

Também funcionam listas de tarefas (`- [ ] item`, com o estado salvo no navegador) e links para trilhas do site com `[texto](trilha:<slug-da-trilha>)`.

## Repositórios de prática

Os projetos guiados ensinam; a prática acontece nestes repositórios, e cada um aponta de volta para cá:

| Repositório | Papel |
|---|---|
| [aks-step-by-step](https://github.com/JandersonSR/aks-step-by-step) | Laboratório: a API de CEP no AKS em 17 níveis, com o guia de comandos de cada nível |
| [kub-learn-flow](https://github.com/JandersonSR/kub-learn-flow) | Kubernetes local (Minikube), sem custo |
| [squad-dotnet-kubernetes](https://github.com/JandersonSR/squad-dotnet-kubernetes) | Gabarito do ambiente completo, com as decisões registradas |

A lista do menu fica em `scripts/build.mjs` (`repositorios`).

## Adicionar ou atualizar uma trilha

1. Copie o `.html` (ou `.pdf`) para `conteudo/`. Para atualizar, substitua o arquivo com o mesmo nome.
2. `git add conteudo && git commit -m "Nova trilha: ..." && git push`
3. A Vercel publica sozinha em cerca de 1 minuto.

O build mostra um aviso se algum link entre trilhas não encontrar a página correspondente.

## Rodar no computador

Precisa de Node 18 ou mais novo.

```bash
npm run build          # gera dist/
npm run dev            # gera e abre em http://localhost:3000
```


## Observações

- O progresso fica no `localStorage` do navegador, e cada trilha usa a própria chave (`v01-study`, `ccka-check`, ...). Limpar os dados do site apaga o progresso: exporte antes.
- As trilhas carregam fontes do Google Fonts. Sem internet, elas abrem com as fontes do sistema.
