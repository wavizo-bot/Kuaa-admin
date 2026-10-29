import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, PERFIS_EMBUTIDOS, cloneConfig, mesclarConfig, normalizarConfig, pesoTemaDe } from "./config";
import { avaliarQuestao, jaccard, palavras } from "./motor";
import type { ConfigDificuldade, QuestaoDificuldade } from "./tipos";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL = path.resolve(aqui, "../../../scripts/avaliar-dificuldade.js");

/* ------------------------------------------------------------------ */
/* Amostra fixa (a "amostra de testes" do motor)                        */
/* ------------------------------------------------------------------ */

function q(text: string, extra: Partial<QuestaoDificuldade> = {}): QuestaoDificuldade {
  return {
    text,
    alternatives: [
      { id: "A01", text: "Resposta alternativa um pouco maior aqui para efeito de teste" },
      { id: "A02", text: "outra alternativa" },
      { id: "A03", text: "terceira alternativa" },
      { id: "A04", text: "quarta alternativa" },
    ],
    ...extra,
  };
}

const AMOSTRA: QuestaoDificuldade[] = [
  // 1) direta e curta
  q("Qual é o resultado de 2 + 2?"),
  // 2) padrão resposta óbvia (uma completa, demais vagas)
  q("Sobre fotossíntese, assinale a alternativa correta.", {
    alternatives: [
      { id: "A01", text: "A fotossíntese é o processo pelo qual plantas convertem energia luminosa em energia química, produzindo glicose e liberando oxigênio como subproduto" },
      { id: "A02", text: "sim" },
      { id: "A03", text: "não" },
      { id: "A04", text: "talvez" },
    ],
  }),
  // 3) contextualizada por padrão textual
  q("Considere o trecho a seguir sobre a Independência do Brasil e responda: quem proclamou a independência?"),
  // 4) enunciado longo e muito longo
  q("x".repeat(300)),
  q("y".repeat(500)),
  // 5) texto de apoio
  q("Pergunta sobre corrente elétrica no circuito descrito abaixo.", { baseText: "O circuito possui resistores em série e paralelo com tensão de 12 volts." }),
  // 6) seis alternativas
  q("Questão com muitas alternativas de teste.", {
    alternatives: [
      { id: "A01", text: "opção um" },
      { id: "A02", text: "opção dois" },
      { id: "A03", text: "opção três" },
      { id: "A04", text: "opção quatro" },
      { id: "A05", text: "opção cinco" },
      { id: "A06", text: "opção seis" },
    ],
  }),
  // 7) duas alternativas
  q("Verdadeiro ou falso: a célula é a unidade básica da vida?", {
    alternatives: [
      { id: "A01", text: "Verdadeiro" },
      { id: "A02", text: "Falso" },
    ],
  }),
  // 8) interdisciplinar (biologia + meio ambiente, 2+ termos por área)
  q("A cadeia trófica do ecossistema amazônico envolve organismos e espécies da floresta e afeta o meio ambiente e a biodiversidade regional.", {
    alternatives: [
      { id: "A01", text: "alternativa razonável e razoavelmente desenvolvida" },
      { id: "A02", text: "alternativa razonável e razoavelmente desenvolvida" },
      { id: "A03", text: "alternativa razonável e razoavelmente desenvolvida" },
    ],
  }),
  // 9) três alternativas elaboradas e parecidas entre si
  q("Analise as proposições sobre equação de segundo grau e assinale.", {
    alternatives: [
      { id: "A01", text: "Toda equação do segundo grau possui exatamente duas raízes reais distintas" },
      { id: "A02", text: "Toda equação do segundo grau apresenta exatamente duas raízes reais diferentes" },
      { id: "A03", text: "Toda equação do segundo grau contém exatamente duas raízes reais distintas" },
      { id: "A04", text: "sim" },
    ],
  }),
  // 10) múltiplas corretas (flags do formato de geração)
  q("Assinale todas as alternativas corretas sobre função de primeiro grau.", {
    alternatives: [
      { id: "A01", text: "Seu gráfico é uma reta", correta: true },
      { id: "A02", text: "possui coeficiente angular constante em qualquer trecho", correta: true },
      { id: "A03", text: "nada a ver" },
      { id: "A04", text: "tampouco" },
    ],
  }),
  // 11) tema com peso (Álgebra > Funções)
  q("Qual o domínio da função quadrática representada?", { assunto: "Álgebra", tema: "Funções" }),
  // 12) questão vazia (entrada suja)
  q(""),
];

/* ------------------------------------------------------------------ */
/* Paridade com a heurística original                                   */
/* ------------------------------------------------------------------ */

