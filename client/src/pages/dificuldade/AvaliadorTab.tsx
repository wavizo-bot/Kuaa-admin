/** Aba "Avaliar": uma questão colada à mão, avaliada ao vivo com a configuração atual. */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Eraser, Sparkles } from "lucide-react";
import { avaliarQuestao, type ConfigDificuldade, type QuestaoDificuldade } from "@shared/dificuldade";
import { TagFaixa, rotuloDelta } from "./comum";

interface Alt {
  id: string;
  texto: string;
  correta: boolean;
}

const VAZIO: { enunciado: string; apoio: string; assunto: string; tema: string; alts: Alt[] } = {
  enunciado: "",
  apoio: "",
  assunto: "",
  tema: "",
  alts: [
    { id: "A01", texto: "", correta: false },
    { id: "A02", texto: "", correta: false },
    { id: "A03", texto: "", correta: false },
    { id: "A04", texto: "", correta: false },
  ],
};

const EXEMPLO = {
  enunciado:
    "Um laboratório mistura duas soluções: a primeira tem concentração de 12% e a segunda 30%. Deseja-se obter 200 mL de mistura com 20% de concentração. Qual volume da segunda solução deve ser usado? Considere as proporções descritas na tabela do enunciado.",
  apoio: "",
  assunto: "Álgebra",
  tema: "Funções",
  alts: [
    { id: "A01", texto: "100 mL", correta: false },
    { id: "A02", texto: "111,1 mL", correta: true },
    { id: "A03", texto: "88,9 mL", correta: false },
    { id: "A04", texto: "150 mL", correta: false },
  ] as Alt[],
};

export default function AvaliadorTab({ config }: { config: ConfigDificuldade }) {
  const [rascunho, setRascunho] = useState(VAZIO);

  const questao: QuestaoDificuldade = useMemo(
    () => ({
      text: rascunho.enunciado,
      baseText: rascunho.apoio,
      assunto: rascunho.assunto || undefined,
      tema: rascunho.tema || undefined,
      alternatives: rascunho.alts.filter((a) => a.texto.trim()).map((a) => ({ id: a.id, text: a.texto, correta: a.correta })),
      correct: rascunho.alts.find((a) => a.correta && a.texto.trim())?.id,
    }),
    [rascunho],
  );

  const resultado = useMemo(() => avaliarQuestao(questao, config), [questao, config]);
  const temAlternativas = questao.alternatives?.length ?? 0;

  const setAlt = (i: number, patch: Partial<Alt>) =>
    setRascunho((r) => ({ ...r, alts: r.alts.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px] items-start">
      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Enunciado</Label>
            <Textarea
              rows={5}
              placeholder="Cole aqui o enunciado da questão..."
              value={rascunho.enunciado}
              onChange={(e) => setRascunho({ ...rascunho, enunciado: e.target.value })}
            />
            <p className="text-[11px] text-slate-400">
              {rascunho.enunciado.trim().length} caracteres (curto &lt; {config.regras.enunciado.curto.limiar} · longo &gt; {config.regras.enunciado.longo.limiar} · muito longo &gt; {config.regras.enunciado.muitoLongo.limiar})
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Texto de apoio (tabela, gráfico, citação — opcional)</Label>
            <Textarea
              rows={3}
              placeholder="Cole o texto de apoio, se houver..."
              value={rascunho.apoio}
              onChange={(e) => setRascunho({ ...rascunho, apoio: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-slate-500">Alternativas (marque a(s) correta(s))</Label>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRascunho({ ...rascunho, alts: [...rascunho.alts, { id: `A${String(rascunho.alts.length + 1).padStart(2, "0")}`, texto: "", correta: false }] })} disabled={rascunho.alts.length >= 6}>
                  + alternativa
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRascunho({ ...rascunho, alts: rascunho.alts.slice(0, -1) })} disabled={rascunho.alts.length <= 2}>
                  − alternativa
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              {rascunho.alts.map((a, i) => (
                <div key={a.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Marcar alternativa ${a.id} como correta`}
                    className={`w-6 h-6 shrink-0 rounded-full border text-[10px] font-semibold transition-colors ${a.correta ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 text-slate-400 hover:border-slate-400"}`}
                    onClick={() => setAlt(i, { correta: !a.correta })}
                  >
                    {a.id.slice(-1)}
                  </button>
                  <Input
                    value={a.texto}
                    placeholder={`Alternativa ${a.id}`}
                    className="h-8 text-sm"
                    onChange={(e) => setAlt(i, { texto: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Assunto (peso de tema)</Label>
              <Input value={rascunho.assunto} placeholder="ex.: Álgebra" className="h-8 text-sm" onChange={(e) => setRascunho({ ...rascunho, assunto: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Tema</Label>
              <Input value={rascunho.tema} placeholder="ex.: Funções" className="h-8 text-sm" onChange={(e) => setRascunho({ ...rascunho, tema: e.target.value })} />
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRascunho({ ...VAZIO, alts: VAZIO.alts.map((a) => ({ ...a })) })}>
              <Eraser size={13} className="mr-1.5" /> Limpar
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRascunho({ ...EXEMPLO, alts: EXEMPLO.alts.map((a) => ({ ...a })) })}>
              <Sparkles size={13} className="mr-1.5" /> Exemplo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 lg:sticky lg:top-4">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-5xl font-bold tabular-nums leading-none">{resultado.nivel}</span>
            <div className="space-y-1">
              <TagFaixa faixa={resultado.dificuldade} />
              <p className="text-xs text-slate-500 tabular-nums">{resultado.pontos} ponto(s) bruto(s)</p>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-slate-500 mb-1">Justificativa</p>
            <p className="text-sm text-slate-700 leading-snug">{resultado.justificativa}</p>
          </div>

          <div>
            <p className="text-[11px] text-slate-500 mb-1.5">Regra a regra</p>
            {resultado.contribuicoes.length === 0 ? (
              <p className="text-xs text-slate-400">Nenhuma regra disparou.</p>
            ) : (
              <ul className="space-y-1">
                {resultado.contribuicoes.map((c, i) => (
                  <li key={`${c.codigo}-${i}`} className="flex items-start justify-between gap-2 text-xs bg-slate-50 rounded px-2 py-1.5">
                    <span className="text-slate-700">{c.detalhe ?? c.rotulo}</span>
                    <span className={`font-semibold tabular-nums shrink-0 ${c.delta > 0 ? "text-rose-600" : "text-emerald-600"}`}>{rotuloDelta(c.delta)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {temAlternativas === 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5">
              Sem alternativas: a regra "só 2 alternativas" penaliza questões sem lista — preencha ao menos 2.
            </p>
          )}
          <div className="text-[11px] text-slate-400 border-t pt-2 space-y-0.5">
            <p>Perfil: <strong className="text-slate-600">{config.rotulo}</strong></p>
            <p>Regras disparadas: {resultado.contribuicoes.length}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
