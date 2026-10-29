/** Blocos visuais compartilhados da ferramenta de dificuldade. */
import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NIVEL_LABELS, type Nivel } from "@/lib/kuaaFormat";
import type { FaixaDificuldade } from "@shared/dificuldade";

export const CORES_NIVEL = [
  "bg-emerald-100 text-emerald-800 border-emerald-200",
  "bg-lime-100 text-lime-800 border-lime-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-orange-100 text-orange-800 border-orange-200",
  "bg-rose-100 text-rose-800 border-rose-200",
];

export const CORES_BARRA = ["bg-emerald-400", "bg-lime-400", "bg-amber-400", "bg-orange-400", "bg-rose-400"];

export const ROTULO_FAIXA: Record<FaixaDificuldade, string> = { facil: "Fácil", media: "Média", dificil: "Difícil" };

export const CORES_FAIXA: Record<FaixaDificuldade, string> = {
  facil: "bg-emerald-100 text-emerald-800 border-emerald-200",
  media: "bg-amber-100 text-amber-800 border-amber-200",
  dificil: "bg-rose-100 text-rose-800 border-rose-200",
};

export function BadgeNivel({ nivel, pequeno }: { nivel: number; pequeno?: boolean }) {
  const idx = Math.max(1, Math.min(5, Math.round(nivel))) - 1;
  return (
    <Badge variant="outline" className={`${CORES_NIVEL[idx]} ${pequeno ? "text-[11px] px-1.5 py-0" : "text-sm px-2.5 py-1"} font-semibold tabular-nums`}>
      {NIVEL_LABELS[(idx + 1) as Nivel]}
    </Badge>
  );
}

export function TagFaixa({ faixa, pequeno }: { faixa: FaixaDificuldade | null; pequeno?: boolean }) {
  if (!faixa) return <span className="text-xs text-slate-400">—</span>;
  return (
    <Badge variant="outline" className={`${CORES_FAIXA[faixa]} ${pequeno ? "text-[11px] px-1.5 py-0" : "text-xs px-2 py-0.5"}`}>
      {ROTULO_FAIXA[faixa]}
    </Badge>
  );
}

/** Histograma simples de níveis 1-5 (barras CSS, sem dependência de gráfico). */
export function Histograma({ porNivel, titulo, compacto }: { porNivel: number[]; titulo?: string; compacto?: boolean }) {
  const total = porNivel.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...porNivel, 1);
  return (
    <div className="space-y-1.5">
      {titulo && <p className="text-xs font-medium text-slate-500">{titulo}</p>}
      <div className={`flex items-end gap-1.5 ${compacto ? "h-14" : "h-24"}`}>
        {porNivel.map((n, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${i + 1}: ${n} questão(ões)`}>
            <span className="text-[10px] tabular-nums text-slate-500">{n || ""}</span>
            <div
              className={`w-full rounded-t ${CORES_BARRA[i]} ${n ? "" : "opacity-25"}`}
              style={{ height: `${Math.max(4, Math.round((n / max) * 100))}%` }}
            />
            <span className="text-[10px] tabular-nums text-slate-400">{Math.round((n / total) * 100)}%</span>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 text-[10px] text-slate-400">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="flex-1 text-center">N{n}</span>
        ))}
      </div>
    </div>
  );
}

/** Campo numérico com texto livre enquanto digita (só commita número válido). */
export function Numero({
  label,
  valor,
  onChange,
  step,
  min,
  max,
  dica,
}: {
  label: string;
  valor: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
  max?: number;
  dica?: string;
}) {
  const [txt, setTxt] = useState(String(valor));
  useEffect(() => setTxt(String(valor)), [valor]);
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-[11px] text-slate-500 font-normal">{label}</Label>
      <Input
        type="number"
        value={txt}
        step={step}
        min={min}
        max={max}
        className="h-8 text-sm"
        onChange={(e) => {
          setTxt(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => setTxt(String(valor))}
      />
      {dica && <p className="text-[10px] text-slate-400 leading-tight">{dica}</p>}
    </div>
  );
}

/** Campo de texto curto. */
export function Texto({
  label,
  valor,
  onChange,
  placeholder,
  dica,
}: {
  label: string;
  valor: string;
  onChange: (s: string) => void;
  placeholder?: string;
  dica?: string;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <Label className="text-[11px] text-slate-500 font-normal">{label}</Label>
      <Input value={valor} placeholder={placeholder} className="h-8 text-sm" onChange={(e) => onChange(e.target.value)} />
      {dica && <p className="text-[10px] text-slate-400 leading-tight">{dica}</p>}
    </div>
  );
}

/** Lista editável em linhas (uma entrada por linha: padrões, termos de área...). */
export function ListaLinhas({
  label,
  itens,
  onChange,
  dica,
  linhas = 4,
  placeholder,
}: {
  label: string;
  itens: string[];
  onChange: (lista: string[]) => void;
  dica?: string;
  linhas?: number;
  placeholder?: string;
}) {
  const [txt, setTxt] = useState(itens.join("\n"));
  useEffect(() => setTxt(itens.join("\n")), [itens]);
  const commit = (valor: string) => {
    setTxt(valor);
    onChange(valor.split("\n").map((s) => s.trim()).filter(Boolean));
  };
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-slate-500 font-normal">{label}</Label>
      <Textarea
        value={txt}
        rows={linhas}
        placeholder={placeholder}
        className="text-sm font-mono"
        onChange={(e) => commit(e.target.value)}
        onBlur={() => setTxt(itens.join("\n"))}
      />
      {dica && <p className="text-[10px] text-slate-400 leading-tight">{dica}</p>}
    </div>
  );
}

/** Seção (card) com título, descrição opcional e interruptor de ativação. */
export function Secao({
  titulo,
  descricao,
  children,
  ativo,
  onToggle,
  direita,
}: {
  titulo: string;
  descricao?: string;
  children?: ReactNode;
  ativo?: boolean;
  onToggle?: (v: boolean) => void;
  direita?: ReactNode;
}) {
  return (
    <Card className={`${ativo === false ? "opacity-60" : ""} border-slate-200`}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-sm font-semibold">{titulo}</CardTitle>
            {descricao && <p className="text-xs text-slate-500 mt-0.5">{descricao}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {direita}
            {ativo !== undefined && onToggle && <Switch checked={ativo} onCheckedChange={onToggle} />}
          </div>
        </div>
      </CardHeader>
      {children && <CardContent className="px-4 pb-4 pt-0">{children}</CardContent>}
    </Card>
  );
}

/** Métrica em cartão compacto. */
export function CartaoMetrica({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="px-3 py-2.5">
        <p className="text-[11px] text-slate-500">{titulo}</p>
        <p className="text-lg font-semibold tabular-nums leading-tight">{valor}</p>
        {detalhe && <p className="text-[10px] text-slate-400">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

/** Baixa um arquivo no navegador. */
export function baixarArquivo(nome: string, conteudo: string, mime = "application/json") {
  const blob = new Blob([conteudo], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Lê um arquivo do disco como texto. */
export function lerTexto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ""));
    fr.onerror = () => reject(fr.error ?? new Error("Falha ao ler arquivo"));
    fr.readAsText(file);
  });
}

export function rotuloDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}