const temOriginal = existsSync(ORIGINAL);

describe.skipIf(!temOriginal)("paridade com avaliar-dificuldade.js (oráculo)", () => {
  const req = createRequire(import.meta.url);
  const original = (req(ORIGINAL) as { avaliarQuestao: (qq: QuestaoDificuldade, opts: Record<string, unknown>) => {
    nivel: number;
    pontos: number;
    dificuldade: string;
    justificativa: string;
  } }).avaliarQuestao;

  it("reproduz nivel/pontos/dificuldade/justificativa de 12 casos no padrão", () => {
    for (const [i, questao] of AMOSTRA.entries()) {
      const { assunto, tema } = { assunto: questao.assunto, tema: questao.tema };
      const peso = pesoTemaDe(CONFIG_PADRAO, assunto, tema);
      const esperado = original(questao, { pesoTema: peso.peso, pesoTemaLabel: peso.rotulo });
      const obtido = avaliarQuestao(questao, CONFIG_PADRAO);
      expect(
        { i, ...obtido },
        `caso ${i + 1}`,
      ).toMatchObject({
        nivel: esperado.nivel,
        pontos: esperado.pontos,
        dificuldade: esperado.dificuldade,
        justificativa: esperado.justificativa,
      });
    }
  });

  it("reproduz o comportamento com semInterdisciplinar ligado", () => {
    const questao = AMOSTRA[7];
    const esperado = original(questao, { pesoTema: 0, semInterdisciplinar: true });
    const cfg = mesclarConfig(CONFIG_PADRAO, { regras: { interdisciplinar: { ativo: false } } });
    const obtido = avaliarQuestao(questao, cfg);
    expect(obtido.nivel).toBe(esperado.nivel);
    expect(obtido.pontos).toBe(esperado.pontos);
    expect(obtido.justificativa).toBe(esperado.justificativa);
  });
});

/* ------------------------------------------------------------------ */
/* Regras isoladas                                                      */
/* ------------------------------------------------------------------ */

