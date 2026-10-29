/** Aba "Lote": carrega JSONs (arquivo, arraste, ou do KuaaRepo), avalia tudo e exporta. */
import { useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CloudDownload, FileDown, FileSpreadsheet, FolderOpen, Loader2, Search, Trash2 } from "lucide-react";
import { estatisticas, exportarCsv, exportarJson, type AvaliacaoItem, type CargaLote } from "@shared/dificuldade";
import { BadgeNivel, Histograma, TagFaixa, baixarArquivo, lerTexto } from "./comum";

const MANIFEST_URL = "https://raw.githubusercontent.com/wavizo-bot/KuaaRepo/main/manifest.json";
const RAW_BASE = "https://raw.githubusercontent.com/wavizo-bot/KuaaRepo/main/";
const POR_PAGINA = 40;

interface PacoteRepo {
  caminho: string;
  pasta: string;
  arquivo: string;
  provas: number;
  questoes: number;
  atualizadoEm: string;
}

const limparNome = (nome: string) => nome.replace(/[\\/:*?"<>|]+/g, "-");

export default function LoteTab({
  carga,
  avaliados,
  onConteudos,
  onLimpar,
}: {
  carga: CargaLote | null;
  avaliados: AvaliacaoItem[];
  onConteudos: (textos: { nome: string; conteudo: string }[]) => void;
  onLimpar: () => void;
}) {
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [manifesto, setManifesto] = useState<PacoteRepo[] | null>(null);
  const [buscandoManifesto, setBuscandoManifesto] = useState(false);
  const [carregandoPkg, setCarregandoPkg] = useState<string | null>(null);
  const [erroManifesto, setErroManifesto] = useState("");

  const [filtroArquivo, setFiltroArquivo] = useState("todos");
  const [filtroNivel, setFiltroNivel] = useState("todos");
  const [busca, setBusca] = useState("");
  const [soMudou, setSoMudou] = useState(false);
  const [pagina, setPagina] = useState(1);

  const stats = useMemo(() => (avaliados.length ? estatisticas(avaliados) : null), [avaliados]);

  // Limpou o lote → filtros também (senão um arquivo antigo os mantém em 0 resultados).
  useEffect(() => {
    if (!carga) {
      setFiltroArquivo("todos");
      setFiltroNivel("todos");
      setBusca("");
      setSoMudou(false);
      setPagina(1);
    }
  }, [carga]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return avaliados.filter((a) => {
      if (filtroArquivo !== "todos" && a.item.arquivo !== filtroArquivo) return false;
      if (filtroNivel !== "todos" && String(a.resultado.nivel) !== filtroNivel) return false;
      if (soMudou && !a.mudouFaixa) return false;
      if (termo) {
        const texto = `${a.item.questao.text ?? a.item.questao.enunciado ?? ""} ${a.item.prova}`.toLowerCase();
        if (!texto.includes(termo)) return false;
      }
      return true;
    });
  }, [avaliados, filtroArquivo, filtroNivel, busca, soMudou]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const gravadas = useMemo(() => {
    const f = { facil: 0, media: 0, dificil: 0 };
    for (const a of avaliados) if (a.faixaAnterior) f[a.faixaAnterior] += 1;
    return f;
  }, [avaliados]);

  /* ---------- carregamento ---------- */

  const receberArquivos = async (lista: FileList | File[]) => {
    const arquivos = Array.from(lista).filter((f) => f.name.toLowerCase().endsWith(".json") || f.type.includes("json"));
    if (!arquivos.length) return;
    const textos = await Promise.all(arquivos.map(async (f) => ({ nome: f.name, conteudo: await lerTexto(f) })));
    onConteudos(textos);
  };

  const abrirManifesto = async () => {
    setBuscandoManifesto(true);
    setErroManifesto("");
    try {
      const res = await fetch(MANIFEST_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { pacotes?: PacoteRepo[] };
      setManifesto(json.pacotes ?? []);
      if (!json.pacotes?.length) setErroManifesto("Manifesto sem pacotes.");
    } catch (e) {
      setErroManifesto(`Falha ao buscar o manifesto: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBuscandoManifesto(false);
    }
  };

  const carregarPacotes = async (pkgs: PacoteRepo[]) => {
    for (const pkg of pkgs) {
      setCarregandoPkg(pkg.caminho);
      try {
        const url = RAW_BASE + pkg.caminho.split("/").map(encodeURIComponent).join("/");
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        onConteudos([{ nome: pkg.caminho, conteudo: await res.text() }]);
      } catch (e) {
        setErroManifesto(`Falha em ${pkg.caminho}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setCarregandoPkg(null);
  };

  const porPasta = useMemo(() => {
    const mapa = new Map<string, PacoteRepo[]>();
    for (const p of manifesto ?? []) {
      const lista = mapa.get(p.pasta) ?? [];
      lista.push(p);
      mapa.set(p.pasta, lista);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [manifesto]);

  /* ---------- exportação ---------- */

  const exportar = async () => {
    if (!carga) return;
    const docs = exportarJson(carga, avaliados);
    if (docs.length === 1) {
      baixarArquivo(limparNome(docs[0].nome), docs[0].conteudo);
      return;
    }
    const zip = new JSZip();
    for (const d of docs) zip.file(limparNome(d.nome), d.conteudo);
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questoes-classificadas.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  /* ---------- render ---------- */

  if (!carga) {
    return (
      <div className="space-y-4 max-w-3xl">
        <Card
          className={`border-2 border-dashed ${arrastando ? "border-emerald-400 bg-emerald-50/50" : "border-slate-300"}`}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); if (e.dataTransfer.files.length) void receberArquivos(e.dataTransfer.files); }}
        >
          <CardContent className="py-10 text-center space-y-3">
            <FolderOpen className="mx-auto h-9 w-9 text-slate-300" />
            <div>
              <p className="text-sm font-medium text-slate-700">Arraste pacotes JSON aqui</p>
              <p className="text-xs text-slate-500 mt-0.5">Pacotes do KuaaRepo, listas de geração ou provas legadas (vários de uma vez).</p>
            </div>
            <input ref={arquivoRef} type="file" accept=".json,application/json" multiple className="hidden" onChange={(e) => { if (e.target.files) void receberArquivos(e.target.files); e.target.value = ""; }} />
            <Button size="sm" onClick={() => arquivoRef.current?.click()}>Escolher arquivos</Button>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold flex items-center gap-2"><CloudDownload size={15} />Baixar do KuaaRepo</p>
                <p className="text-xs text-slate-500">Direto do GitHub (33 pacotes publicados), sem precisar baixar nada à mão.</p>
              </div>
              <Button variant="outline" size="sm" disabled={buscandoManifesto} onClick={() => void abrirManifesto()}>
                {buscandoManifesto ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <CloudDownload size={14} className="mr-1.5" />}
                {manifesto ? "Atualizar lista" : "Listar pacotes"}
              </Button>
            </div>
            {erroManifesto && <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5 flex items-start gap-1.5"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{erroManifesto}</p>}
            {porPasta.length > 0 && (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {porPasta.map(([pasta, pkgs]) => {
                  const provas = pkgs.reduce((s, p) => s + p.provas, 0);
                  const questoes = pkgs.reduce((s, p) => s + p.questoes, 0);
                  return (
                    <div key={pasta} className="border rounded-lg p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{pasta}</p>
                          <p className="text-[11px] text-slate-400 tabular-nums">{pkgs.length} pacote(s) · {provas} provas · {questoes} questões</p>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" disabled={carregandoPkg !== null} onClick={() => void carregarPacotes(pkgs)}>
                          Carregar tudo
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {pkgs.map((p) => (
                          <Button key={p.caminho} variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-slate-600" disabled={carregandoPkg !== null} onClick={() => void carregarPacotes([p])} title={`${p.provas} provas · ${p.questoes} questões`}>
                            {carregandoPkg === p.caminho ? <Loader2 size={11} className="animate-spin" /> : p.arquivo}
                          </Button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="border-slate-200"><CardContent className="px-3 py-2.5">
          <p className="text-[11px] text-slate-500">Questões carregadas</p>
          <p className="text-lg font-semibold tabular-nums">{stats?.total ?? 0}</p>
          <p className="text-[10px] text-slate-400">{carga.arquivos.length} arquivo(s) · {carga.arquivos.reduce((s, a) => s + a.provas, 0)} provas</p>
        </CardContent></Card>
        <Card className="border-slate-200"><CardContent className="px-3 py-2.5">
          <p className="text-[11px] text-slate-500">Trocaram de faixa</p>
          <p className="text-lg font-semibold tabular-nums text-amber-700">{stats?.mudancas ?? 0}</p>
          <p className="text-[10px] text-slate-400">vs. faixa gravada no arquivo</p>
        </CardContent></Card>
        <Card className="border-slate-200"><CardContent className="px-3 py-2.5">
          <p className="text-[11px] text-slate-500">Faixas novas</p>
          <p className="text-xs tabular-nums mt-0.5 leading-relaxed">
            {stats ? `${stats.porFaixa.facil} fácil · ${stats.porFaixa.media} média · ${stats.porFaixa.dificil} difícil` : "—"}
          </p>
        </CardContent></Card>
        <Card className="border-slate-200"><CardContent className="px-3 py-2.5">
          <p className="text-[11px] text-slate-500">Faixas gravadas</p>
          <p className="text-xs tabular-nums mt-0.5 leading-relaxed">{`${gravadas.facil} fácil · ${gravadas.media} média · ${gravadas.dificil} difícil`}</p>
          <p className="text-[10px] text-slate-400">{stats ? `${stats.semAnterior} sem faixa antiga` : ""}</p>
        </CardContent></Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <Card className="border-slate-200"><CardContent className="p-4">
          <Histograma porNivel={stats?.porNivel ?? [0, 0, 0, 0, 0]} titulo="Distribuição de níveis (configuração atual)" />
        </CardContent></Card>
        <Card className="border-slate-200"><CardContent className="p-4 flex flex-col gap-2">
          <p className="text-xs font-medium text-slate-500">Exportar</p>
          <Button size="sm" className="justify-start" onClick={() => void exportar()}>
            <FileDown size={14} className="mr-1.5" />JSON reclassificado{carga.arquivos.length > 1 ? " (zip)" : ""}
          </Button>
          <Button size="sm" variant="outline" className="justify-start" onClick={() => baixarArquivo("dificuldade.csv", exportarCsv(avaliados), "text/csv")}>
            <FileSpreadsheet size={14} className="mr-1.5" />Planilha CSV
          </Button>
          <Button size="sm" variant="outline" className="justify-start text-rose-600" onClick={onLimpar}>
            <Trash2 size={14} className="mr-1.5" />Limpar tudo
          </Button>
          <p className="text-[10px] text-slate-400 leading-tight">O JSON mantém o formato original (só ganha dificuldade_nivel, difficulty, pontos e justificativa).</p>
        </CardContent></Card>
      </div>

      {/* Erros de carga */}
      {carga.erros.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60"><CardContent className="px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><AlertTriangle size={13} />Alguns arquivos não foram carregados</p>
          {carga.erros.map((e, i) => (
            <p key={i} className="text-[11px] text-amber-700"><strong>{e.nome}</strong> — {e.erro}</p>
          ))}
        </CardContent></Card>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} placeholder="buscar no enunciado/prova..." className="h-8 w-56 pl-7 text-sm" />
        </div>
        <Select value={filtroArquivo} onValueChange={(v) => { setFiltroArquivo(v); setPagina(1); }}>
          <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os arquivos ({carga.arquivos.length})</SelectItem>
            {carga.arquivos.map((a) => (
              <SelectItem key={a.nome} value={a.nome}>{a.nome} ({a.questoes})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroNivel} onValueChange={(v) => { setFiltroNivel(v); setPagina(1); }}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os níveis</SelectItem>
            {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>Nível {n}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
          <Checkbox checked={soMudou} onCheckedChange={(v) => { setSoMudou(v === true); setPagina(1); }} />
          só quem mudou de faixa
        </label>
        <span className="text-xs text-slate-400 tabular-nums ml-auto">{filtrados.length} de {avaliados.length}</span>
      </div>

      {/* Tabela */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>Questão</TableHead>
                <TableHead className="w-24">Antes</TableHead>
                <TableHead className="w-32">Agora</TableHead>
                <TableHead className="w-16 text-right">Pts</TableHead>
                <TableHead className="w-[26%]">Justificativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-slate-400 py-8">Nada com esses filtros.</TableCell></TableRow>
              )}
              {visiveis.map((a) => {
                const enunciado = String(a.item.questao.text ?? a.item.questao.enunciado ?? "").trim();
                return (
                  <TableRow key={a.item.chave} className="align-top">
                    <TableCell className="text-xs text-slate-400 tabular-nums">{a.item.indice + 1}</TableCell>
                    <TableCell className="min-w-0">
                      <p className="text-sm leading-snug line-clamp-2" title={enunciado}>{enunciado.slice(0, 220)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{a.item.arquivo} · {a.item.prova}</p>
                    </TableCell>
                    <TableCell>
                      <TagFaixa faixa={a.faixaAnterior} pequeno />
                      {a.nivelAnterior !== null && <span className="block text-[10px] text-slate-400 tabular-nums">N{a.nivelAnterior}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <BadgeNivel nivel={a.resultado.nivel} pequeno />
                        <TagFaixa faixa={a.resultado.dificuldade} pequeno />
                      </div>
                      {a.mudouFaixa && <Badge variant="outline" className="mt-1 text-[10px] px-1 py-0 bg-amber-50 text-amber-700 border-amber-200">mudou</Badge>}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{a.resultado.pontos}</TableCell>
                    <TableCell className="text-[11px] text-slate-500 leading-snug line-clamp-2" title={a.resultado.justificativa}>{a.resultado.justificativa}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginação */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="h-8" disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>← Anterior</Button>
        <span className="text-xs text-slate-500 tabular-nums">página {paginaAtual} de {totalPaginas}</span>
        <Button variant="outline" size="sm" className="h-8" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>Próxima →</Button>
      </div>
    </div>
  );
}
