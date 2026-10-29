/**
 * Lotes: leitura de qualquer JSON de questões (pacotes KuaaRepo, listas de
 * geração, provas legadas), avaliação em massa, estatísticas, exportação,
 * amostragem estratificada e métricas contra rótulos humanos.
 */
import type {
  AvaliacaoItem,
  CargaLote,
  ConfigDificuldade,
  FaixaDificuldade,
  ItemLote,
  MetricasValidacao,
  QuestaoDificuldade,
  RotuloHumano,
} from "./tipos";
import { avaliarQuestao } from "./motor";

const norm = (s: unknown) => String(s ?? "").trim();

function ehQuestao(v: unknown): v is QuestaoDificuldade {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return typeof o.text === "string" || typeof o.enunciado === "string";
}

function tituloProva(e: Record<string, unknown>): string {
  return norm(e.title ?? e.titulo ?? e.nome ?? e.name ?? e.id ?? "").slice(0, 120);
}

function pareceProva(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Array.isArray((v as Record<string, unknown>).questions);
}

/** Varre um documento qualquer e extrai itens com a posição exata (para exportar por cima). */
function coletar(doc: unknown, arquivo: string, itens: ItemLote[]): number {
  let seq = 0;
  const add = (
    questao: QuestaoDificuldade,
    prova: string,
    local: ItemLote["local"],
    examIdx: number,
    questIdx: number,
  ) => {
    itens.push({
      chave: `${arquivo}#${seq}`,
      arquivo,
      prova,
      indice: seq,
      local,
      examIdx,
      questIdx,
      questao,
    });
    seq += 1;
  };

  if (doc && typeof doc === "object" && !Array.isArray(doc)) {
    const o = doc as Record<string, unknown>;
    if (Array.isArray(o.exams)) {
      o.exams.forEach((e, ei) => {
        if (!pareceProva(e)) return;
        const titulo = tituloProva(e);
        (e.questions as unknown[]).forEach((q, qi) => {
          if (ehQuestao(q)) add(q, titulo || `Prova ${ei + 1}`, "exams", ei, qi);
        });
      });
      return seq;
    }
    if (Array.isArray(o.questions)) {
      const titulo = tituloProva(o);
      (o.questions as unknown[]).forEach((q, qi) => {
        if (ehQuestao(q)) add(q, titulo || "Questões", "questions", -1, qi);
      });
      return seq;
    }
    if (ehQuestao(o)) {
      add(o, "Questão avulsa", "raiz", -1, 0);
      return seq;
    }
  }

  if (Array.isArray(doc)) {
    const temProvas = doc.some(pareceProva);
    if (temProvas) {
      doc.forEach((e, ei) => {
        if (!pareceProva(e)) return;
        const titulo = tituloProva(e);
        (e.questions as unknown[]).forEach((q, qi) => {
          if (ehQuestao(q)) add(q, titulo || `Prova ${ei + 1}`, "raiz", ei, qi);
        });
      });
      return seq;
    }
    doc.forEach((q) => {
      if (ehQuestao(q)) add(q, "Questões", "raiz", -1, seq);
    });
    return seq;
  }
  return 0;
}

/** Lê vários JSONs (texto) e devolve uma carga única pronta para avaliar. */
export function carregarJsons(textos: { nome: string; conteudo: string }[]): CargaLote {
  const itens: ItemLote[] = [];
  const docs = new Map<string, unknown>();
  const arquivos: CargaLote["arquivos"] = [];
  const erros: CargaLote["erros"] = [];
  for (const { nome, conteudo } of textos) {
    try {
      const limpo = conteudo.replace(/^\uFEFF/, "");
      const doc: unknown = JSON.parse(limpo);
      const antes = itens.length;
      const n = coletar(doc, nome, itens);
      if (!n) {
        erros.push({ nome, erro: "Nenhuma questão encontrada (formato não reconhecido)." });
        continue;
      }
      docs.set(nome, doc);
      const provas = new Set(itens.slice(antes).map((i) => i.prova));
      arquivos.push({ nome, provas: provas.size, questoes: n });
    } catch (e) {
      erros.push({ nome, erro: `JSON inválido: ${e instanceof Error ? e.message.slice(0, 140) : String(e)}` });
    }
  }
  itens.sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"));
  return { itens, docs, arquivos, erros };
}

