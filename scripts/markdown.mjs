// Conversor de Markdown para HTML, pequeno e sem dependências, para as lições
// dos projetos guiados. Cobre o que as lições usam: títulos, parágrafos, ênfase,
// código (inline e em bloco), links, listas (com aninhamento), tabelas,
// citações, linhas horizontais e blocos mermaid.

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

export const slugTitulo = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/<[^>]+>/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Texto inline: código, links, negrito, itálico. `link(href)` devolve o href final ou null. */
function inline(src, link) {
  // links e imagens primeiro: o texto de um link pode conter `código`
  const marcados = [];
  src = src.replace(/(`+)[\s\S]*?[^`]\1(?!`)|(!?)\[([^\]]+)\]\(([^)\s]+)\)/g, (m, crase, img, txt, href) => {
    if (crase) return m; // dentro de `código`, nada vira link
    marcados.push({ img, txt, href });
    return `\u0000${marcados.length - 1}\u0000`;
  });
  const partes = [];
  // separa trechos de código primeiro (o conteúdo deles não é interpretado)
  const re = /(`+)([\s\S]*?[^`])\1(?!`)/g;
  let i = 0, m;
  while ((m = re.exec(src))) {
    partes.push({ t: src.slice(i, m.index) });
    partes.push({ c: m[2].trim() === "" ? m[2] : m[2].replace(/^ (.*) $/, "$1") });
    i = m.index + m[0].length;
  }
  partes.push({ t: src.slice(i) });
  return partes.map((p) => {
    if (p.c !== undefined) return `<code>${esc(p.c)}</code>`;
    let s = esc(p.t);
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,;:!?])/g, (_, a, u) => `${a}<a href="${escAttr(u)}" target="_blank" rel="noopener">${u}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, "$1<em>$2</em>").replace(/(^|[^_\w])_([^_\s][^_]*?)_(?![\w_])/g, "$1<em>$2</em>");
    s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return s;
  }).join("").replace(/\u0000(\d+)\u0000/g, (_, n) => {
    const { img, txt, href } = marcados[Number(n)];
    const h = link(href);
    if (img) return h ? `<img src="${escAttr(h)}" alt="${escAttr(txt)}">` : esc(txt);
    const texto = inline(txt, link);
    if (!h) return texto;
    const ext = /^https?:/.test(h);
    return `<a href="${escAttr(h)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${texto}</a>`;
  });
}

const linhaTabela = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));

/**
 * Converte Markdown em HTML.
 * @returns {{ html: string, titulo: string|null, temMermaid: boolean, titulos: {nivel:number,texto:string,id:string}[] }}
 */
