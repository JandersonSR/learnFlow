// Gera o site em dist/ a partir dos arquivos de conteudo/.
//
//   node scripts/build.mjs
//
// Para cada trilha (.html): nome de arquivo amigável para URL, links entre
// trilhas apontando para o próprio site (em vez de claude.ai), barra
// no topo para voltar ao menu. PDFs vão para dist/guias/.
// No fim, monta dist/index.html (o menu) com os dados de cada trilha.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync, statSync } from "node:fs";
import { join, extname, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CARREIRAS } from "./carreiras.mjs";
import { gerarProjetos } from "./projetos.mjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTEUDO = join(raiz, "conteudo");
const DIST = join(raiz, "dist");

// ---------------------------------------------------------------------
// Categorias (pela forma do nome do arquivo) e nomes especiais
// ---------------------------------------------------------------------
const CATEGORIAS = [
  { id: "volumes", nome: "Guia Técnico", descricao: "Os 24 volumes, do básico ao nível de arquiteto.", teste: (n) => /^Vol \d+ - /.test(n) },
  { id: "avancadas", nome: "Trilhas avançadas", descricao: "Aprofundamentos e o projeto final integrador.", teste: (n) => n.startsWith("Nova - ") },
  { id: "projetos", nome: "Projetos guiados", descricao: "Um sistema real construído módulo a módulo, com lições, exercícios e perguntas de entrevista.", teste: () => false },
  { id: "certificacoes", nome: "Certificações", descricao: "Azure, AWS, Kubernetes, Kafka, segurança e dados.", teste: (n) => n.startsWith("Cert - ") },
  { id: "tecnologias", nome: "Trilhas por tecnologia", descricao: ".NET, Node, AKS, Terraform, Kafka, dados e liderança.", teste: () => true },
];

const NOMES = {
  "code cookbook": "Do Pleno ao Staff",
  "high level": "Preparatório Big Tech",
};

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/#/g, "sharp").replace(/\+/g, "plus")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const semTags = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const entidades = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "·").replace(/&times;/g, "×");

/** Lê uma string JS ('...', "..." ou `...`) começando em s[i] (a aspa). */
function lerString(s, i) {
  const q = s[i];
  let j = i + 1, out = "";
  while (j < s.length && s[j] !== q) {
    if (s[j] === "\\") { out += s[j + 1]; j += 2; continue; }
    out += s[j++];
  }
  return { valor: out, fim: j + 1 };
}

/** Valor de texto de `campo: '...'` dentro de um objeto JS. */
function campoTexto(bloco, campo) {
  const m = new RegExp(`\\b${campo}\\s*:\\s*(['"\`])`).exec(bloco);
  return m ? lerString(bloco, m.index + m[0].length - 1).valor : null;
}

/** Trecho `[...]` (com colchetes balanceados, ignorando strings) a partir de s[i] === '['. */
function lerArray(s, i) {
  let prof = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === "'" || c === '"' || c === "`") { j = lerString(s, j).fim - 1; continue; }
    if (c === "/" && s[j + 1] === "/") { j = s.indexOf("\n", j); continue; }
    if (c === "[") prof++;
    else if (c === "]" && --prof === 0) return s.slice(i, j + 1);
  }
  return "[]";
}

/** Quantos itens tem `const NOME = [ [...], [...] ]` (lista de listas). */
function contarItens(s, nome) {
  const m = new RegExp(`const\\s+${nome}\\s*=\\s*\\[`).exec(s);
  if (!m) return 0;
  const arr = lerArray(s, m.index + m[0].length - 1);
  let prof = 0, n = 0;
  for (let j = 0; j < arr.length; j++) {
    const c = arr[j];
    if (c === "'" || c === '"' || c === "`") { j = lerString(arr, j).fim - 1; continue; }
    if (c === "[") { prof++; if (prof === 2) n++; }
    else if (c === "]") prof--;
  }
  return n;
}

/** Lista de strings de `campo: ['a', 'b']`. */
function campoLista(bloco, campo) {
  const m = new RegExp(`\\b${campo}\\s*:\\s*\\[`).exec(bloco);
  if (!m) return [];
  const arr = lerArray(bloco, m.index + m[0].length - 1);
  const itens = [];
  for (let j = 1; j < arr.length; j++) {
    if ("'\"`".includes(arr[j])) { const r = lerString(arr, j); itens.push(r.valor); j = r.fim - 1; }
  }
  return itens;
}