/** Faixa a partir de um rótulo legado ("fácil", "media", "Dificil"...). */
export function faixaDeRotulo(v: unknown): FaixaDificuldade | null {
  const s = norm(v).toLowerCase();
  if (!s) return null;
  const t = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.startsWith("fac")) return "facil";
  if (t.startsWith("med")) return "media";
  if (t.startsWith("dif")) return "dificil";
  return null;
}

/** Avalia todos os itens com a configuração atual e compara com o que já estava gravado. */
export function avaliarItens(itens: ItemLote[], cfg: ConfigDificuldade): AvaliacaoItem[] {
  return itens.map((item) => {
    const q = item.questao;
    const resultado = avaliarQuestao(q, cfg);
    const niv = Number(q.dificuldade_nivel ?? q.nivel);
    const nivelAnterior = Number.isInteger(niv) && niv >= 1 && niv <= 5 ? niv : null;
    const faixaAnterior = faixaDeRotulo(q.difficulty ?? q.dificuldade);
    return {
      item,
      resultado,
      nivelAnterior,
      faixaAnterior,
      mudouFaixa: faixaAnterior !== null && faixaAnterior !== resultado.dificuldade,
    };
  });
}

export function estatisticas(avaliados: AvaliacaoItem[]): {
  total: number;
  porNivel: number[];
  porFaixa: Record<FaixaDificuldade, number>;
  mudancas: number;
  semAnterior: number;
  porArquivo: Record<string, { total: number; porNivel: number[]; mudancas: number }>;
} {
  const porNivel = [0, 0, 0, 0, 0];
  const porFaixa: Record<FaixaDificuldade, number> = { facil: 0, media: 0, dificil: 0 };
  const porArquivo: Record<string, { total: number; porNivel: number[]; mudancas: number }> = {};
  let mudancas = 0;
  let semAnterior = 0;
  for (const a of avaliados) {
    porNivel[a.resultado.nivel - 1] += 1;
    porFaixa[a.resultado.dificuldade] += 1;
    if (a.faixaAnterior === null) semAnterior += 1;
    if (a.mudouFaixa) mudancas += 1;
    const f = (porArquivo[a.item.arquivo] ||= { total: 0, porNivel: [0, 0, 0, 0, 0], mudancas: 0 });
    f.total += 1;
    f.porNivel[a.resultado.nivel - 1] += 1;
    if (a.mudouFaixa) f.mudancas += 1;
  }
  return { total: avaliados.length, porNivel, porFaixa, mudancas, semAnterior, porArquivo };
}

function clonar(doc: unknown): unknown {
  if (typeof structuredClone === "function") return structuredClone(doc);
  return JSON.parse(JSON.stringify(doc)) as unknown;
}

function noLugar(doc: unknown, a: AvaliacaoItem): QuestaoDificuldade | null {
  const o = doc as Record<string, unknown>;
  if (a.item.local === "exams") {
    const exams = o.exams as Record<string, unknown>[] | undefined;
    const prova = exams?.[a.item.examIdx];
    const qs = prova?.questions as QuestaoDificuldade[] | undefined;
    return qs?.[a.item.questIdx] ?? null;
  }
  if (a.item.local === "questions") {
    const qs = o.questions as QuestaoDificuldade[] | undefined;
    return qs?.[a.item.questIdx] ?? null;
  }
  if (Array.isArray(doc)) {
    const primeiro = doc[a.item.examIdx >= 0 ? a.item.examIdx : 0];
    if (pareceProva(primeiro)) {
      const qs = primeiro.questions as QuestaoDificuldade[];
      return qs[a.item.questIdx] ?? null;
    }
    return (doc as QuestaoDificuldade[])[a.item.questIdx] ?? null;
  }
  return null;
}

