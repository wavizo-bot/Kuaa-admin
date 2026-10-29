/**
 * Configuração padrão + perfis + fusão/validação de configurações.
 * O padrão reproduz EXATAMENTE a heurística original (avaliar-dificuldade.js,
 * etapa 51) — os testes de paridade garantem isso.
 */
import type { ConfigDificuldade, PerfilDificuldade } from "./tipos";

/* Termos por área — port exato do original (interdisciplinaridade). */
export const AREAS_PADRAO: Record<string, string[]> = {
  "Matemática": ["função", "equação", "fração", "porcentagem", "geometr", "volume", "probabilidade", "estatístic", "proporção", "juros", "inequação", "logaritmo"],
  "Física": ["energia", "força de", "movimento", "onda", "corrente", "tensão elétrica", "temperatura", "lente", "espelho", "ondulat", "circuit", "volts", "amper", "newton", "joule", "doppler"],
  "Química": ["mol ", "reação", "átomo", "ph ", "ácido", "óxido", "oxidação", "eletrólise", "estequiometria", "concentração", "radioativ", "ligação química", "tabela periódica", "íon", "sal de"],
  "Biologia": ["célula", "organismo", "genética", "dna", "ecossistema", "fotossíntese", "respiração celular", "hormônio", "circulatório", "digestó", "sistema nervoso", "bactéria", "espécie", "evolução", "cadeia trófica", "meio ambiente"],
  "Língua Portuguesa": ["verbo", "substantivo", "crase", "concordância", "regência", "sujeito", "predicado", "poema", "estrofe", "figura de linguagem", "gênero textual", "vírgula", "ortografia", "acentuação"],
  "História": ["século", "império", "colônia", "ditadura", "guerra", "revolução", "feudal", "escravid", "república", "independência", "ditador"],
  "Geografia": ["território", "urbano", "rural", "município", "região", "clima", "relevo", "população", "migração", "geopolítica", "bloco econômico", "agricultura"],
  "Filosofia": ["filósofo", "ética", "moral", "filosofia", "contrato social", "democracia", "justiça", "utilitarismo", "kant", "sócrates", "platão", "aristóteles"],
  "Sociologia": ["sociedade", "cidadania", "instituição", "desigualdade", "classe social", "movimento social", "norma social", "identidade cultural", "durkheim", "weber", "marx"],
  "Língua Inglesa": [" the ", " and ", " which", " because", "inglês"],
};

/* Peso-base por conteúdo (taxonomia BNCC da etapa 54). */
export const PESOS_TEMA_PADRAO: Record<string, number> = {
  "Álgebra > Funções": 1,
  "Álgebra > Inequações": 1,
  "Geometria > Trigonometria": 1,
  "Probabilidade e Estatística > Probabilidade": 1,
  "Termodinâmica > Calor": 1,
  "Eletrodinâmica > Corrente": 1,
  "Ondas > Ondulatória": 1,
  "Transformações Químicas > Estequiometria": 1,
  "Equilíbrio Químico > Equilíbrio": 1,
  "Eletroquímica > Corrente e pilhas": 1,
  "Ácido-Base > pH e soluções": 1,
  "Genética e Evolução > Hereditariedade": 1,
  "Gramática > Regência": 1,
};

export const PADROES_CONTEXTUAIS_PADRAO = [
  "considere", "de acordo com", "a tabela", "o texto", "o gráfico", "o quadro",
  "o trecho", "o caso", "a cena", "segundo o", "conforme o", "observando",
  "analise", "no fragmento", "na notícia",
];

export const CONFIG_PADRAO: ConfigDificuldade = {
  versao: 1,
  rotulo: "Padrão (gerador BNCC)",
  base: { pontos: 3, min: 1, max: 5 },
  faixas: { facilAte: 2, mediaAte: 3 },
  normalizacao: { minPalavra: 3 },
  regras: {
    enunciado: {
      ativo: true,
      curto: { limiar: 80, delta: -1 },
      longo: { limiar: 250, delta: 1 },
      muitoLongo: { limiar: 450, delta: 2 },
    },
    apoio: { ativo: true, limiar: 40, delta: 1 },
    contextual: {
      ativo: true,
      delta: 1,
      padroes: [...PADROES_CONTEXTUAIS_PADRAO],
      complemento: { minChars: 200, padroes: ["\\bque\\b", "\\bjá que\\b", "\\bpois\\b"] },
    },
    obvia: { ativo: true, minAlts: 3, fator: 2.5, minMaior: 60, maxSegunda: 90, delta: -2 },
    elaboradas: { ativo: true, minChars: 55, minQtd: 2, delta: 1 },
    parecidas: { ativo: true, minQtd: 3, limiarForte: 0.35, deltaForte: 2, limiarFraco: 0.2, deltaFraco: 1 },
    alternativas: {
      ativo: true,
      seis: { min: 6, delta: 1 },
      duas: { max: 2, delta: -1 },
    },
    interdisciplinar: { ativo: true, minAcertosChave: 2, minAreas: 2, delta: 1 },
    multiplasCorretas: { ativo: true, delta: 1 },
    pesoTema: { ativo: true, delta: 1 },
  },
  areas: JSON.parse(JSON.stringify(AREAS_PADRAO)),
  pesoTemas: { ...PESOS_TEMA_PADRAO },
};

