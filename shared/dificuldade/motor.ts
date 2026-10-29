/**
 * Motor de classificação de dificuldade (nível 1-5).
 * Port fiel da heurística original (etapa 51), reescrito para ler TODOS os
 * limiares/pesos de uma ConfigDificuldade e devolver o detalhamento regra a
 * regra. Ordem das contribuições = ordem da heurística original (a
 * justificativa concatenada fica idêntica no padrão).
 */
import { CONFIG_PADRAO, pesoTemaDe } from "./config";
import type {
  ConfigDificuldade,
  ContribuicaoRegra,
  FaixaDificuldade,
  QuestaoDificuldade,
  ResultadoAvaliacao,
} from "./tipos";

const norm = (s: unknown): string => String(s ?? "").trim();
const semAcentoBaixo = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function palavras(texto: string, minPalavra: number): string[] {
  return semAcentoBaixo(norm(texto))
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > minPalavra);
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/* Compilação por identidade de configuração (WeakMap invalida sozinho ao editar). */
interface Compilado {
  reContextual: RegExp | null;
  reComplemento: RegExp | null;
  areasNorm: Array<[string, string[]]>;
}
const compilados = new WeakMap<ConfigDificuldade, Compilado>();

function compilar(cfg: ConfigDificuldade): Compilado {
  let c = compilados.get(cfg);
  if (!c) {
    const criar = (lista: string[]): RegExp | null => {
      if (!lista.length) return null;
      try {
        return new RegExp(lista.join("|"), "i");
      } catch {
        return null;
      }
    };
    const ctx = cfg.regras.contextual;
    c = {
      reContextual: ctx.ativo ? criar(ctx.padroes) : null,
      reComplemento: ctx.ativo ? criar(ctx.complemento.padroes) : null,
      areasNorm: Object.entries(cfg.areas || {}).map(([nome, termos]) => [
        nome,
        termos.filter((t) => typeof t === "string" && t.length > 0),
      ]),
    };
    compilados.set(cfg, c);
  }
  return c;
}

function alternativasTexto(q: QuestaoDificuldade): string[] {
  const lista = q.alternatives || q.alternativas || [];
  return lista.map((a) => norm((a && (a.text ?? a.texto)) || ""));
}

/** Conta as corretas: flags `correta` (formato de geração) ou campo `correct` (KuaaRepo). */
function corretasContagem(q: QuestaoDificuldade): number {
  const lista = q.alternatives || q.alternativas || [];
  const flags = lista.filter((a) => a && a.correta === true).length;
  if (flags > 0) return flags;
  if (q.correct !== undefined && q.correct !== null && String(q.correct).trim() !== "") return 1;
  return 0;
}

/** Assunto/tema da questão (campos diretos ou hierarquia do `subject` do repo). */
export function assuntoTema(q: QuestaoDificuldade): { assunto: string; tema: string } {
  let assunto = norm(q.assunto);
  let tema = norm(q.tema);
  if ((!assunto || !tema) && typeof q.subject === "string") {
    const partes = q.subject.split(">").map((s) => s.trim());
    if (!assunto && partes[1]) assunto = partes[1];
    if (!tema && partes[2]) tema = partes[2];
  }
  return { assunto, tema };
}

export interface ExtraAvaliacao {
  /** Sobrepõe o peso de tema derivado da configuração (compat. com o gerador). */
  pesoTema?: number;
  pesoTemaLabel?: string;
}