/** Grava o resultado nos documentos originais (clone) e devolve o JSON pronto para baixar. */
export function exportarJson(carga: CargaLote, avaliados: AvaliacaoItem[]): { nome: string; conteudo: string }[] {
  const clonados = new Map<string, unknown>();
  for (const [nome, doc] of carga.docs) clonados.set(nome, clonar(doc));
  for (const a of avaliados) {
    const doc = clonados.get(a.item.arquivo);
    if (doc === undefined) continue;
    const q = noLugar(doc, a);
    if (!q) continue;
    q.dificuldade_nivel = a.resultado.nivel;
    q.dificuldade_pontos = a.resultado.pontos;
    q.dificuldade_justificativa = a.resultado.justificativa;
    q.difficulty = a.resultado.dificuldade;
    q.dificuldade = a.resultado.dificuldade;
  }
  return [...clonados.entries()].map(([nome, doc]) => ({
    nome,
    conteudo: JSON.stringify(doc, null, 2),
  }));
}

const aspas = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** CSV em ; com BOM (abre direto no Excel pt-BR). */
export function exportarCsv(avaliados: AvaliacaoItem[]): string {
  const linhas = [
    ["Arquivo", "Prova", "#", "Enunciado", "Nivel anterior", "Nivel novo", "Faixa anterior", "Faixa nova", "Pontos", "Mudou faixa", "Justificativa"].join(";"),
  ];
  for (const a of avaliados) {
    linhas.push(
      [
        aspas(a.item.arquivo),
        aspas(a.item.prova),
        a.item.indice + 1,
        aspas(norm(a.item.questao.text ?? a.item.questao.enunciado).slice(0, 160)),
        a.nivelAnterior ?? "",
        a.resultado.nivel,
        a.faixaAnterior ?? "",
        a.resultado.dificuldade,
        a.resultado.pontos,
        a.mudouFaixa ? "sim" : "nao",
        aspas(a.resultado.justificativa),
      ].join(";"),
    );
  }
  return `\uFEFF${linhas.join("\r\n")}`;
}

/* ------------------------------------------------------------------ */
/* Amostragem + validação humana                                       */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function embaralhar<T>(lista: T[], rnd: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Amostra estratificada: N por nível (reprodutível pela semente). */
export function sortearAmostra(
  avaliados: AvaliacaoItem[],
  opcoes: { porNivel: number; seed: number; somenteMudou?: boolean },
): AvaliacaoItem[] {
  const base = opcoes.somenteMudou ? avaliados.filter((a) => a.mudouFaixa) : avaliados;
  const rnd = mulberry32(opcoes.seed);
  const porNivel: AvaliacaoItem[][] = [[], [], [], [], []];
  for (const a of base) porNivel[a.resultado.nivel - 1].push(a);
  const amostra: AvaliacaoItem[] = [];
  for (let n = 0; n < 5; n += 1) {
    amostra.push(...embaralhar(porNivel[n], rnd).slice(0, opcoes.porNivel));
  }
  return embaralhar(amostra, rnd);
}

/** Chave estável de uma questão (enunciado normalizado) — casa rótulo com questão recarregada. */
export function chaveQuestao(q: QuestaoDificuldade): string {
  const texto = norm(q.text ?? q.enunciado)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  let h = 5381;
  for (let i = 0; i < texto.length; i += 1) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Métricas do motor contra os rótulos humanos (reavaliados com a config ATUAL). */
export function calcularMetricas(rotulos: RotuloHumano[], cfg: ConfigDificuldade): MetricasValidacao {
  const confusao = Array.from({ length: 5 }, () => [0, 0, 0, 0, 0]);
  let exato = 0;
  let dentro = 0;
  let somaAbs = 0;
  let somaHum = 0;
  let somaMaq = 0;
  for (const r of rotulos) {
    const maq = avaliarQuestao(r.questao, cfg).nivel;
    const hum = Math.max(1, Math.min(5, Number(r.nivelHumano) || 1));
    const d = Math.abs(hum - maq);
    if (d === 0) exato += 1;
    if (d <= 1) dentro += 1;
    somaAbs += d;
    somaHum += hum;
    somaMaq += maq;
    confusao[hum - 1][maq - 1] += 1;
  }
  const n = rotulos.length;
  return {
    n,
    exato: n ? exato / n : 0,
    dentroDeUm: n ? dentro / n : 0,
    mae: n ? somaAbs / n : 0,
    confusao,
    mediaHumano: n ? somaHum / n : 0,
    mediaMaquina: n ? somaMaq / n : 0,
  };
}
