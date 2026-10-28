// Projetos guiados: cursos práticos em Markdown que evoluem um mesmo sistema,
// módulo a módulo (ex.: OrderFlow). Ficam em projetos/<nome>/:
//
//   projetos/<nome>/README.md          visão do projeto (vira a página "Sobre")
//   projetos/<nome>/docs/README.md     mapa do curso, com a tabela "Mapa dos módulos"
//   projetos/<nome>/docs/**.md         lições, exercícios e perguntas de entrevista
//
// Cada linha da tabela "Mapa dos módulos" (| # | Módulo | Status | Certificação |)
// vira um cartão no menu. Módulo com link e status "pronto" abre; os demais
// aparecem como "em breve". Para publicar um módulo novo, basta colocar os .md
// e atualizar a linha da tabela: o build gera as páginas sozinho.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, posix } from "node:path";
import { markdown } from "./markdown.mjs";

const semMd = (s) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").replace(/\s+/g, " ").trim();
const escH = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function listarMd(dir, base = dir) {
  const r = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) r.push(...listarMd(p, base));
    else if (f.toLowerCase().endsWith(".md")) r.push(relative(base, p).split("\\").join("/"));
  }
  return r.sort();
}

/** Lê a tabela "Mapa dos módulos" do docs/README.md. */
function lerModulos(mapaMd) {
  const linhas = mapaMd.split(/\r?\n/);
  const ini = linhas.findIndex((l) => /^#+\s*Mapa dos m[oó]dulos/i.test(l));
  if (ini < 0) return [];
  const mods = [];
  for (let i = ini + 1; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (/^#/.test(l)) break;
    if (!l.startsWith("|") || /^\|\s*:?-{2,}/.test(l) || /^\|\s*#\s*\|/.test(l)) continue;
    const c = l.replace(/^\||\|$/g, "").split("|").map((x) => x.trim());
    if (c.length < 3) continue;
    const link = /\[[^\]]+\]\(([^)]+\.md)\)/.exec(c[1]);
    mods.push({
      num: c[0].replace(/[*`]/g, ""),
      nome: semMd(c[1]),
      arquivo: link ? link[1] : null,
      status: semMd(c[2]),
      pronto: /✅|pronto/i.test(c[2]) && !!link,
      cert: semMd(c[3] ?? "").replace(/^—$/, ""),
    });
  }
  return mods;
}

const ESTILO = `
:root{--bg:#F2F4F7;--surface:#fff;--ink:#0E1A2B;--muted:#566275;--line:#D8DEE7;--accent:#1F55C9;--accent-soft:#E3EBFB;--ok:#16855A;--code:#0B1424;--code-ink:#DCE6F5;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0B1220;--surface:#121B2C;--ink:#E5EBF4;--muted:#95A2B6;--line:#24324A;--accent:#7AA7FF;--accent-soft:#1A2A4A;--ok:#3CCB8E;--code:#070D18;color-scheme:dark}}
*{box-sizing:border-box}html,body{margin:0}
body{background:var(--bg);color:var(--ink);font:400 17px/1.65 "IBM Plex Sans","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.doc{max-width:860px;margin:0 auto;padding:24px max(16px,env(safe-area-inset-left)) 80px}
.trilho{font:500 13px/1.4 "IBM Plex Mono",ui-monospace,monospace;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px;margin-bottom:18px}
.trilho a{color:var(--accent);text-decoration:none}.trilho a:hover{text-decoration:underline}
h1,h2,h3,h4{font-family:"Archivo","Helvetica Neue",Arial,sans-serif;line-height:1.2;letter-spacing:-.01em;text-wrap:balance}
h1{font-size:clamp(28px,4.5vw,38px);margin:0 0 18px}h2{font-size:24px;margin:40px 0 12px}h3{font-size:19px;margin:28px 0 8px}
p,li{max-width:72ch}a{color:var(--accent)}
code{font:.88em "IBM Plex Mono",ui-monospace,monospace;background:var(--accent-soft);padding:1px 5px;border-radius:5px;overflow-wrap:anywhere}
.codigo{position:relative;margin:16px 0}
.codigo pre{margin:0;background:var(--code);color:var(--code-ink);border-radius:12px;padding:16px 18px;overflow-x:auto;font:14px/1.6 "IBM Plex Mono",ui-monospace,monospace}
.codigo pre code{background:none;padding:0;font-size:inherit;color:inherit;overflow-wrap:normal}
.codigo[data-lang]::before{content:attr(data-lang);position:absolute;top:8px;right:12px;font:500 11px "IBM Plex Mono",monospace;color:#7F90AE;text-transform:uppercase;letter-spacing:.06em}
.tabela{overflow-x:auto;margin:16px 0;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:15px}th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-weight:600;background:color-mix(in srgb,var(--accent-soft) 50%,transparent)}tr:last-child td{border-bottom:0}
blockquote{margin:16px 0;padding:10px 16px;border-left:4px solid var(--accent);background:var(--surface);border-radius:0 10px 10px 0}
blockquote p{margin:6px 0}
hr{border:0;border-top:1px solid var(--line);margin:32px 0}
pre.mermaid{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;overflow-x:auto;text-align:center}
.lida{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-top:48px;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
.lida p{margin:0;color:var(--muted);font-size:15px}
.lida button{font:600 15px/1 "IBM Plex Sans",system-ui,sans-serif;border-radius:10px;padding:11px 16px;cursor:pointer;border:1px solid var(--accent);background:var(--accent);color:#fff}
.lida button[aria-pressed="true"]{background:var(--surface);color:var(--ok);border-color:var(--ok)}
img{max-width:100%}
.ens{margin:20px 0;padding:14px 18px;border:1px solid var(--line);border-left:5px solid var(--accent);border-radius:12px;background:var(--surface)}
.ens>:first-child{margin-top:0}.ens>:last-child{margin-bottom:0}
.ens-tit{font:700 13px/1.3 "IBM Plex Sans",system-ui,sans-serif;text-transform:uppercase;letter-spacing:.05em;color:var(--accent);margin:0 0 8px}
.ens-tit span{opacity:.75}
.ens-porque{border-left-color:#7A4FD0}.ens-porque .ens-tit{color:#7A4FD0}
.ens-analogia{border-left-color:#0F8C8C}.ens-analogia .ens-tit{color:#0F8C8C}
.ens-armadilha{border-left-color:#C2410C;background:color-mix(in srgb,#C2410C 6%,var(--surface))}.ens-armadilha .ens-tit{color:#C2410C}
.ens-previsao,.ens-pergunta,.ens-entrevista{border-left-color:#B7791F}.ens-previsao .ens-tit,.ens-pergunta .ens-tit,.ens-entrevista .ens-tit{color:#B7791F}
.ens-quebra{border-left-color:#C0392B}.ens-quebra .ens-tit{color:#C0392B}
.ens-desafio{border-left-color:#16855A}.ens-desafio .ens-tit{color:var(--ok)}
.ens-checkpoint{border-left-color:var(--ok)}.ens-checkpoint .ens-tit{color:var(--ok)}
.ens-repo{border-left-color:var(--muted)}.ens-repo .ens-tit{color:var(--muted)}
@media (prefers-color-scheme:dark){.ens-porque .ens-tit{color:#B69CFF}.ens-armadilha .ens-tit{color:#FB8A4C}.ens-previsao .ens-tit,.ens-pergunta .ens-tit,.ens-entrevista .ens-tit{color:#F2C46B}.ens-quebra .ens-tit{color:#FF8A7A}.ens-analogia .ens-tit{color:#4FD1D1}}
details.ens{border-left-color:var(--muted);padding:10px 16px}
details summary,.ens-resp summary{cursor:pointer;font-weight:600;color:var(--accent)}
details[open]>summary{margin-bottom:8px}
.ens-resp{margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)}
.ens-palpite{width:100%;margin-top:6px;font:15px/1.5 "IBM Plex Sans",system-ui,sans-serif;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;resize:vertical}
.yt{position:relative;display:block;width:100%;aspect-ratio:16/9;border:0;padding:0;border-radius:10px;overflow:hidden;background:#000;cursor:pointer;margin:4px 0 10px}
.yt img{width:100%;height:100%;object-fit:cover;opacity:.85}
.yt span{position:absolute;inset:0;margin:auto;width:68px;height:48px;border-radius:12px;background:#E62117;color:#fff;font-size:22px;display:grid;place-items:center}
.yt iframe{width:100%;height:100%;border:0}
.ens-link{font-size:14px}
li.tarefa{list-style:none;margin-left:-1.2em}li.tarefa input{width:18px;height:18px;vertical-align:-3px;accent-color:var(--ok)}
`;

/** Gera as páginas dos projetos em dist/projetos e devolve os cartões dos módulos e um mapa de referências. */
export function gerarProjetos({ raiz, dist, barra }) {
  const base = join(raiz, "projetos");
  if (!existsSync(base)) return { modulos: [], refs: new Map(), paginas: 0, projetos: [] };
  const modulos = [];
  const refs = new Map();
  const projetos = [];
  let paginas = 0;

  for (const nome of readdirSync(base).filter((f) => statSync(join(base, f)).isDirectory())) {
    const dir = join(base, nome);
    if (!existsSync(join(dir, "docs", "README.md"))) continue;
    const mapa = readFileSync(join(dir, "docs", "README.md"), "utf8");
    const raizMd = existsSync(join(dir, "README.md")) ? readFileSync(join(dir, "README.md"), "utf8") : "";
    const nomeProj = (/^#\s+(.+)$/m.exec(raizMd) || /^#\s+(.+)$/m.exec(mapa) || [, nome])[1].trim();
    const resumoProj = semMd((raizMd.split(/\r?\n\r?\n/).find((b) => b.trim() && !b.startsWith("#")) || "").replace(/\n/g, " "));
    const mods = lerModulos(mapa);

    // páginas: todos os .md (README.md da raiz vira sobre.html)
    const arquivos = [...(raizMd ? ["README.md"] : []), ...listarMd(join(dir, "docs")).map((f) => "docs/" + f)];
    const existe = new Set(arquivos);
    const destino = (rel) => (rel === "README.md" ? "sobre.html" : rel.replace(/\.md$/i, ".html"));

    // a que módulo pertence cada página (pela pasta do link do módulo)
    const moduloDe = (rel) => {
      for (const m of mods) {
        if (!m.arquivo) continue;
        const alvo = posix.normalize(posix.join("docs", m.arquivo));
        const pasta = posix.dirname(alvo);
        if (rel === alvo || (pasta !== "docs" && rel.startsWith(pasta + "/"))) return m;
      }
      return null;
    };
    const chaveDe = (m) => `lf:proj:${nome}:${m.num}`;
    const paginasDoModulo = new Map();
    for (const rel of arquivos) {
      const m = moduloDe(rel);
      if (!m) continue;
      if (!paginasDoModulo.has(m.num)) paginasDoModulo.set(m.num, []);
      paginasDoModulo.get(m.num).push(destino(rel));
    }

    for (const rel of arquivos) {
      const src = readFileSync(join(dir, rel), "utf8");
      const link = (href) => {
        if (/^(https?:|mailto:|#)/.test(href)) return href;
        // trilha:<slug> aponta para uma trilha do site (dist/trilhas/<slug>.html)
        if (href.startsWith("trilha:")) {
          const [t, a] = href.slice(7).split("#");
          return "../".repeat(destino(rel).split("/").length + 1) + `trilhas/${t}.html` + (a ? "#" + a : "");
        }
        const [caminho, ancora] = href.split("#");
        const alvo = posix.normalize(posix.join(posix.dirname(rel), caminho));
        if (!existe.has(alvo)) return null; // arquivo de código ou fora do curso: só o texto
        return posix.relative(posix.dirname(destino(rel)), destino(alvo)) + (ancora ? "#" + ancora : "");
      };
      const r = markdown(src, { link });
      const m = moduloDe(rel);
      const saida = destino(rel);
      const nivel = saida.split("/").length - 1;
      const sobe = "../".repeat(nivel + 2); // dist/projetos/<nome>/... → dist/
      const inicioProj = posix.relative(posix.dirname(saida), "docs/README.html") || "README.html";
      const trilho = [`<a href="${sobe}index.html">learnFlow</a>`, "›", `<a href="${inicioProj}">${escH(nomeProj)}</a>`];
      if (m) trilho.push("›", `<span>Módulo ${escH(m.num)}</span>`);
      const marcar = m ? `<section class="lida" data-chave="${escH(chaveDe(m))}" data-pagina="${escH(saida)}">
  <p>Terminou esta página? Marque para o progresso do módulo aparecer no learnFlow.</p>
  <button type="button" aria-pressed="false">Marcar como lida</button></section>
<script>(()=>{const s=document.querySelector(".lida"),b=s.querySelector("button"),k=s.dataset.chave,p=s.dataset.pagina;
const ler=()=>{try{const v=JSON.parse(localStorage.getItem(k)||"[]");return Array.isArray(v)?v:[]}catch{return[]}};
const pinta=()=>{const on=ler().includes(p);b.setAttribute("aria-pressed",on);b.textContent=on?"✓ Lida (desmarcar)":"Marcar como lida"};
b.addEventListener("click",()=>{const v=ler(),i=v.indexOf(p);i<0?v.push(p):v.splice(i,1);try{localStorage.setItem(k,JSON.stringify(v))}catch{};pinta()});pinta();})();</script>` : "";
      const interacoes = /class="(yt|ens-palpite|tarefa)/.test(r.html)
        ? `<script>(()=>{document.querySelectorAll(".yt").forEach(b=>b.addEventListener("click",()=>{const f=document.createElement("iframe");f.src="https://www.youtube-nocookie.com/embed/"+b.dataset.id+"?autoplay=1&rel=0";f.allow="autoplay; encrypted-media; picture-in-picture; fullscreen";f.allowFullscreen=true;f.title=b.getAttribute("aria-label")||"Vídeo";const d=document.createElement("div");d.className="yt";d.append(f);b.replaceWith(d)},{once:true}));
document.querySelectorAll(".tarefa input").forEach((c,i)=>{const k="lf:tarefa:"+location.pathname+":"+i;try{const v=localStorage.getItem(k);if(v!==null)c.checked=v==="1"}catch{}c.addEventListener("change",()=>{try{localStorage.setItem(k,c.checked?"1":"0")}catch{}})});
document.querySelectorAll(".ens-palpite").forEach((t,i)=>{const k="lf:palpite:"+location.pathname+":"+i;try{t.value=localStorage.getItem(k)||""}catch{}t.addEventListener("input",()=>{try{localStorage.setItem(k,t.value)}catch{}})});})();</script>`
        : "";
      const mermaid = r.temMermaid
        ? `<script type="module">import m from "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs";m.initialize({startOnLoad:true,theme:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"default"});</script>`
        : "";
      const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escH((r.titulo || nomeProj) + " · " + nomeProj)}</title>
<link rel="icon" href="${sobe}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>${ESTILO}</style></head><body>
${barra.replace('href="../index.html"', `href="${sobe}index.html"`)}
<main class="doc"><nav class="trilho" aria-label="Você está em">${trilho.join(" ")}</nav>
${r.html}
${marcar}
</main>${interacoes}${mermaid}</body></html>`;
      const arq = join(dist, "projetos", nome, saida);
      mkdirSync(dirname(arq), { recursive: true });
      writeFileSync(arq, html);
      paginas++;
    }

    // cartões dos módulos
    for (const m of mods) {
      const destinoMod = m.arquivo ? destino(posix.normalize(posix.join("docs", m.arquivo))) : null;
      const pags = paginasDoModulo.get(m.num) ?? [];
      let objetivo = "";
      if (m.arquivo && existe.has(posix.normalize(posix.join("docs", m.arquivo)))) {
        const md = readFileSync(join(dir, "docs", m.arquivo), "utf8");
        objetivo = semMd((/\*\*Objetivo:\*\*\s*([\s\S]*?)(?:\n\s*\n)/.exec(md) || [])[1] ?? "") ||
          semMd((md.split(/\r?\n\r?\n/).find((b) => b.trim() && !/^\s*(#|\||```|[-*>])/.test(b)) || "").replace(/\n/g, " "));
      }
      const card = {
        tipo: "modulo",
        projeto: nomeProj,
        modulo: m.num,
        slug: `${nome}-modulo-${m.num}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        nome: `${nomeProj} · Módulo ${m.num}`,
        subtitulo: m.nome,
        categoria: "projetos",
        volume: null,
        selo: `Projeto guiado · ${nomeProj}`,
        resumo: objetivo ? objetivo[0].toUpperCase() + objetivo.slice(1) : m.nome,
        temas: m.cert ? m.cert.split(/,\s*|\s+\+\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 3) : [],
        cenas: 0,
        licoes: pags.length,
        total: m.pronto ? pags.length : 0,
        chave: chaveDe(m),
        pronto: m.pronto,
        status: m.status,
        href: m.pronto && destinoMod ? `projetos/${nome}/${destinoMod}` : null,
      };
      modulos.push(card);
      refs.set(`${nome}:${m.num}`.toLowerCase(), card.slug);
    }
    projetos.push({ id: nome, nome: nomeProj, resumo: resumoProj, inicio: `projetos/${nome}/docs/README.html`, sobre: raizMd ? `projetos/${nome}/sobre.html` : null });
  }
  return { modulos, refs, paginas, projetos };
}