// ---------------------------------------------------------------------
// Leitura das trilhas
// ---------------------------------------------------------------------
function lerTrilha(arquivo) {
  const s = readFileSync(join(CONTEUDO, arquivo), "utf8");
  const base = basename(arquivo, ".html");
  const iConf = s.indexOf("const CONF");
  const conf = iConf >= 0 ? s.slice(iConf, iConf + 6000) : "";

  // chave do progresso: CONF.key ou o prefixo literal de 'xxx-study'
  let chave = conf ? campoTexto(conf, "key") : null;
  if (!chave) chave = (/renderList\(\s*'studyList'\s*,\s*'progStudy'\s*,\s*'([\w-]+)-study'/.exec(s) || [])[1] ?? null;

  const resumo =
    (conf && campoTexto(conf, "lead")) ||
    entidades(semTags((/<p class="lead"[^>]*>([\s\S]*?)<\/p>/.exec(s) || [])[1] ?? ""));
  const selo =
    (conf && campoTexto(conf, "eyebrow")) ||
    entidades(semTags((/<span class="eyebrow"[^>]*>([\s\S]*?)<\/span>/.exec(s) || [])[1] ?? ""));
  const temas = conf
    ? campoLista(conf, "pills")
    : [...s.matchAll(/<span class="pill">([\s\S]*?)<\/span>/g)].map((m) => entidades(semTags(m[1])));
  const cenas = (s.match(/\bsay\s*:/g) || []).length;

  const categoria = CATEGORIAS.find((c) => c.teste(base));
  const nome = NOMES[base] ?? base.replace(/^(Vol \d+|Nova|Cert) - /, "");
  const volume = (/^Vol (\d+)/.exec(base) || [])[1];

  return {
    arquivo, base, html: s, chave, categoria: categoria.id,
    nome, volume: volume ? Number(volume) : null,
    slug: slug(base), selo, resumo, temas: temas.slice(0, 6), cenas,
    total: contarItens(s, "STUDY") + contarItens(s, "CHECK"),
  };
}

// Barra fina no topo de cada trilha para voltar ao menu (um botão flutuante
// cobria o player ou o título da página).
const BARRA_MENU = `<nav class="lf-barra" aria-label="learnFlow"><a href="../index.html">← Todas as trilhas</a><span>learnFlow</span></nav>
<style>
.lf-barra{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:calc(8px + env(safe-area-inset-top,0px)) max(16px,env(safe-area-inset-right)) 8px max(16px,env(safe-area-inset-left));
  background:#0A1324;border-bottom:1px solid #25385A;font:500 14px/1.2 "IBM Plex Sans","Segoe UI",system-ui,sans-serif}
.lf-barra a{color:#E8EEF8;text-decoration:none;font-weight:600;padding:4px 0}
.lf-barra a:hover,.lf-barra a:focus-visible{color:#5B95FF;outline:none;text-decoration:underline}
.lf-barra span{color:#8798B4;font:800 12px/1 "Archivo","Helvetica Neue",Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase}
@media print{.lf-barra{display:none}}
</style>
<script>try{localStorage.setItem("lf:ultima",location.pathname.split("/").pop())}catch(e){}</script>
`;

// ---------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------
// esvazia dist/ (sem apagar a pasta em si: no Windows ela pode estar em uso)
mkdirSync(DIST, { recursive: true });
for (const f of readdirSync(DIST)) rmSync(join(DIST, f), { recursive: true, force: true });
mkdirSync(join(DIST, "trilhas"), { recursive: true });
mkdirSync(join(DIST, "guias"), { recursive: true });

const arquivos = readdirSync(CONTEUDO).filter((f) => statSync(join(CONTEUDO, f)).isFile());
const trilhas = arquivos.filter((f) => extname(f).toLowerCase() === ".html").map(lerTrilha);
const guias = arquivos.filter((f) => extname(f).toLowerCase() === ".pdf").map((f) => ({
  nome: basename(f, extname(f)),
  arquivo: `guias/${slug(basename(f, extname(f)))}.pdf`,
  tamanho: statSync(join(CONTEUDO, f)).size,
  origem: f,
}));

// slugs repetidos quebrariam links
const vistos = new Map();
for (const t of trilhas) {
  if (vistos.has(t.slug)) throw new Error(`Dois arquivos geram o mesmo endereço "${t.slug}": ${vistos.get(t.slug)} e ${t.arquivo}`);
  vistos.set(t.slug, t.arquivo);
}

// chave -> página, para reescrever os links entre trilhas.
// Algumas trilhas antigas usam no mapa TR uma chave diferente da do progresso.
const porChave = new Map(trilhas.filter((t) => t.chave).map((t) => [t.chave, t]));
const APELIDOS = { kafka: "kfk" };

let linksTrocados = 0;
const naoResolvidos = new Set();
for (const t of trilhas) {
  // entradas do tipo  chave: ['Nome', 'https://claude.ai/artifact/ID']
  let html = t.html.replace(
    /(['"]?)(\w+)\1\s*:\s*\[\s*(['"])(?:(?!\3).)*\3\s*,\s*(['"])https:\/\/claude\.ai\/artifact\/\w+\4/g,
    (tudo, _q, chave, _q2, aspa) => {
      const alvo = porChave.get(chave) ?? porChave.get(APELIDOS[chave]);
      if (!alvo) { naoResolvidos.add(`${chave} (em ${t.arquivo})`); return tudo; }
      linksTrocados++;
      return tudo.slice(0, tudo.indexOf("https://claude.ai/")) + `./${alvo.slug}.html${aspa}`;
    },
  );
  html = /<body[^>]*>/.test(html) ? html.replace(/<body[^>]*>/, (b) => b + BARRA_MENU) : BARRA_MENU + html;
  writeFileSync(join(DIST, "trilhas", `${t.slug}.html`), html);
}
for (const g of guias) copyFileSync(join(CONTEUDO, g.origem), join(DIST, g.arquivo));
const proj = gerarProjetos({ raiz, dist: DIST, barra: BARRA_MENU });

const dados = {
  gerado: new Date().toISOString(),
  categorias: CATEGORIAS.map(({ id, nome, descricao }) => ({ id, nome, descricao })),
  trilhas: trilhas
    .map(({ slug: s, nome, categoria, volume, selo, resumo, temas, cenas, total, chave }) =>
      ({ slug: s, nome, categoria, volume, selo, resumo, temas, cenas, total, chave }))
    .sort((a, b) => (a.volume ?? 999) - (b.volume ?? 999) || a.nome.localeCompare(b.nome, "pt-BR")),
  guias: guias.map(({ nome, arquivo, tamanho }) => ({ nome, arquivo, tamanho })),
  projetos: proj.projetos,
};
dados.trilhas.push(...proj.modulos);

// caminhos de carreira: troca o nome do arquivo pelo endereço da página
const porBase = new Map(trilhas.map((t) => [t.base, t.slug]));
const semPagina = new Set();
const resolver = (lista = []) => lista.map((b) => {
  const s = porBase.get(b) ?? proj.refs.get(b.toLowerCase());
  if (!s) semPagina.add(b);
  return s;
}).filter(Boolean);
dados.carreiras = CARREIRAS.map((c) => ({
  ...c,
  etapas: c.etapas.map((e) => ({ ...e, estudar: resolver(e.estudar), consulta: resolver(e.consulta) })),
}));

const modelo = readFileSync(join(raiz, "scripts", "menu.html"), "utf8");
writeFileSync(
  join(DIST, "index.html"),
  modelo.replace("/*__DADOS__*/null", JSON.stringify(dados).replace(/</g, "\\u003c")),
);
copyFileSync(join(raiz, "scripts", "favicon.svg"), join(DIST, "favicon.svg"));

console.log(`${trilhas.length} trilhas, ${guias.length} guia(s) em PDF, ${linksTrocados} links entre trilhas apontando para o site.`);
console.log(`${dados.carreiras.length} caminhos de carreira; ${proj.projetos.length} projeto(s) guiado(s) com ${proj.modulos.length} módulos e ${proj.paginas} páginas.`);
if (semPagina.size) console.warn("Trilhas citadas em scripts/carreiras.mjs que não existem em conteudo/:\n  " + [...semPagina].join("\n  "));
if (naoResolvidos.size) console.warn("Links sem trilha correspondente (continuam apontando para claude.ai):\n  " + [...naoResolvidos].join("\n  "));
const semChave = trilhas.filter((t) => !t.chave).map((t) => t.arquivo);
if (semChave.length) console.warn("Trilhas sem chave de progresso:", semChave.join(", "));