/** Avalia uma questão no formato kuaa (qualquer geração) e devolve nível 1-5 + detalhes. */
export function avaliarQuestao(
  q: QuestaoDificuldade,
  cfg: ConfigDificuldade = CONFIG_PADRAO,
  extra: ExtraAvaliacao = {},
): ResultadoAvaliacao {
  const R = cfg.regras;
  const contrib: ContribuicaoRegra[] = [];
  const add = (codigo: string, rotulo: string, delta: number, detalhe?: string) => {
    contrib.push({ codigo, rotulo, delta, detalhe });
  };

  const texto = norm(q.text ?? q.enunciado);
  const apoio = norm(q.baseText ?? q.texto_apoio);
  const alts = alternativasTexto(q);
  let pontos = cfg.base.pontos;

  // --- peso-base do conteúdo (tema historicamente mais difícil)
  if (R.pesoTema.ativo) {
    const { assunto, tema } = assuntoTema(q);
    const derivado = pesoTemaDe(cfg, assunto, tema);
    const peso = extra.pesoTema !== undefined ? Number(extra.pesoTema) : derivado.peso;
    const rotuloPeso = extra.pesoTemaLabel || derivado.rotulo;
    if (Number(peso) > 0) {
      pontos += R.pesoTema.delta;
      add("pesoTema", "conteúdo avançado", R.pesoTema.delta, `conteúdo avançado (${rotuloPeso || "tema"})`);
    }
  }

  // --- enunciado: curto ↓, longo ↑, muito longo ↑↑ (escada exata do original)
  if (R.enunciado.ativo) {
    const len = texto.length;
    if (len < R.enunciado.curto.limiar) {
      pontos += R.enunciado.curto.delta;
      add("enunciadoCurto", "enunciado curto", R.enunciado.curto.delta, "enunciado curto");
    } else if (len > R.enunciado.muitoLongo.limiar) {
      pontos += R.enunciado.muitoLongo.delta;
      add("enunciadoMuitoLongo", "enunciado muito longo", R.enunciado.muitoLongo.delta, "enunciado muito longo");
    } else if (len > R.enunciado.longo.limiar) {
      pontos += R.enunciado.longo.delta;
      add("enunciadoLongo", "enunciado longo", R.enunciado.longo.delta, "enunciado longo");
    }
  }

  // --- texto de apoio
  if (R.apoio.ativo && apoio.length > R.apoio.limiar) {
    pontos += R.apoio.delta;
    add("apoio", "texto de apoio", R.apoio.delta, "texto de apoio");
  }

  // --- pergunta contextualizada (padrões no enunciado; complemento só em textos longos)
  if (R.contextual.ativo) {
    const c = compilar(cfg);
    const bate = (c.reContextual?.test(texto) ?? false)
      || (texto.length > R.contextual.complemento.minChars && (c.reComplemento?.test(texto) ?? false));
    if (bate) {
      pontos += R.contextual.delta;
      add("contextual", "pergunta contextualizada", R.contextual.delta, "pergunta contextualizada");
    }
  }

  // --- 1) padrão "resposta óbvia" (uma alternativa completa, demais curtas/vagas)
  if (R.obvia.ativo) {
    const lens = alts.map((t) => t.length).filter((n) => n > 0);
    if (lens.length >= R.obvia.minAlts) {
      const ordenados = [...lens].sort((a, b) => b - a);
      const [maior, segunda] = ordenados;
      if (
        segunda !== undefined
        && maior > R.obvia.fator * segunda
        && maior > R.obvia.minMaior
        && segunda <= R.obvia.maxSegunda
      ) {
        pontos += R.obvia.delta;
        add("obvia", "alternativa óbvia", R.obvia.delta, "alternativa óbvia (uma completa, demais vagas)");
      }
    }
  }

  // --- 2) alternativas elaboradas e 3) parecidas entre si
  const elaboradas = R.elaboradas.ativo ? alts.filter((t) => t.length >= R.elaboradas.minChars) : [];
  if (R.elaboradas.ativo && elaboradas.length >= R.elaboradas.minQtd) {
    pontos += R.elaboradas.delta;
    add("elaboradas", "alternativas elaboradas", R.elaboradas.delta, `${elaboradas.length} alternativas elaboradas`);
    if (R.parecidas.ativo && elaboradas.length >= R.parecidas.minQtd) {
      let soma = 0;
      let pares = 0;
      for (let i = 0; i < elaboradas.length; i += 1) {
        for (let j = i + 1; j < elaboradas.length; j += 1) {
          soma += jaccard(palavras(elaboradas[i], cfg.normalizacao.minPalavra), palavras(elaboradas[j], cfg.normalizacao.minPalavra));
          pares += 1;
        }
      }
      const similaridade = pares ? soma / pares : 0;
      if (similaridade >= R.parecidas.limiarForte) {
        pontos += R.parecidas.deltaForte;
        add("parecidas", "alternativas parecidas", R.parecidas.deltaForte, "alternativas parecidas entre si");
      } else if (similaridade >= R.parecidas.limiarFraco) {
        pontos += R.parecidas.deltaFraco;
        add("parecidasProximas", "alternativas com vocabulário próximo", R.parecidas.deltaFraco, "alternativas com vocabulário próximo");
      }
    }
  }

  // --- número de alternativas
  if (R.alternativas.ativo) {
    if (alts.length >= R.alternativas.seis.min) {
      pontos += R.alternativas.seis.delta;
      add("seisAlternativas", "mais alternativas", R.alternativas.seis.delta, `${alts.length} alternativas`);
    } else if (alts.length <= R.alternativas.duas.max) {
      pontos += R.alternativas.duas.delta;
      add("duasAlternativas", "menos alternativas", R.alternativas.duas.delta, `só ${alts.length} alternativas`);
    }
  }

  // --- interdisciplinaridade (2+ áreas com pistas sólidas no texto)
  if (R.interdisciplinar.ativo) {
    const alvo = semAcentoBaixo(`${texto} ${apoio}`);
    const areas: string[] = [];
    for (const [area, termos] of compilar(cfg).areasNorm) {
      const acertos = termos.filter((k) => alvo.includes(semAcentoBaixo(k))).length;
      if (acertos >= R.interdisciplinar.minAcertosChave) areas.push(area);
    }
    if (areas.length >= R.interdisciplinar.minAreas) {
      pontos += R.interdisciplinar.delta;
      add(
        "interdisciplinar",
        "interdisciplinar",
        R.interdisciplinar.delta,
        `interdisciplinar (${areas.slice(0, 2).join(" + ")})`,
      );
    }
  }

  // --- gabarito múltiplo (mais de uma correta)
  if (R.multiplasCorretas.ativo && corretasContagem(q) > 1) {
    pontos += R.multiplasCorretas.delta;
    add("multiplasCorretas", "múltiplas corretas", R.multiplasCorretas.delta, "múltiplas corretas");
  }

  // --- recorte + faixa
  const nivel = Math.max(cfg.base.min, Math.min(cfg.base.max, pontos));
  const dificuldade: FaixaDificuldade = nivel <= cfg.faixas.facilAte
    ? "facil"
    : nivel <= cfg.faixas.mediaAte
      ? "media"
      : "dificil";

  const justificativa = contrib.length
    ? contrib.map((c) => c.detalhe ?? c.rotulo).join("; ")
    : dificuldade === "facil"
      ? "poucos sinais de dificuldade"
      : dificuldade === "media"
        ? "perfil intermediário"
        : "múltiplos sinais de dificuldade";

  return { nivel, pontos, dificuldade, justificativa, contribuicoes: contrib };
}