describe("motor", () => {
  it("escada do enunciado: curto -1, longo +1, muito longo +2", () => {
    const base4 = (text: string): QuestaoDificuldade => ({
      text,
      alternatives: [
        { text: "um" },
        { text: "dois" },
        { text: "três" },
        { text: "quatro" },
      ],
    });
    const curta = avaliarQuestao(base4("Curta?"), CONFIG_PADRAO);
    const normal = avaliarQuestao(base4("x".repeat(150)), CONFIG_PADRAO);
    const longa = avaliarQuestao(base4("x".repeat(300)), CONFIG_PADRAO);
    const gigante = avaliarQuestao(base4("x".repeat(500)), CONFIG_PADRAO);
    expect([curta.pontos, normal.pontos, longa.pontos, gigante.pontos]).toEqual([2, 3, 4, 5]);
    expect(curta.contribuicoes.some((c) => c.codigo === "enunciadoCurto")).toBe(true);
    expect(longa.contribuicoes.some((c) => c.codigo === "enunciadoLongo")).toBe(true);
    expect(gigante.contribuicoes.some((c) => c.codigo === "enunciadoMuitoLongo")).toBe(true);
  });

  const com4 = (text: string, extra: Partial<QuestaoDificuldade> = {}): QuestaoDificuldade => ({
    text,
    alternatives: [{ text: "um" }, { text: "dois" }, { text: "três" }, { text: "quatro" }],
    ...extra,
  });

  it("recorta o nível nos limites configurados", () => {
    const muita = avaliarQuestao(com4("y".repeat(600), { baseText: "z".repeat(80) }), CONFIG_PADRAO);
    expect(muita.pontos).toBeGreaterThan(5);
    expect(muita.nivel).toBe(5);
    const cfg = mesclarConfig(CONFIG_PADRAO, { base: { min: 2, max: 4 } });
    expect(avaliarQuestao(com4("Curta?"), cfg).nivel).toBe(2);
    expect(avaliarQuestao(com4("y".repeat(600), { baseText: "z".repeat(80) }), cfg).nivel).toBe(4);
  });

  it("faixas configuráveis mudam a classificação de fácil/média/difícil", () => {
    const cfg = mesclarConfig(CONFIG_PADRAO, { faixas: { facilAte: 3, mediaAte: 4 } });
    const mediaAntes = avaliarQuestao(com4("x".repeat(300)), CONFIG_PADRAO);
    expect(mediaAntes.pontos).toBe(4);
    expect(mediaAntes.dificuldade).toBe("dificil");
    expect(avaliarQuestao(com4("x".repeat(300)), cfg).dificuldade).toBe("media");
  });

  it("regra desativada não contribui", () => {
    const cfg = mesclarConfig(CONFIG_PADRAO, { regras: { apoio: { ativo: false } } });
    const comApoio = avaliarQuestao({ text: "x".repeat(150), baseText: "y".repeat(60) }, CONFIG_PADRAO);
    const sem = avaliarQuestao({ text: "x".repeat(150), baseText: "y".repeat(60) }, cfg);
    expect(comApoio.contribuicoes.some((c) => c.codigo === "apoio")).toBe(true);
    expect(sem.contribuicoes.some((c) => c.codigo === "apoio")).toBe(false);
    expect(sem.pontos).toBe(comApoio.pontos - 1);
  });

  it("padrões contextualizados customizados funcionam como regex", () => {
    const cfg = mesclarConfig(CONFIG_PADRAO, {
      regras: { contextual: { padroes: ["texto base:", "enunciado abaixo"] } },
    });
    const r = avaliarQuestao({ text: "TEXTO BASE: analise o item" }, cfg);
    expect(r.contribuicoes.some((c) => c.codigo === "contextual")).toBe(true);
    // padrão padrão ("considere") saiu da lista e não vale mais
    expect(avaliarQuestao({ text: "Considere o caso" }, cfg).contribuicoes.some((c) => c.codigo === "contextual")).toBe(false);
  });

  it("complemento contextual só vale em enunciados longos", () => {
    const curto = avaliarQuestao({ text: "A vaca que pastava" }, CONFIG_PADRAO);
    const longo = avaliarQuestao({ text: `A vaca que pastava ${"em campo ".repeat(30)}` }, CONFIG_PADRAO);
    expect(curto.contribuicoes.some((c) => c.codigo === "contextual")).toBe(false);
    expect(longo.contribuicoes.some((c) => c.codigo === "contextual")).toBe(true);
  });

  it("peso de tema: chave direta e normalizada", () => {
    expect(pesoTemaDe(CONFIG_PADRAO, "Álgebra", "Funções").peso).toBe(1);
    expect(pesoTemaDe(CONFIG_PADRAO, "algebra", "funcoes").peso).toBe(1);
    expect(pesoTemaDe(CONFIG_PADRAO, "História", "Guerras").peso).toBe(0);
    const r = avaliarQuestao(q("Qual o domínio?", { assunto: "Álgebra", tema: "Funções" }), CONFIG_PADRAO);
    expect(r.contribuicoes.some((c) => c.codigo === "pesoTema")).toBe(true);
    expect(r.justificativa).toContain("Álgebra > Funções");
  });

  it("identifica as corretas por flag (geração) e por campo correct (KuaaRepo)", () => {
    const comFlag = q("x", {
      alternatives: [
        { id: "A01", text: "aaa", correta: true },
        { id: "A02", text: "bbb", correta: true },
        { id: "A03", text: "ccc" },
      ],
    });
    expect(avaliarQuestao(comFlag, CONFIG_PADRAO).contribuicoes.some((c) => c.codigo === "multiplasCorretas")).toBe(true);
    const repo = q("x", { correct: "A01" });
    expect(avaliarQuestao(repo, CONFIG_PADRAO).contribuicoes.some((c) => c.codigo === "multiplasCorretas")).toBe(false);
  });

  it("aceita enunciado em português (enunciado/alternativas) e formato do repo", () => {
    const r = avaliarQuestao(
      {
        enunciado: "x".repeat(300),
        alternativas: [{ texto: "a" }, { texto: "b" }, { texto: "c" }],
        correct: "A01",
      },
      CONFIG_PADRAO,
    );
    expect(r.nivel).toBeGreaterThan(3);
    expect(r.contribuicoes.some((c) => c.codigo === "enunciadoLongo")).toBe(true);
    expect(avaliarQuestao({ enunciado: "y".repeat(300), alternativas: [{ texto: "a" }, { texto: "b" }] }, CONFIG_PADRAO).contribuicoes.some((c) => c.codigo === "duasAlternativas")).toBe(true);
  });

  it("jaccard e palavras normalizam acento/caixa e respeitam o tamanho mínimo", () => {
    expect(palavras("AÇÃO funções Árvore", 3)).toEqual(["acao", "funcoes", "arvore"]);
    expect(jaccard(["a", "b", "c"], ["a", "b", "d"])).toBeCloseTo(2 / 4);
    expect(jaccard([], ["a"])).toBe(0);
  });

  it("justificativa vazio cai no texto padrão da faixa", () => {
    // enunciado neutro + 3 alternativas curtas neutras → nenhuma regra dispara
    const r = avaliarQuestao(
      {
        text: "x".repeat(150),
        alternatives: [{ text: "resposta um" }, { text: "resposta dois" }, { text: "resposta três" }],
      },
      CONFIG_PADRAO,
    );
    expect(r.contribuicoes).toHaveLength(0);
    expect(r.justificativa).toBe("perfil intermediário");
  });
});