/* ------------------------------------------------------------------ */
/* Fusão e saneamento                                                  */
/* ------------------------------------------------------------------ */

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Funde um patch sobre uma base (primitivos e arrays substituem; objetos recursem). Nunca muta a base. */
export function mesclarConfig(base: ConfigDificuldade, patch: unknown): ConfigDificuldade {
  const fundir = (b: unknown, p: unknown): unknown => {
    if (!ehObjeto(b) || !ehObjeto(p)) return p === undefined ? b : p;
    const saida: Record<string, unknown> = { ...b };
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) continue;
      saida[k] = k in b ? fundir((b as Record<string, unknown>)[k], v) : v;
    }
    return saida;
  };
  return fundir(base, ehObjeto(patch) ? patch : {}) as ConfigDificuldade;
}

/**
 * Recebe qualquer JSON (de arquivo, perfil ou futuro), devolve uma config
 * completa e segura para usar. Inválidos viram o padrão + aviso.
 */
export function normalizarConfig(entrada: unknown): { config: ConfigDificuldade; avisos: string[] } {
  const avisos: string[] = [];
  if (!ehObjeto(entrada)) {
    if (entrada !== undefined && entrada !== null) avisos.push("Configuração não é um objeto — usando o padrão.");
    return { config: cloneConfig(CONFIG_PADRAO), avisos };
  }
  const entradaComo = entrada as Partial<ConfigDificuldade> & { versao?: unknown };
  if (typeof entradaComo.versao === "number" && entradaComo.versao > CONFIG_PADRAO.versao) {
    avisos.push(`Configuração de versão futura (${entradaComo.versao}); campos desconhecidos foram ignorados.`);
  }
  let config = mesclarConfig(CONFIG_PADRAO, entrada);

  // Coerção numérica/lógica seguindo a FORMA do padrão (qualquer lixo vira default).
  const numero = (v: unknown, pad: number): number => {
    if (v === null || v === undefined || typeof v === "boolean") return pad;
    if (typeof v === "string" && v.trim() === "") return pad;
    const n = Number(v);
    return Number.isFinite(n) ? n : pad;
  };
  const coerce = (alvo: unknown, ref: unknown): unknown => {
    if (typeof ref === "number") return numero(alvo, ref as number);
    if (typeof ref === "boolean") return typeof alvo === "boolean" ? alvo : ref;
    if (typeof ref === "string") return typeof alvo === "string" ? alvo : ref;
    if (Array.isArray(ref)) {
      if (!Array.isArray(alvo)) return [...ref];
      // listas de texto: só strings não vazias
      return alvo.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
    if (ehObjeto(ref)) {
      const o = ehObjeto(alvo) ? alvo : {};
      const saida: Record<string, unknown> = {};
      for (const k of Object.keys(ref)) saida[k] = coerce(o[k], (ref as Record<string, unknown>)[k]);
      // preserva chaves extras (áreas/pesos novos adicionados pelo usuário)
      for (const [k, v] of Object.entries(o)) if (!(k in saida)) saida[k] = v;
      return saida;
    }
    return alvo === undefined ? ref : alvo;
  };
  config = coerce(config, CONFIG_PADRAO) as ConfigDificuldade;
  config.rotulo = typeof entrada.rotulo === "string" && entrada.rotulo.trim() ? entrada.rotulo.trim() : config.rotulo;

  // Áreas: chaves não vazias e listas de termos string.
  const areas: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(config.areas || {})) {
    if (!k.trim()) continue;
    areas[k.trim()] = Array.isArray(v) ? v.filter((t) => typeof t === "string" && t.length > 0) : [];
  }
  config.areas = areas;

  // Pesos de tema: número finito (ignora "comentario" e NaN).
  const pesos: Record<string, number> = {};
  for (const [k, v] of Object.entries(config.pesoTemas || {})) {
    const n = Number(v);
    if (k.trim() && Number.isFinite(n)) pesos[k.trim()] = n;
  }
  config.pesoTemas = pesos;

  // Padrões regex precisam compilar; inválidos saem com aviso.
  const testarPadroes = (lista: string[], onde: string): string[] => {
    const boas: string[] = [];
    for (const p of lista) {
      try {
        new RegExp(p);
        boas.push(p);
      } catch {
        avisos.push(`Padrão inválido em ${onde} ignorado: "${p}"`);
      }
    }
    return boas;
  };
  config.regras.contextual.padroes = testarPadroes(config.regras.contextual.padroes, "contextual");
  config.regras.contextual.complemento.padroes = testarPadroes(
    config.regras.contextual.complemento.padroes,
    "contextual/complemento",
  );
  if (config.regras.contextual.padroes.length === 0 && config.regras.contextual.ativo) {
    avisos.push("Regra contextual sem padrões — fica sem efeito até você preencher.");
  }

  // Faixas coerentes.
  const f = config.faixas;
  if (f.facilAte > f.mediaAte) {
    avisos.push("Faixas invertidas (fácil > média) — corrigidas automaticamente.");
    const t = f.facilAte;
    f.facilAte = f.mediaAte;
    f.mediaAte = t;
  }
  config.base.min = Math.min(config.base.min, config.base.max);
  config.base.max = Math.max(config.base.min, config.base.max);

  return { config, avisos };
}

