/**
 * kuaa — Classificador de dificuldade (ferramenta de uso recorrente).
 * Motor em @shared/dificuldade (mesmo código nos testes e no CLI);
 * configuração, perfis e rótulos humanos persistem no navegador.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, FlaskConical } from "lucide-react";
import {
  CONFIG_PADRAO,
  PERFIS_EMBUTIDOS,
  avaliarItens,
  carregarJsons,
  cloneConfig,
  normalizarConfig,
  type CargaLote,
  type ConfigDificuldade,
  type PerfilDificuldade,
  type RotuloHumano,
} from "@shared/dificuldade";
import AmostrasTab from "./dificuldade/AmostrasTab";
import AvaliadorTab from "./dificuldade/AvaliadorTab";
import ConfigTab from "./dificuldade/ConfigTab";
import LoteTab from "./dificuldade/LoteTab";

const LS_CONFIG = "kuaa-dificuldade-config";
const LS_PERFIS = "kuaa-dificuldade-perfis";
const LS_ATIVO = "kuaa-dificuldade-perfil-ativo";
const LS_ROTULOS = "kuaa-dificuldade-rotulos";
const LS_ABA = "kuaa-dificuldade-aba";
const TETO_ROTULOS = 1200;

type Aba = "avaliar" | "lote" | "amostras" | "config";

function lerLS<T>(chave: string): T | null {
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  } catch {
    return null;
  }
}

function gravarLS(chave: string, valor: unknown) {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* cota cheia: a sessão continua, só não persiste */
  }
}

