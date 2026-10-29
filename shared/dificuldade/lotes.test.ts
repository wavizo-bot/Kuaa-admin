import { describe, expect, it } from "vitest";
import { CONFIG_PADRAO, mesclarConfig } from "./config";
import {
  avaliarItens,
  calcularMetricas,
  carregarJsons,
  chaveQuestao,
  estatisticas,
  exportarCsv,
  exportarJson,
  faixaDeRotulo,
  sortearAmostra,
} from "./lotes";
import type { RotuloHumano } from "./tipos";

const P1 = {
  id: "p1",
  title: "Prova 1",
  questions: [
    { text: "Pergunta um com enunciado suficientemente longo para passar no validador", alternatives: [{ id: "A01", text: "a" }, { id: "A02", text: "b" }] },
    { text: "Pergunta dois com enunciado suficientemente longo para passar no validador", alternatives: [{ id: "A01", text: "a" }, { id: "A02", text: "b" }] },
  ],
};
const P2 = {
  id: "p2",
  title: "Prova 2",
  questions: [
    { text: "Pergunta três com enunciado suficientemente longo para passar no validador", alternatives: [{ id: "A01", text: "a" }, { id: "A02", text: "b" }] },
  ],
};
const PACOTE = { format: "kuaa-repo/pacote@1", folder: "5-ano/fundamental", exams: [P1, P2] };

function carregar(docs: Record<string, unknown>) {
  return carregarJsons(
    Object.entries(docs).map(([nome, doc]) => ({ nome, conteudo: JSON.stringify(doc) })),
  );
}

describe("carregarJsons", () => {
  it("lê pacote com exams e preserva posição das questões", () => {
    const carga = carregar({ "pacote.json": PACOTE });
    expect(carga.erros).toEqual([]);
    expect(carga.itens).toHaveLength(3);
    expect(carga.arquivos).toEqual([{ nome: "pacote.json", provas: 2, questoes: 3 }]);
    expect(carga.itens[0].local).toBe("exams");
    expect(carga.itens[0].examIdx).toBe(0);
    expect(carga.itens[0].questIdx).toBe(0);
    expect(carga.itens[2].prova).toBe("Prova 2");
  });

  it("lê array de provas, array de questões, objeto único e BOM", () => {
    const emArray = carregar({ "a.json": [P1, P2] });
    expect(emArray.itens).toHaveLength(3);
    expect(emArray.itens[0].local).toBe("raiz");
    expect(emArray.itens[0].examIdx).toBe(0);

    const lista = carregar({ "b.json": P1.questions });
    expect(lista.itens).toHaveLength(2);
    expect(lista.itens[0].local).toBe("raiz");
    expect(lista.itens[0].examIdx).toBe(-1);

    const solta = carregar({ "c.json": P1.questions[0] });
    expect(solta.itens).toHaveLength(1);
    expect(solta.itens[0].prova).toBe("Questão avulsa");

    const comBom = carregarJsons([{ nome: "d.json", conteudo: `\uFEFF${JSON.stringify(PACOTE)}` }]);
    expect(comBom.itens).toHaveLength(3);
  });

  it("lê wrapper com questions no topo", () => {
    const carga = carregar({ "u.json": { title: "Banco", questions: P1.questions } });
    expect(carga.itens).toHaveLength(2);
    expect(carga.itens[0].local).toBe("questions");
    expect(carga.itens[0].prova).toBe("Banco");
  });

  it("reporta erros sem derrubar os demais arquivos", () => {
    const carga = carregarJsons([
      { nome: "ruim.json", conteudo: "{não é json" },
      { nome: "outro.json", conteudo: JSON.stringify({ qualquer: true }) },
      { nome: "bom.json", conteudo: JSON.stringify(PACOTE) },
    ]);
    expect(carga.itens).toHaveLength(3);
    expect(carga.erros).toHaveLength(2);
    expect(carga.erros[0].erro).toContain("JSON inválido");
    expect(carga.erros[1].erro).toContain("formato não reconhecido");
  });

  it("chaves são únicas e estáveis", () => {
    const carga = carregar({ "pacote.json": PACOTE });
    const chaves = carga.itens.map((i) => i.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves).toEqual(carga.itens.map((i) => i.chave));
  });
});