export function markdown(md, { link = (h) => h } = {}) {
  const linhas = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  const titulos = [];
  const ids = new Map();
  let titulo = null, temMermaid = false;
  let i = 0;

  const idPara = (texto) => {
    const base = slugTitulo(texto) || "secao";
    const n = ids.get(base) ?? 0; ids.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };

  const ehInicioDeBloco = (l, prox) =>
    /^\s*$/.test(l) || /^#{1,6}\s/.test(l) || /^\s*:::/.test(l) || /^\s*(```|~~~)/.test(l) || /^\s*>/.test(l) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(l) || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l) ||
    (/^\s*\|/.test(l) && prox !== undefined && /^\s*\|?\s*:?-{2,}/.test(prox));

  function lista(inicio) {
    // agrupa itens pelo recuo do primeiro marcador
    const recuo = /^(\s*)/.exec(linhas[inicio])[1].length;
    const ordenada = /^\s*\d+[.)]\s+/.test(linhas[inicio]);
    const itens = [];
    let j = inicio;
    while (j < linhas.length) {
      const l = linhas[j];
      const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(l);
      if (m && m[1].length === recuo) { itens.push([m[3]]); j++; continue; }
      if (/^\s*$/.test(l)) {
        // linha em branco: continua a lista se a próxima for item ou conteúdo recuado
        const prox = linhas[j + 1] ?? "";
        const mp = /^(\s*)([-*+]|\d+[.)])\s+/.exec(prox);
        if ((mp && mp[1].length >= recuo) || (/^\s+\S/.test(prox) && /^(\s*)/.exec(prox)[1].length > recuo)) { itens.at(-1)?.push(""); j++; continue; }
        break;
      }
      const r = /^(\s*)/.exec(l)[1].length;
      if (r > recuo && itens.length) { itens.at(-1).push(l.slice(Math.min(r, recuo + 2 + (ordenada ? 1 : 0)))); j++; continue; }
      if (m && m[1].length < recuo) break;
      if (!m && itens.length && !ehInicioDeBloco(l, linhas[j + 1])) { itens.at(-1).push(l.trim()); j++; continue; }
      break;
    }
    const tag = ordenada ? "ol" : "ul";
    const num = ordenada ? Number(/^\s*(\d+)/.exec(linhas[inicio])[1]) : 1;
    const html = itens.map((linhasItem) => {
      let corpo = linhasItem.join("\n").replace(/\n+$/, "");
      const tarefa = /^\[([ xX])\]\s+/.exec(corpo);
      if (tarefa) corpo = corpo.slice(tarefa[0].length);
      const temBloco = /\n\s*([-*+]|\d+[.)])\s|\n\s*```|\n\n/.test(corpo);
      const interno = temBloco ? markdownBloco(corpo) : inline(corpo.replace(/\n/g, " "), link);
      const conteudo = interno.replace(/^<p>([\s\S]*?)<\/p>$/, "$1");
      if (tarefa) return `<li class="tarefa"><label><input type="checkbox"${tarefa[1] === " " ? "" : " checked"}> <span>${conteudo}</span></label></li>`;
      return `<li>${conteudo}</li>`;
    }).join("");
    out.push(`<${tag}${ordenada && num !== 1 ? ` start="${num}"` : ""}>${html}</${tag}>`);
    return j;
  }

  function markdownBloco(src) {
    const r = markdown(src, { link });
    if (r.temMermaid) temMermaid = true;
    return r.html;
  }

  function blocoDeEnsino(tipo, rotulo, src) {
    const [visivel, escondido] = src.split(/^\s*\?\?\?\s*$/m);
    const tit = rotulo ? inline(rotulo, link) : "";
    if (tipo === "video") {
      const linhasV = visivel.trim().split("\n");
      const url = linhasV[0].trim();
      const id = (/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(url) || [])[1];
      const desc = markdownBloco(linhasV.slice(1).join("\n"));
      if (!id) return `<aside class="ens ens-video"><p class="ens-tit">▶ ${tit}</p>${desc}<p><a href="${escAttr(url)}" target="_blank" rel="noopener">Abrir o vídeo</a></p></aside>`;
      return `<aside class="ens ens-video"><p class="ens-tit">▶ Vídeo · ${tit}</p>
<button type="button" class="yt" data-id="${id}" aria-label="Assistir: ${escAttr(rotulo)}"><img loading="lazy" src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt=""><span aria-hidden="true">▶</span></button>
${desc}<p class="ens-link"><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">Abrir no YouTube</a></p></aside>`;
    }
    const ROTULOS = {
      conceito: "O que é", porque: "Por que assim (e não de outro jeito)", analogia: "Analogia",
      armadilha: "Cuidado", previsao: "Antes de rodar: preveja", pergunta: "Pergunta para responder sem olhar",
      desafio: "Desafio sem roteiro", dica: "Dica", solucao: "Solução comentada", quebra: "Lab de quebra",
      checkpoint: "Você deve conseguir", repo: "No repositório", entrevista: "Pergunta de entrevista",
    };
    const nome = tit || ROTULOS[tipo] || tipo;
    if (tipo === "dica" || tipo === "solucao") {
      const resumo = tipo === "solucao" && rotulo && !/^solu/i.test(rotulo) ? `${ROTULOS.solucao} · ${tit}` : nome;
      return `<details class="ens ens-${tipo}"><summary>${resumo}</summary>${markdownBloco(src)}</details>`;
    }
    const cab = `<p class="ens-tit">${rotulo && ROTULOS[tipo] ? `<span>${ROTULOS[tipo]}</span> · ${tit}` : nome}</p>`;
    let html = markdownBloco(visivel ?? "");
    if (tipo === "previsao")
      html += `<textarea class="ens-palpite" rows="3" placeholder="Escreva seu palpite antes de abrir. Fica salvo neste navegador."></textarea>`;
    if (escondido !== undefined) {
      const abre = tipo === "previsao" ? "Ver o que acontece" : tipo === "pergunta" || tipo === "entrevista" ? "Ver a resposta" : "Ver mais";
      html += `<details class="ens-resp"><summary>${abre}</summary>${markdownBloco(escondido)}</details>`;
    }
    return `<aside class="ens ens-${escAttr(tipo)}">${cab}${html}</aside>`;
  }

  while (i < linhas.length) {
    const l = linhas[i];
    if (/^\s*$/.test(l)) { i++; continue; }

    let m;
    if ((m = /^\s*(```|~~~)\s*([\w+-]*)\s*$/.exec(l))) {
      const cerca = m[1], lang = m[2];
      const corpo = [];
      i++;
      while (i < linhas.length && !new RegExp(`^\\s*${cerca}\\s*$`).test(linhas[i])) corpo.push(linhas[i++]);
      i++;
      const recuo = Math.min(...corpo.filter((x) => x.trim()).map((x) => /^(\s*)/.exec(x)[1].length), 99);
      const texto = corpo.map((x) => x.slice(recuo === 99 ? 0 : recuo)).join("\n");
      if (lang === "mermaid") { temMermaid = true; out.push(`<pre class="mermaid">${esc(texto)}</pre>`); }
      else out.push(`<div class="codigo"${lang ? ` data-lang="${escAttr(lang)}"` : ""}><pre><code>${esc(texto)}</code></pre></div>`);
      continue;
    }
    if ((m = /^\s*:::\s*([\w-]+)\s*(.*)$/.exec(l))) {
      // bloco de ensino: ::: tipo [título] ... ::: (pode aninhar; "???" separa o que fica escondido)
      const tipo = m[1].toLowerCase(), rotulo = m[2].trim();
      const corpo = [];
      let prof = 1;
      i++;
      while (i < linhas.length) {
        const x = linhas[i];
        if (/^\s*:::\s*[\w-]+/.test(x)) prof++;
        else if (/^\s*:::\s*$/.test(x) && --prof === 0) { i++; break; }
        corpo.push(x); i++;
      }
      out.push(blocoDeEnsino(tipo, rotulo, corpo.join("\n")));
      continue;
    }
    if ((m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l))) {
      const nivel = m[1].length, texto = m[2];
      const id = idPara(texto);
      const html = inline(texto, link);
      if (nivel === 1 && !titulo) titulo = texto.replace(/[`*_]/g, "");
      titulos.push({ nivel, texto: texto.replace(/[`*_]/g, ""), id });
      out.push(`<h${nivel} id="${id}">${html}</h${nivel}>`);
      i++; continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^\s*>/.test(l)) {
      const corpo = [];
      while (i < linhas.length && /^\s*>/.test(linhas[i])) corpo.push(linhas[i++].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${markdownBloco(corpo.join("\n"))}</blockquote>`);
      continue;
    }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{2,}/.test(linhas[i + 1] ?? "")) {
      const cab = linhaTabela(l);
      const alin = linhaTabela(linhas[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : ""));
      i += 2;
      const corpo = [];
      while (i < linhas.length && /^\s*\|/.test(linhas[i])) corpo.push(linhaTabela(linhas[i++]));
      const td = (tag, c, k) => `<${tag}${alin[k] ? ` style="text-align:${alin[k]}"` : ""}>${inline(c, link)}</${tag}>`;
      out.push(`<div class="tabela"><table><thead><tr>${cab.map((c, k) => td("th", c, k)).join("")}</tr></thead><tbody>${
        corpo.map((r) => `<tr>${cab.map((_, k) => td("td", r[k] ?? "", k)).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) { i = lista(i); continue; }

    const par = [l.trim()];
    i++;
    while (i < linhas.length && !ehInicioDeBloco(linhas[i], linhas[i + 1])) par.push(linhas[i++].trim());
    out.push(`<p>${inline(par.join(" "), link)}</p>`);
  }
  return { html: out.join("\n"), titulo, temMermaid, titulos };
}