/* ------------------------------------------------------------------ */
/* Configuração                                                         */
/* ------------------------------------------------------------------ */

describe("configuração", () => {
  it("mesclarConfig não muta o padrão e substitui primitivos/arrays", () => {
    const antes = JSON.stringify(CONFIG_PADRAO);
    const cfg = mesclarConfig(CONFIG_PADRAO, { base: { pontos: 5 }, regras: { contextual: { padroes: ["x"] } } });
    expect(JSON.stringify(CONFIG_PADRAO)).toBe(antes);
    expect(cfg.base.pontos).toBe(5);
    expect(cfg.base.min).toBe(1);
    expect(cfg.regras.contextual.padroes).toEqual(["x"]);
    expect(cfg.regras.contextual.delta).toBe(1);
  });

  it("normalizarConfig saneia lixo: números-texto, regex inválida, faixas invertidas", () => {
    const { config, avisos } = normalizarConfig({
      versao: 99,
      base: { pontos: "7", min: null },
      faixas: { facilAte: 4, mediaAte: 2 },
      regras: { contextual: { padroes: ["ok", "([unclosed"], complemento: { padroes: null } } },
      pesoTemas: { "A > B": "2", comentario: "texto", "": 1 },
    });
    expect(config.base.pontos).toBe(7);
    expect(config.base.min).toBe(1);
    expect([config.faixas.facilAte, config.faixas.mediaAte]).toEqual([2, 4]);
    expect(config.regras.contextual.padroes).toEqual(["ok"]);
    expect(config.regras.contextual.complemento.padroes).toEqual(["\\bque\\b", "\\bjá que\\b", "\\bpois\\b"]);
    // pesos: chave nova entra, lixo sai, padrões do gerador continuam (fusão)
    expect(config.pesoTemas["A > B"]).toBe(2);
    expect(config.pesoTemas.comentario).toBeUndefined();
    expect(config.pesoTemas[""]).toBeUndefined();
    expect(config.pesoTemas["Álgebra > Funções"]).toBe(1);
    expect(avisos.some((a) => a.includes("versão futura"))).toBe(true);
    expect(avisos.some((a) => a.includes("inválido"))).toBe(true);
    expect(avisos.some((a) => a.includes("invertidas"))).toBe(true);
  });

  it("normalizarConfig com entrada vazia devolve o padrão completo", () => {
    const { config } = normalizarConfig(undefined);
    expect(config).toEqual(CONFIG_PADRAO);
    expect(normalizarConfig("string lixo").config).toEqual(CONFIG_PADRAO);
  });

  it("perfis embutidos são válidos e diferem do padrão", () => {
    for (const p of PERFIS_EMBUTIDOS) {
      const { config, avisos } = normalizarConfig(p.config);
      expect(avisos).toEqual([]);
      expect(config.rotulo).toBeTruthy();
    }
    const estrutural = PERFIS_EMBUTIDOS.find((p) => p.id === "estrutural")!;
    expect(estrutural.config.regras.contextual.ativo).toBe(false);
    const qteste = { text: "Considere o texto e responda com base no texto apresentado, analise com atenção." };
    expect(avaliarQuestao(qteste, PERFIS_EMBUTIDOS[0].config).contribuicoes.some((c) => c.codigo === "contextual")).toBe(true);
    expect(avaliarQuestao(qteste, estrutural.config).contribuicoes.some((c) => c.codigo === "contextual")).toBe(false);
  });

  it("cloneConfig isola completamente", () => {
    const c = cloneConfig(CONFIG_PADRAO);
    c.areas["Nova"] = ["x"];
    expect(CONFIG_PADRAO.areas["Nova"]).toBeUndefined();
  });

  it("o padrão continua com a forma esperada do esquema v1", () => {
    const cfg: ConfigDificuldade = CONFIG_PADRAO;
    expect(cfg.versao).toBe(1);
    expect(Object.keys(cfg.regras)).toEqual([
      "enunciado",
      "apoio",
      "contextual",
      "obvia",
      "elaboradas",
      "parecidas",
      "alternativas",
      "interdisciplinar",
      "multiplasCorretas",
      "pesoTema",
    ]);
  });
});