describe("avaliação + estatísticas", () => {
  it("avaliarItens compara com o nível gravado na questão", () => {
    const carga = carregar({ "pacote.json": PACOTE });
    const comAnterior = carga;
    comAnterior.itens[0].questao.dificuldade = "facil";
    comAnterior.itens[1].questao.dificuldade = "dificil";
    const avaliados = avaliarItens(comAnterior.itens, CONFIG_PADRAO);
    expect(avaliados[0].faixaAnterior).toBe("facil");
    expect(avaliados[0].mudouFaixa).toBe(avaliados[0].resultado.dificuldade !== "facil");
    const stats = estatisticas(avaliados);
    expect(stats.total).toBe(3);
    expect(stats.porNivel.reduce((a, b) => a + b, 0)).toBe(3);
    expect(stats.porArquivo["pacote.json"].total).toBe(3);
    expect(stats.semAnterior).toBe(1);
  });

  it("faixaDeRotulo entende variantes com e sem acento", () => {
    expect(faixaDeRotulo("Fácil")).toBe("facil");
    expect(faixaDeRotulo("media")).toBe("media");
    expect(faixaDeRotulo("Difícil")).toBe("dificil");
    expect(faixaDeRotulo("normal")).toBeNull();
    expect(faixaDeRotulo(undefined)).toBeNull();
  });
});

describe("exportação", () => {
  it("exportarJson grava os campos na posição certa e preserva o formato do topo", () => {
    const carga = carregar({ "pacote.json": PACOTE });
    const avaliados = avaliarItens(carga.itens, CONFIG_PADRAO);
    const saidas = exportarJson(carga, avaliados);
    expect(saidas).toHaveLength(1);
    const doc = JSON.parse(saidas[0].conteudo) as typeof PACOTE;
    expect(doc.format).toBe("kuaa-repo/pacote@1");
    expect(doc.folder).toBe("5-ano/fundamental");
    for (const prova of doc.exams) {
      for (const qq of prova.questions) {
        expect(qq).toHaveProperty("dificuldade_nivel");
        expect(qq).toHaveProperty("difficulty");
        expect(qq).toHaveProperty("dificuldade_pontos");
        expect(qq).toHaveProperty("dificuldade_justificativa");
      }
    }
    // original intacto
    expect(PACOTE.exams[0].questions[0]).not.toHaveProperty("dificuldade_nivel");
    // a posição é a mesma (enunciado bate)
    expect(doc.exams[0].questions[0].text).toBe(P1.questions[0].text);
    expect(doc.exams[1].questions[0].text).toBe(P2.questions[0].text);
  });

  it("exportarJson funciona com array raiz de provas e lista simples", () => {
    const emArray = carregar({ "a.json": [P1, P2] });
    const doc1 = JSON.parse(exportarJson(emArray, avaliarItens(emArray.itens, CONFIG_PADRAO))[0].conteudo) as (typeof P1)[];
    expect(doc1[1].questions[0]).toHaveProperty("difficulty");

    const lista = carregar({ "b.json": P1.questions });
    const doc2 = JSON.parse(exportarJson(lista, avaliarItens(lista.itens, CONFIG_PADRAO))[0].conteudo) as { difficulty: string }[];
    expect(doc2[1]).toHaveProperty("difficulty");
    expect(doc2).toHaveLength(2);
  });

  it("exportarCsv tem BOM, cabeçalho e uma linha por questão", () => {
    const carga = carregar({ "pacote.json": PACOTE });
    const csv = exportarCsv(avaliarItens(carga.itens, CONFIG_PADRAO));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const linhas = csv.slice(1).split("\r\n");
    expect(linhas).toHaveLength(4);
    expect(linhas[0].startsWith("Arquivo;Prova")).toBe(true);
    expect(linhas[1].split(";")[0]).toBe('"pacote.json"');
  });
});

