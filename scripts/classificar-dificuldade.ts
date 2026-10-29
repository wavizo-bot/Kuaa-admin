/**
 * kuaa — classificação de dificuldade em lote pelo terminal.
 * Usa o MESMO motor da ferramenta do admin (shared/dificuldade): mesmos parâmetros,
 * mesma saída, zero dependências extras (node + tsx).
 *
 * Uso:
 *   pnpm tsx scripts/classificar-dificuldade.ts <arquivo.json | pasta> [mais entradas...] [opções]
 *
 * Opções:
 *   --config <cfg.json>   configuração exportada pela UI (padrão: perfil padrão)
 *   --saida <pasta>       destino (padrão: ./classificado — espelha a estrutura da entrada)
 *   --csv                 grava também dificuldade.csv (abre no Excel)
 *   --sem-json            não grava os JSONs (só estatísticas/CSV)
 *   -h | --ajuda          mostra esta ajuda
 *
 * Sai com código 2 se algum arquivo falhar no parse (útil em automação).
 */
import fs from "node:fs";
import path from "node:path";
import {
  avaliarItens,
  carregarJsons,
  estatisticas,
  exportarCsv,
  exportarJson,
  normalizarConfig,
  type ConfigDificuldade,
} from "../shared/dificuldade/index";

const USO = `
kuaa-classificar-dificuldade — nível 1-5 em massa

  pnpm tsx scripts/classificar-dificuldade.ts <arquivo.json | pasta> [--config cfg.json] [--saida DIR] [--csv] [--sem-json]

Exemplos:
  pnpm tsx scripts/classificar-dificuldade.ts "C:/APPS/Kuaa/KuaaRepo" --csv
  pnpm tsx scripts/classificar-dificuldade.ts 9ano-em.json --config meu-perfil.json --saida ./fora
`;

function lerArgs(argv: string[]) {
  const entradas: string[] = [];
  const op = { config: "", saida: "./classificado", csv: false, json: true, ajuda: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "-h" || a === "--ajuda") op.ajuda = true;
    else if (a === "--csv") op.csv = true;
    else if (a === "--sem-json") op.json = false;
    else if (a === "--config") op.config = argv[++i] ?? "";
    else if (a === "--saida") op.saida = argv[++i] ?? op.saida;
    else if (a.startsWith("--")) {
      console.error(`Opção desconhecida: ${a}`);
      process.exit(1);
    } else entradas.push(a);
  }
  return { entradas, op };
}

function coletarJsons(alvo: string): string[] {
  const st = fs.statSync(alvo, { throwIfNoEntry: false });
  if (!st) {
    console.error(`Não existe: ${alvo}`);
    process.exit(1);
  }
  if (st.isFile()) return alvo.toLowerCase().endsWith(".json") ? [alvo] : [];
  const fora = new Set(["node_modules", ".git", "dist", "build", "_relatorio"]);
  const achados: string[] = [];
  for (const item of fs.readdirSync(alvo, { withFileTypes: true })) {
    if (fora.has(item.name)) continue;
    const cheio = path.join(alvo, item.name);
    if (item.isDirectory()) achados.push(...coletarJsons(cheio));
    else if (item.isFile() && item.name.toLowerCase().endsWith(".json")) achados.push(cheio);
  }
  return achados.sort();
}

function lerConfig(caminho: string): { config: ConfigDificuldade; avisos: string[] } {
  if (!caminho) return { config: normalizarConfig(undefined).config, avisos: [] };
  try {
    const dados: unknown = JSON.parse(fs.readFileSync(caminho, "utf8"));
    return normalizarConfig(dados);
  } catch (e) {
    console.error(`Configuração inválida (${caminho}): ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}

function barra(n: number, max: number, largura = 28): string {
  const q = max ? Math.round((n / max) * largura) : 0;
  return "█".repeat(q) + "·".repeat(Math.max(0, largura - q));
}

async function principal() {
  const { entradas, op } = lerArgs(process.argv.slice(2));
  if (op.ajuda || !entradas.length) {
    console.log(USO.trim());
    process.exit(op.ajuda ? 0 : 1);
  }

  const { config, avisos } = lerConfig(op.config);
  for (const a of avisos) console.warn(`aviso: ${a}`);
  console.log(`perfil: ${config.rotulo}`);

  // Nome interno do arquivo = relativo à pasta de entrada (a saída espelha);
  // colisões entre entradas ganham prefixo numérico para nunca sobrescrever dados.
  const textos: { nome: string; conteudo: string }[] = [];
  const usados = new Set<string>();
  const garantir = (nome: string): string => {
    if (!usados.has(nome)) {
      usados.add(nome);
      return nome;
    }
    let i = 2;
    while (usados.has(`${i}-${nome}`)) i += 1;
    const unico = `${i}-${nome}`;
    usados.add(unico);
    return unico;
  };
  for (const e of entradas) {
    const abs = path.resolve(e);
    const arquivos = coletarJsons(abs);
    const ehDir = fs.statSync(abs).isDirectory();
    for (const arquivo of arquivos) {
      const rel = ehDir ? path.relative(abs, arquivo) : path.basename(arquivo);
      const nome = garantir(rel.split(path.sep).join("/"));
      try {
        textos.push({ nome, conteudo: fs.readFileSync(arquivo, "utf8") });
      } catch (err) {
        console.error(`erro ao ler ${arquivo}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (!textos.length) {
    console.error("Nenhum .json encontrado nas entradas.");
    process.exit(1);
  }

  const carga = carregarJsons(textos);
  const avaliados = avaliarItens(carga.itens, config);
  const stats = estatisticas(avaliados);

  for (const e of carga.erros) console.warn(`ignorado: ${e.nome} — ${e.erro}`);
  console.log(`\n${stats.total} questão(ões) em ${carga.arquivos.length} arquivo(s) · ${carga.arquivos.reduce((s, a) => s + a.provas, 0)} provas`);
  console.log(`mudaram de faixa: ${stats.mudancas} · sem faixa anterior: ${stats.semAnterior}\n`);

  const max = Math.max(...stats.porNivel, 1);
  console.log("distribuição de níveis:");
  stats.porNivel.forEach((n, i) => {
    console.log(`  N${i + 1} ${String(n).padStart(6)} ${barra(n, max)} ${String(Math.round((n / (stats.total || 1)) * 100)).padStart(3)}%`);
  });
  console.log(`\nfaixas: ${stats.porFaixa.facil} fácil · ${stats.porFaixa.media} média · ${stats.porFaixa.dificil} difícil`);

  if (op.json) {
    const raiz = path.resolve(op.saida);
    for (const doc of exportarJson(carga, avaliados)) {
      const destino = path.join(raiz, doc.nome);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, doc.conteudo, "utf8");
    }
    console.log(`\nJSONs gravados em: ${raiz}`);
  }

  if (op.csv) {
    const destino = path.join(path.resolve(op.saida), "dificuldade.csv");
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, exportarCsv(avaliados), "utf8");
    console.log(`CSV gravado: ${destino}`);
  }

  process.exit(carga.erros.length ? 2 : 0);
}

void principal().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
