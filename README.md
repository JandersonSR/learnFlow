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

## Publicar na Vercel (grátis, repositório privado)

1. Entre em [vercel.com](https://vercel.com) com a conta do GitHub (plano **Hobby**, gratuito).
2. **Add New → Project →** importe `JandersonSR/learnFlow`. Se o repositório não aparecer, clique em **Adjust GitHub App Permissions** e libere o acesso a ele.
3. Deixe tudo como está (o `vercel.json` já define o build `npm run build` e a pasta `dist`) e clique em **Deploy**.
4. O site fica em `https://learnflow-<algo>.vercel.app`. Em **Settings → Domains** dá para trocar o nome (ex.: `learnflow-jander.vercel.app`) ou usar um domínio próprio.

Cada `git push` na `main` publica uma versão nova.

> **Quem pode ver:** qualquer pessoa com o endereço. O repositório continua privado, mas o site não exige login. Na Vercel gratuita, a proteção por login (Deployment Protection) só cobre as prévias, não o endereço principal. Se quiser o site fechado, use Cloudflare Pages com Cloudflare Access (grátis até 50 pessoas).

## Observações

- O progresso fica no `localStorage` do navegador, e cada trilha usa a própria chave (`v01-study`, `ccka-check`, ...). Limpar os dados do site apaga o progresso: exporte antes.
- As trilhas carregam fontes do Google Fonts. Sem internet, elas abrem com as fontes do sistema.