describe("amostragem e validação", () => {
  const carga = carregar({ "p.json": PACOTE });
  const avaliados = avaliarItens(carga.itens, CONFIG_PADRAO);

  it("sortearAmostra é reprodutível pela semente e respeita o limite por nível", () => {
    const a = sortearAmostra(avaliados, { porNivel: 2, seed: 42 });
    const b = sortearAmostra(avaliados, { porNivel: 2, seed: 42 });
    const c = sortearAmostra(avaliados, { porNivel: 2, seed: 43 });
    expect(a.map((x) => x.item.chave)).toEqual(b.map((x) => x.item.chave));
    expect(a.map((x) => x.item.chave)).not.toEqual(c.map((x) => x.item.chave));
    const porNivel = [0, 0, 0, 0, 0];
    for (const item of a) porNivel[item.resultado.nivel - 1] += 1;
    expect(Math.max(...porNivel)).toBeLessThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(10);
  });

  it("sortearAmostra com somenteMudou filtra pela troca de faixa", () => {
    const mutantes = avaliados.map((a, i) => ({ ...a, mudouFaixa: i % 2 === 0 }));
    const amostra = sortearAmostra(mutantes, { porNivel: 5, seed: 1, somenteMudou: true });
    expect(amostra.every((a) => a.mudouFaixa)).toBe(true);
  });

  it("chaveQuestao é estável com acento/caixa/espaços", () => {
    expect(chaveQuestao({ text: "A Função  Quadrática!" })).toBe(chaveQuestao({ enunciado: "a funcao quadratica" }));
    expect(chaveQuestao({ text: "outro enunciado" })).not.toBe(chaveQuestao({ text: "enunciado outro" }));
  });

  it("calcularMetricas confere com a conta à mão", () => {
    const cfg = CONFIG_PADRAO;
    // neutro (4 alternativas curtas): máquina devolve exatamente nível 3
    const base = {
      text: "x".repeat(150),
      alternatives: [{ text: "um" }, { text: "dois" }, { text: "três" }, { text: "quatro" }],
    };
    const r = (nivelHumano: number): RotuloHumano => ({
      chave: "k",
      enunciado: base.text,
      questao: { ...base },
      nivelHumano,
      quando: "2026-10-20T00:00:00.000Z",
    });
    // máquina dá nível 3 nessa questão (pontos 3, sem regras)
    const rotulos = [r(3), r(3), r(1), r(5)];
    const m = calcularMetricas(rotulos, cfg);
    expect(m.n).toBe(4);
    expect(m.exato).toBe(0.5);
    expect(m.dentroDeUm).toBe(0.5); // |1-3| e |5-3| passam de 1
    expect(m.mae).toBe((0 + 0 + 2 + 2) / 4);
    expect(m.mediaMaquina).toBe(3);
    expect(m.confusao[0][2]).toBe(1);
    expect(m.confusao[4][2]).toBe(1);
    expect(calcularMetricas([], cfg).exato).toBe(0);
  });

  it("métricas mudam com a configuração (loop de ajuste)", () => {
    const questao: QuestaoDificuldade = {
      text: "x".repeat(150),
      alternatives: [{ text: "um" }, { text: "dois" }, { text: "três" }, { text: "quatro" }],
    };
    const rotulos: RotuloHumano[] = [
      { chave: "k", enunciado: questao.text!, questao, nivelHumano: 4, quando: "" },
    ];
    const rigido = mesclarConfig(CONFIG_PADRAO, { base: { pontos: 4 } });
    expect(calcularMetricas(rotulos, CONFIG_PADRAO).exato).toBe(0);
    expect(calcularMetricas(rotulos, rigido).exato).toBe(1);
  });
});
