/** Aba "Amostras": sortea uma amostra, o humano rotula 1-5 e o motor é medido contra isso. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dices, Download, Trash2, Upload } from "lucide-react";
import { NIVEL_LABELS, type Nivel } from "@/lib/kuaaFormat";
import {
  avaliarQuestao,
  calcularMetricas,
  chaveQuestao,
  sortearAmostra,
  type AvaliacaoItem,
  type CargaLote,
  type ConfigDificuldade,
  type RotuloHumano,
} from "@shared/dificuldade";
import { BadgeNivel, CORES_NIVEL, CartaoMetrica, TagFaixa, baixarArquivo, lerTexto, rotuloDelta } from "./comum";

export default function AmostrasTab({
  carga,
  avaliados,
  config,
  rotulos,
  onRotulo,
  onImportar,
  onLimparRotulos,
}: {
  carga: CargaLote | null;
  avaliados: AvaliacaoItem[];
  config: ConfigDificuldade;
  rotulos: RotuloHumano[];
  onRotulo: (r: RotuloHumano) => void;
  onImportar: (lista: RotuloHumano[]) => void;
  onLimparRotulos: () => void;
}) {
  const [porNivel, setPorNivel] = useState(4);
  const [somenteMudou, setSomenteMudou] = useState(false);
  const [semente, setSemente] = useState(7);
  const [amostra, setAmostra] = useState<AvaliacaoItem[]>([]);
  const [idx, setIdx] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);

  const porChave = useMemo(() => {
    const m = new Map<string, RotuloHumano>();
    for (const r of rotulos) m.set(r.chave, r);
    return m;
  }, [rotulos]);

  // Limpou o lote → amostra em memória também (os rótulos sobrevivem; as métricas continuam).
  useEffect(() => {
    if (!carga) {
      setAmostra([]);
      setIdx(0);
    }
  }, [carga]);

  const pares = useMemo(
    () => rotulos.map((r) => ({ r, maq: avaliarQuestao(r.questao, config).nivel })),
    [rotulos, config],
  );
  const metricas = useMemo(() => calcularMetricas(rotulos, config), [rotulos, config]);

  const atual = amostra[idx] ?? null;
  const rotuloAtual = atual ? porChave.get(chaveQuestao(atual.item.questao)) : undefined;
  const rotuladosNaAmostra = amostra.filter((a) => porChave.has(chaveQuestao(a.item.questao))).length;

  const sortear = () => {
    setAmostra(sortearAmostra(avaliados, { porNivel, seed: semente, somenteMudou }));
    setIdx(0);
  };

  const registrar = (nivel: number) => {
    if (!atual) return;
    onRotulo({
      chave: chaveQuestao(atual.item.questao),
      enunciado: String(atual.item.questao.text ?? atual.item.questao.enunciado ?? "").slice(0, 400),
      questao: atual.item.questao,
      nivelHumano: nivel,
      quando: new Date().toISOString(),
    });
    if (idx < amostra.length - 1) setIdx(idx + 1);
  };

  const exportarRotulos = () => {
    baixarArquivo("rotulos-dificuldade.json", JSON.stringify(rotulos, null, 2));
  };

  const importarRotulos = async (file: File) => {
    try {
      const dados: unknown = JSON.parse(await lerTexto(file));
      if (!Array.isArray(dados)) throw new Error("esperava uma lista");
      const validos = (dados as RotuloHumano[]).filter(
        (r) => r && typeof r.chave === "string" && typeof r.nivelHumano === "number" && r.questao && typeof r.questao === "object",
      );
      onImportar(validos);
    } catch (e) {
      window.alert(`Arquivo inválido: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const divergentes = pares.filter(({ r, maq }) => Math.abs(r.nivelHumano - maq) >= 2).sort((a, b) => Math.abs(b.r.nivelHumano - b.maq) - Math.abs(a.r.nivelHumano - a.maq));

  return (
    <div className="space-y-4">
      {/* Métricas do motor */}
      <div className="grid gap-3 md:grid-cols-4">
        <CartaoMetrica titulo="Rótulos humanos" valor={String(metricas.n)} detalhe="amostras acumuladas (salvas neste navegador)" />
        <CartaoMetrica titulo="Acerto exato" valor={`${Math.round(metricas.exato * 100)}%`} detalhe={`±1 nível: ${Math.round(metricas.dentroDeUm * 100)}%`} />
        <CartaoMetrica titulo="Erro médio (MAE)" valor={metricas.mae.toFixed(2)} detalhe={`humano ${metricas.mediaHumano.toFixed(1)} · máquina ${metricas.mediaMaquina.toFixed(1)}`} />
        <Card className="border-slate-200"><CardContent className="px-3 py-2.5 flex flex-col justify-center gap-1.5">
          <p className="text-[11px] text-slate-500">Rótulos</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={exportarRotulos} disabled={!rotulos.length}><Download size={12} className="mr-1" />Exportar</Button>
            <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importarRotulos(f); e.target.value = ""; }} />
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => importRef.current?.click()}><Upload size={12} className="mr-1" />Importar</Button>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-rose-600" disabled={!rotulos.length} onClick={() => { if (window.confirm("Apagar TODOS os rótulos humanos salvos?")) onLimparRotulos(); }}><Trash2 size={12} /></Button>
          </div>
        </CardContent></Card>
      </div>

      {metricas.n > 0 && (
        <div className="grid gap-3 lg:grid-cols-[auto_1fr]">
          <Card className="border-slate-200"><CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Confusão (linha = humano · coluna = máquina)</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-[11px] p-1.5">H \ M</TableHead>
                  {[1, 2, 3, 4, 5].map((c) => <TableHead key={c} className={`text-center text-[11px] p-1.5 ${CORES_NIVEL[c - 1]}`}>N{c}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {metricas.confusao.map((linha, hi) => (
                  <TableRow key={hi}>
                    <TableCell className={`text-[11px] p-1.5 font-medium ${CORES_NIVEL[hi]}`}>N{hi + 1}</TableCell>
                    {linha.map((v, mi) => (
                      <TableCell key={mi} className={`text-center text-xs tabular-nums p-1.5 ${v === 0 ? "text-slate-300" : hi === mi ? "font-bold text-emerald-700 bg-emerald-50" : "text-amber-700 bg-amber-50"}`}>{v || "·"}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>

          <Card className="border-slate-200"><CardContent className="p-4">
            <p className="text-xs font-medium text-slate-500 mb-2">Maior divergência (|humano − máquina| ≥ 2) — {divergentes.length} caso(s)</p>
            {divergentes.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma divergência forte. Motor alinhado com seus rótulos.</p>
            ) : (
              <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {divergentes.map(({ r, maq }) => (
                  <li key={r.chave} className="flex items-start justify-between gap-3 text-xs bg-slate-50 rounded px-2 py-1.5">
                    <span className="text-slate-700 line-clamp-2" title={r.enunciado}>{r.enunciado}</span>
                    <span className="shrink-0 tabular-nums font-semibold text-amber-700">{NIVEL_LABELS[r.nivelHumano as Nivel]?.slice(0, 8)} H × M {maq}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-slate-400 mt-2 leading-tight">As métricas são recalculadas com a CONFIGURAÇÃO ATUAL: ajuste os parâmetros na aba Configuração e veja o motor se aproximar da sua opinião.</p>
          </CardContent></Card>
        </div>
      )}

      {/* Sorteio + rotulagem */}
      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] text-slate-500 font-normal">Por nível</Label>
              <div className="flex items-center gap-1.5">
                {[2, 3, 4, 6, 8].map((n) => (
                  <Button key={n} variant={porNivel === n ? "default" : "outline"} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setPorNivel(n)}>{n}</Button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none pb-1.5">
              <Checkbox checked={somenteMudou} onCheckedChange={(v) => setSomenteMudou(v === true)} />
              só quem mudou de faixa
            </label>
            <div className="space-y-1">
              <Label className="text-[11px] text-slate-500 font-normal">Semente</Label>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" title="Nova semente" onClick={() => setSemente((s) => s + 1)}><Dices size={14} /></Button>
                <span className="text-xs tabular-nums text-slate-500 w-8">{semente}</span>
              </div>
            </div>
            <Button size="sm" className="h-8" disabled={!avaliados.length} onClick={sortear} title={avaliados.length ? "" : "Carregue questões na aba Lote primeiro"}>
              Sortear amostra
            </Button>
            <span className="text-xs text-slate-400 ml-auto tabular-nums">{amostra.length ? `rotulados: ${rotuladosNaAmostra}/${amostra.length}` : ""}</span>
          </div>

          {!carga && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded px-3 py-2">
              Carregue um lote na aba <strong>Lote</strong> para sortear novas amostras. Os rótulos já feitos continuam salvos e as métricas acima seguem válidas.
            </p>
          )}

          {amostra.length > 0 && atual ? (
            <div className="border rounded-lg divide-y">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
                <span className="text-xs text-slate-600 tabular-nums">amostra {idx + 1} / {amostra.length} · nível {atual.resultado.nivel}</span>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>←</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={idx >= amostra.length - 1} onClick={() => setIdx(idx + 1)}>→</Button>
                </div>
              </div>
              <div className="p-3 space-y-2.5">
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{String(atual.item.questao.text ?? atual.item.questao.enunciado ?? "")}</p>
                {(atual.item.questao.baseText ?? atual.item.questao.texto_apoio) && (
                  <p className="text-xs text-slate-600 bg-slate-50 rounded p-2 whitespace-pre-wrap border-l-2 border-slate-300">{String(atual.item.questao.baseText ?? atual.item.questao.texto_apoio)}</p>
                )}
                <ul className="space-y-1">
                  {(atual.item.questao.alternatives ?? atual.item.questao.alternativas ?? []).map((alt, i) => {
                    const texto = String((alt && (alt.text ?? alt.texto)) ?? "");
                    if (!texto.trim()) return null;
                    const correta = alt.correta === true || (atual.item.questao.correct !== undefined && atual.item.questao.correct !== null && String(atual.item.questao.correct) === String(alt.id ?? i + 1));
                    return (
                      <li key={String(alt.id ?? i)} className={`text-xs rounded px-2 py-1.5 border ${correta ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-700"}`}>
                        <strong className="mr-1.5">{String(alt.id ?? i + 1)}</strong>{texto}
                        {correta && <span className="ml-1.5 text-[10px] font-semibold uppercase text-emerald-600">correta</span>}
                      </li>
                    );
                  })}
                </ul>

                <div className="flex items-start gap-2 text-xs bg-indigo-50 border border-indigo-100 rounded px-2.5 py-2">
                  <span className="shrink-0 font-medium text-indigo-700">Motor:</span>
                  <span className="flex items-center gap-1.5">
                    <BadgeNivel nivel={atual.resultado.nivel} pequeno />
                    <TagFaixa faixa={atual.resultado.dificuldade} pequeno />
                    <span className="text-indigo-700 tabular-nums">{rotuloDelta(atual.resultado.contribuicoes.reduce((s, c) => s + c.delta, 0))} pontos</span>
                  </span>
                  <span className="text-slate-600 leading-snug">{atual.resultado.justificativa}</span>
                </div>

                <div>
                  <p className="text-[11px] text-slate-500 mb-1.5">Seu veredito: qual o nível REAL desta questão?</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Button
                        key={n}
                        variant={rotuloAtual?.nivelHumano === n ? "default" : "outline"}
                        size="sm"
                        className={`h-8 text-xs ${rotuloAtual?.nivelHumano === n ? CORES_NIVEL[n - 1] + " border-transparent" : ""}`}
                        onClick={() => registrar(n)}
                      >
                        {n} · {NIVEL_LABELS[n as Nivel]}
                      </Button>
                    ))}
                    <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500" onClick={() => { if (idx < amostra.length - 1) setIdx(idx + 1); }}>
                      pular
                    </Button>
                  </div>
                  {rotuloAtual && (
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      rotulado em {new Date(rotuloAtual.quando).toLocaleString("pt-BR")} — clique em outro nível para corrigir
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            amostra.length === 0 && carga && (
              <p className="text-xs text-slate-500">Clique em <strong>Sortear amostra</strong> para montar um conjunto de teste estratificado por nível.</p>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
}
