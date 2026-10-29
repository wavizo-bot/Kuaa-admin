/** Tipos do motor de classificação de dificuldade (kuaa). */

export type FaixaDificuldade = "facil" | "media" | "dificil";
export type Nivel = 1 | 2 | 3 | 4 | 5;

/** Questão em qualquer formato aceito (KuaaRepo, geração por IA, importações legadas). */
export interface QuestaoDificuldade {
  text?: string;
  enunciado?: string;
  baseText?: string;
  texto_apoio?: string;
  alternatives?: AlternativaDificuldade[];
  alternativas?: AlternativaDificuldade[];
  correct?: string | number;
  assunto?: string;
  tema?: string;
  topico?: string;
  subject?: string;
  difficulty?: string;
  dificuldade?: string;
  dificuldade_nivel?: number;
  nivel?: number;
  [chave: string]: unknown;
}

export interface AlternativaDificuldade {
  text?: string;
  texto?: string;
  correta?: boolean | string;
  id?: string;
  [chave: string]: unknown;
}

/** Uma regra do motor e quanto ela contribuiu (positivo = mais difícil). */
export interface ContribuicaoRegra {
  codigo: string;
  rotulo: string;
  delta: number;
  detalhe?: string;
}

export interface ResultadoAvaliacao {
  /** Nível final 1-5 (pontos já recortados nos limites). */
  nivel: number;
  /** Pontuação bruta antes do recorte. */
  pontos: number;
  dificuldade: FaixaDificuldade;
  justificativa: string;
  contribuicoes: ContribuicaoRegra[];
}

/* ------------------------------------------------------------------ */
/* Configuração — TODOS os números da heurística viram parâmetros.     */
/* ------------------------------------------------------------------ */

export interface ConfigDificuldade {
  /** Versão do esquema (para importar configurações antigas no futuro). */
  versao: number;
  /** Nome do perfil em uso (ex.: "Padrão (gerador BNCC)"). */
  rotulo: string;
  /** Pontuação inicial e recorte final do nível. */
  base: { pontos: number; min: number; max: number };
  /** Faixas do nível 1-5 nas três categorias do app: nivel <= facilAte → fácil; <= mediaAte → média; senão difícil. */
  faixas: { facilAte: number; mediaAte: number };
  /** Palavras com mais de N letras entram na comparação de similaridade. */
  normalizacao: { minPalavra: number };
  regras: {
    enunciado: {
      ativo: boolean;
      curto: { limiar: number; delta: number };
      longo: { limiar: number; delta: number };
      muitoLongo: { limiar: number; delta: number };
    };
    apoio: { ativo: boolean; limiar: number; delta: number };
    contextual: {
      ativo: boolean;
      delta: number;
      /** Trechos literais ou trechos de regex; unidos com "|". */
      padroes: string[];
      /** Segunda checagem: só vale para enunciados longos. */
      complemento: { minChars: number; padroes: string[] };
    };
    obvia: {
      ativo: boolean;
      minAlts: number;
      fator: number;
      minMaior: number;
      maxSegunda: number;
      delta: number;
    };
    elaboradas: { ativo: boolean; minChars: number; minQtd: number; delta: number };
    parecidas: {
      ativo: boolean;
      minQtd: number;
      limiarForte: number;
      deltaForte: number;
      limiarFraco: number;
      deltaFraco: number;
    };
    alternativas: {
      ativo: boolean;
      seis: { min: number; delta: number };
      duas: { max: number; delta: number };
    };
    interdisciplinar: { ativo: boolean; minAcertosChave: number; minAreas: number; delta: number };
    multiplasCorretas: { ativo: boolean; delta: number };
    pesoTema: { ativo: boolean; delta: number };
  };
  /** Chaves de conteúdo por área (interdisciplinaridade): área → termos. */
  areas: Record<string, string[]>;
  /** Peso-base por conteúdo: "Assunto > Tema" → número (>0 soma pontos). */
  pesoTemas: Record<string, number>;
}

/** Perfil pronto para aplicar (presets embutidos ou salvos pelo usuário). */
export interface PerfilDificuldade {
  id: string;
  nome: string;
  descricao: string;
  config: ConfigDificuldade;
}

/* ------------------------------------------------------------------ */
/* Lotes (processamento em massa)                                      */
/* ------------------------------------------------------------------ */

export interface ItemLote {
  chave: string;
  arquivo: string;
  prova: string;
  /** Sequência da questão no arquivo (estável para exportação). */
  indice: number;
  /** Onde a questão vive no documento: envolvida em exams, lista raiz ou wrapper com questions. */
  local: "exams" | "raiz" | "questions";
  examIdx: number;
  questIdx: number;
  questao: QuestaoDificuldade;
}

export interface AvaliacaoItem {
  item: ItemLote;
  resultado: ResultadoAvaliacao;
  nivelAnterior: number | null;
  faixaAnterior: FaixaDificuldade | null;
  mudouFaixa: boolean;
}

export interface CargaLote {
  itens: ItemLote[];
  /** Documentos JSON originais por nome de arquivo (base da exportação). */
  docs: Map<string, unknown>;
  arquivos: { nome: string; provas: number; questoes: number }[];
  erros: { nome: string; erro: string }[];
}

/** Rótulo de nível dado por um humano — a "amostra de testes" do motor. */
export interface RotuloHumano {
  chave: string;
  enunciado: string;
  /** Snapshot completo: permite reavaliar com QUALQUER configuração futura. */
  questao: QuestaoDificuldade;
  nivelHumano: number;
  quando: string;
}

export interface MetricasValidacao {
  n: number;
  exato: number;
  dentroDeUm: number;
  mae: number;
  /** confusao[humano-1][maquina-1] */
  confusao: number[][];
  mediaHumano: number;
  mediaMaquina: number;
}