export function cloneConfig(c: ConfigDificuldade): ConfigDificuldade {
  return JSON.parse(JSON.stringify(c)) as ConfigDificuldade;
}

/* ------------------------------------------------------------------ */
/* Perfis embutidos                                                    */
/* ------------------------------------------------------------------ */

function perfil(id: string, nome: string, descricao: string, patch: unknown): PerfilDificuldade {
  return { id, nome, descricao, config: mesclarConfig(CONFIG_PADRAO, patch) };
}

export const PERFIS_EMBUTIDOS: PerfilDificuldade[] = [
  perfil("padrao", "Padrão (gerador BNCC)", "A heurística original, igual à usada na geração das questões.", {}),
  perfil("sensivel", "Sensível", "Amplifica os sinais semânticos (contexto, apoio, interdisciplinaridade, alternativas parecidas) para separar questões limítrofes.", {
    regras: {
      apoio: { delta: 2 },
      contextual: { delta: 2 },
      interdisciplinar: { delta: 2 },
      parecidas: { deltaForte: 3, deltaFraco: 2 },
    },
  }),
  perfil("estrutural", "Estrutural (rápido)", "Só sinais formais (comprimento, alternativas, apoio). Não analisa conteúdo nem áreas — útil para triagem inicial.", {
    regras: {
      contextual: { ativo: false },
      interdisciplinar: { ativo: false },
      parecidas: { ativo: false },
      pesoTema: { ativo: false },
    },
  }),
  perfil("vestibular", "Vestibular (rigoroso)", "Ênfase máxima em complexidade: enunciado longo, contexto e interdisciplinaridade pesam bem mais.", {
    regras: {
      enunciado: { muitoLongo: { delta: 3 }, longo: { delta: 2 } },
      contextual: { delta: 2 },
      interdisciplinar: { delta: 2 },
      obvia: { delta: -1 },
    },
  }),
];

/* ------------------------------------------------------------------ */
/* Peso de tema (port do pesoTemaDe do gerador)                        */
/* ------------------------------------------------------------------ */

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Peso-base do conteúdo: "Assunto > Tema" direto ou com acentos/caixa normalizados. */
export function pesoTemaDe(config: ConfigDificuldade, assunto?: string, tema?: string): { peso: number; rotulo: string } {
  if (!assunto || !tema) return { peso: 0, rotulo: "" };
  const chave = `${assunto} > ${tema}`;
  const tabela = config.pesoTemas || {};
  const direto = Number(tabela[chave]);
  if (Number.isFinite(direto) && direto !== 0) return { peso: direto, rotulo: chave };
  const alvo = semAcento(chave).toLowerCase();
  for (const [k, v] of Object.entries(tabela)) {
    if (k === "comentario") continue;
    if (semAcento(k).toLowerCase() === alvo) return { peso: Number(v) || 0, rotulo: k };
  }
  return { peso: 0, rotulo: "" };
}
