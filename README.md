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

Os caminhos ficam em `scripts/carreiras.mjs`. Para criar ou mudar um, edite a lista usando o nome do arquivo de cada trilha (sem `.html`); o build avisa se algum nome não existir em `conteudo/`.

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