export default function Dificuldade() {
  const [avisos, setAvisos] = useState<string[]>([]);
  const [config, setConfig] = useState<ConfigDificuldade>(() => {
    const salvo = lerLS<unknown>(LS_CONFIG);
    if (salvo === null) return cloneConfig(CONFIG_PADRAO);
    const { config: cfg, avisos: av } = normalizarConfig(salvo);
    if (av.length) window.setTimeout(() => setAvisos(av), 0);
    return cfg;
  });
  const [perfisCustom, setPerfisCustom] = useState<PerfilDificuldade[]>(() => lerLS<PerfilDificuldade[]>(LS_PERFIS) ?? []);
  const [perfilAtivo, setPerfilAtivo] = useState<string>(() => lerLS<string>(LS_ATIVO) ?? "padrao");
  const [rotulos, setRotulos] = useState<RotuloHumano[]>(() => lerLS<RotuloHumano[]>(LS_ROTULOS) ?? []);
  const [carga, setCarga] = useState<CargaLote | null>(null);
  const [aba, setAba] = useState<Aba>(() => {
    const salva = lerLS<string>(LS_ABA);
    return salva === "avaliar" || salva === "lote" || salva === "amostras" || salva === "config" ? salva : "avaliar";
  });

  useEffect(() => gravarLS(LS_CONFIG, config), [config]);
  useEffect(() => gravarLS(LS_PERFIS, perfisCustom), [perfisCustom]);
  useEffect(() => gravarLS(LS_ATIVO, perfilAtivo), [perfilAtivo]);
  useEffect(() => gravarLS(LS_ROTULOS, rotulos), [rotulos]);
  useEffect(() => gravarLS(LS_ABA, aba), [aba]);

  const perfis: PerfilDificuldade[] = useMemo(() => [...PERFIS_EMBUTIDOS, ...perfisCustom], [perfisCustom]);
  const perfilSelecionado = perfis.find((p) => p.id === perfilAtivo) ?? null;
  const modificado = perfilSelecionado !== null && JSON.stringify(perfilSelecionado.config) !== JSON.stringify(config);

  const avaliados = useMemo(() => (carga ? avaliarItens(carga.itens, config) : []), [carga, config]);

  /* ---------- carga de dados ---------- */

  const adicionarConteudos = (textos: { nome: string; conteudo: string }[]) => {
    const nova = carregarJsons(textos);
    setCarga((prev) => {
      if (!prev) return nova;
      const substituidos = new Set(nova.docs.keys());
      const itens = [...prev.itens.filter((i) => !substituidos.has(i.arquivo)), ...nova.itens];
      itens.sort((a, b) => a.chave.localeCompare(b.chave, "pt-BR"));
      const docs = new Map(prev.docs);
      for (const [k, v] of nova.docs) docs.set(k, v);
      const arquivos = [...prev.arquivos.filter((a) => !substituidos.has(a.nome)), ...nova.arquivos];
      const erros = [...prev.erros.filter((e) => !nova.erros.some((n) => n.nome === e.nome)), ...nova.erros];
      return { itens, docs, arquivos, erros };
    });
    const ok = nova.itens.length;
    if (ok > 0) toast.success(`${ok} questão(ões) prontas para avaliação`, { description: `${nova.arquivos.length} arquivo(s) · perfil ${config.rotulo}` });
    if (nova.erros.length) toast.warning(`${nova.erros.length} arquivo(s) ignorado(s)`, { description: nova.erros.map((e) => e.nome).join(", ") });
    return nova;
  };

  /* ---------- perfis e configuração ---------- */

  const aplicarConfig = (cfg: ConfigDificuldade, perfil: string) => {
    setConfig(cfg);
    setPerfilAtivo(perfil);
  };

  const aplicarPerfil = (id: string) => {
    const achado = perfis.find((p) => p.id === id);
    if (!achado) return;
    const { config: cfg, avisos: av } = normalizarConfig(achado.config);
    aplicarConfig({ ...cfg, rotulo: achado.nome }, id);
    setAvisos(av);
  };

  const salvarPerfil = (nome: string) => {
    const novo: PerfilDificuldade = {
      id: `custom-${Date.now()}`,
      nome,
      descricao: `Perfil seu, salvo em ${new Date().toLocaleDateString("pt-BR")}.`,
      config: { ...cloneConfig(config), rotulo: nome },
    };
    setPerfisCustom((p) => [...p, novo]);
    setConfig((c) => ({ ...c, rotulo: nome }));
    setPerfilAtivo(novo.id);
    toast.success(`Perfil "${nome}" salvo`);
  };

  const removerPerfil = (id: string) => {
    setPerfisCustom((p) => p.filter((x) => x.id !== id));
    aplicarPerfil("padrao");
    toast.info("Perfil excluído — voltou ao padrão");
  };

  const exportarConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `config-dificuldade-${config.rotulo.replace(/\s+/g, "-").toLowerCase()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const importarConfig = async (file: File) => {
    try {
      const dados: unknown = JSON.parse(await file.text());
      const { config: cfg, avisos: av } = normalizarConfig(dados);
      setConfig({ ...cfg, rotulo: cfg.rotulo !== CONFIG_PADRAO.rotulo ? cfg.rotulo : file.name.replace(/\.json$/i, "") });
      setPerfilAtivo("");
      setAvisos(av);
      toast.success("Configuração importada", { description: av.length ? `${av.length} aviso(s) de saneamento` : "tudo dentro do esperado" });
    } catch (e) {
      toast.error("Arquivo inválido", { description: e instanceof Error ? e.message : String(e) });
    }
  };

  const restaurarPadrao = () => {
    aplicarConfig(cloneConfig(CONFIG_PADRAO), "padrao");
    setAvisos([]);
    toast.info("Configuração restaurada para o padrão do gerador");
  };

  /* ---------- rótulos ---------- */

  const registrarRotulo = (r: RotuloHumano) => {
    setRotulos((prev) => {
      const i = prev.findIndex((x) => x.chave === r.chave);
      const base = i >= 0 ? prev.map((x, j) => (j === i ? r : x)) : [...prev, r];
      return base.length > TETO_ROTULOS ? base.slice(base.length - TETO_ROTULOS) : base;
    });
  };

  const importarRotulos = (lista: RotuloHumano[]) => {
    setRotulos((prev) => {
      const mapa = new Map(prev.map((r) => [r.chave, r] as const));
      for (const r of lista) mapa.set(r.chave, r);
      const todos = [...mapa.values()];
      return todos.length > TETO_ROTULOS ? todos.slice(todos.length - TETO_ROTULOS) : todos;
    });
    toast.success(`${lista.length} rótulo(s) importado(s)`);
  };

  /* ---------- render ---------- */

  return (
    <div className="min-h-full">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <FlaskConical size={19} className="text-slate-400" />
              Classificador de dificuldade
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Heurística nível 1-5 (enunciado, alternativas, contexto, áreas) — avalie, ajuste os parâmetros, valide com amostras humanas e exporte.
            </p>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <p>Perfil: <strong className="text-slate-700">{config.rotulo}</strong>{modificado && <span className="text-amber-600"> · ajustado</span>}</p>
            <p className="tabular-nums">{avaliados.length ? `${avaliados.length} questões em memória` : "nenhum lote carregado"}{rotulos.length ? ` · ${rotulos.length} rótulo(s)` : ""}</p>
          </div>
        </header>

        {avisos.length > 0 && (
          <div className="border border-amber-200 bg-amber-50/70 rounded-lg px-3 py-2 space-y-0.5">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><AlertTriangle size={13} />Saneamento da configuração</p>
            {avisos.map((a, i) => <p key={i} className="text-[11px] text-amber-700">• {a}</p>)}
            <button className="text-[10px] text-amber-500 underline" onClick={() => setAvisos([])}>entendi, ocultar</button>
          </div>
        )}

        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList>
            <TabsTrigger value="avaliar">Avaliar</TabsTrigger>
            <TabsTrigger value="lote">Lote{carga ? ` (${avaliados.length})` : ""}</TabsTrigger>
            <TabsTrigger value="amostras">Amostras{rotulos.length ? ` (${rotulos.length})` : ""}</TabsTrigger>
            <TabsTrigger value="config">Configuração</TabsTrigger>
          </TabsList>

          <TabsContent value="avaliar" className="mt-4" forceMount>
            <AvaliadorTab config={config} />
          </TabsContent>

          <TabsContent value="lote" className="mt-4" forceMount>
            <LoteTab carga={carga} avaliados={avaliados} onConteudos={adicionarConteudos} onLimpar={() => setCarga(null)} />
          </TabsContent>

          <TabsContent value="amostras" className="mt-4" forceMount>
            <AmostrasTab
              carga={carga}
              avaliados={avaliados}
              config={config}
              rotulos={rotulos}
              onRotulo={registrarRotulo}
              onImportar={importarRotulos}
              onLimparRotulos={() => setRotulos([])}
            />
          </TabsContent>

          <TabsContent value="config" className="mt-4" forceMount>
            <ConfigTab
              config={config}
              onChange={setConfig}
              perfis={perfis}
              perfilAtivo={perfilAtivo}
              onAplicarPerfil={aplicarPerfil}
              onSalvarPerfil={salvarPerfil}
              onRemoverPerfil={removerPerfil}
              onExportar={exportarConfig}
              onImportar={(f) => void importarConfig(f)}
              onRestaurar={restaurarPadrao}
            />
          </TabsContent>
        </Tabs>

        <footer className="text-[11px] text-slate-400 border-t pt-3 flex flex-wrap gap-x-4 gap-y-1">
          <span>Motor: <code className="font-mono">shared/dificuldade</code> — o mesmo código roda aqui, nos testes (<code className="font-mono">pnpm test</code>) e no CLI (<code className="font-mono">pnpm tsx scripts/classificar-dificuldade.ts</code>).</span>
          <span>Tudo local: nada sai deste navegador.</span>
        </footer>
      </div>
    </div>
  );
}
