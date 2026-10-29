/** Aba "Configuração": TODOS os números da heurística viram controles; perfis, áreas e pesos. */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Plus, RotateCcw, Save, Trash2, Upload } from "lucide-react";
import type { ConfigDificuldade, PerfilDificuldade } from "@shared/dificuldade";
import { ListaLinhas, Numero, Secao, Texto } from "./comum";

interface Props {
  config: ConfigDificuldade;
  onChange: (config: ConfigDificuldade) => void;
  perfis: PerfilDificuldade[];
  perfilAtivo: string;
  onAplicarPerfil: (id: string) => void;
  onSalvarPerfil: (nome: string) => void;
  onRemoverPerfil: (id: string) => void;
  onExportar: () => void;
  onImportar: (file: File) => void;
  onRestaurar: () => void;
}

export default function ConfigTab(props: Props) {
  const { config, onChange, perfis, perfilAtivo } = props;
  const regras = config.regras;
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [novoPerfil, setNovoPerfil] = useState("");
  const [novaArea, setNovaArea] = useState("");
  const [novoPeso, setNovoPeso] = useState("");

  const setRegra = <K extends keyof ConfigDificuldade["regras"]>(k: K, patch: Partial<ConfigDificuldade["regras"][K]>) => {
    const atual = regras[k] as unknown as Record<string, unknown>;
    const novo = { ...atual, ...(patch as Record<string, unknown>) };
    onChange({ ...config, regras: { ...regras, [k]: novo } as ConfigDificuldade["regras"] });
  };

  return (
    <div className="space-y-4 max-w-5xl">
      {/* ---------- Perfis ---------- */}
      <Secao titulo="Perfis e portabilidade" descricao="Perfis embutidos, perfis salvos por você e importação/exportação da configuração inteira.">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
          <div className="space-y-1">
            <Label className="text-[11px] text-slate-500 font-normal">Aplicar perfil</Label>
            <Select value={perfilAtivo} onValueChange={props.onAplicarPerfil}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Escolha um perfil" />
              </SelectTrigger>
              <SelectContent>
                {perfis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nome}
                    {p.id.startsWith("custom-") ? " (seu)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">{perfis.find((p) => p.id === perfilAtivo)?.descricao}</p>
          </div>
          <div className="flex gap-2">
            <input ref={arquivoRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onImportar(f); e.target.value = ""; }} />
            <Button variant="outline" size="sm" className="h-9" onClick={props.onExportar}><Download size={14} className="mr-1.5" />Exportar</Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => arquivoRef.current?.click()}><Upload size={14} className="mr-1.5" />Importar</Button>
            <Button variant="outline" size="sm" className="h-9" onClick={props.onRestaurar}><RotateCcw size={14} className="mr-1.5" />Padrão</Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end mt-3">
          <Texto label="Salvar ajustes atuais como perfil" valor={novoPerfil} onChange={setNovoPerfil} placeholder="nome do perfil (ex.: Militar 2027)" />
          <div className="flex gap-2">
            <Button size="sm" className="h-9" disabled={!novoPerfil.trim()} onClick={() => { props.onSalvarPerfil(novoPerfil.trim()); setNovoPerfil(""); }}>
              <Save size={14} className="mr-1.5" />Salvar perfil
            </Button>
            {perfilAtivo.startsWith("custom-") && (
              <Button variant="outline" size="sm" className="h-9 text-rose-600" onClick={() => props.onRemoverPerfil(perfilAtivo)}>
                <Trash2 size={14} className="mr-1.5" />Excluir perfil
              </Button>
            )}
          </div>
        </div>
      </Secao>

      {/* ---------- Geral ---------- */}
      <Secao titulo="Geral" descricao="Pontuação inicial, recorte do nível, faixas das três categorias e normalização de palavras.">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Numero label="Pontos iniciais" valor={config.base.pontos} onChange={(n) => onChange({ ...config, base: { ...config.base, pontos: n } })} />
          <Numero label="Nível mínimo" valor={config.base.min} min={1} onChange={(n) => onChange({ ...config, base: { ...config.base, min: n } })} />
          <Numero label="Nível máximo" valor={config.base.max} min={1} onChange={(n) => onChange({ ...config, base: { ...config.base, max: n } })} />
          <Numero label="Fácil até nível" valor={config.faixas.facilAte} min={1} onChange={(n) => onChange({ ...config, faixas: { ...config.faixas, facilAte: n } })} />
          <Numero label="Média até nível" valor={config.faixas.mediaAte} min={1} onChange={(n) => onChange({ ...config, faixas: { ...config.faixas, mediaAte: n } })} />
          <Numero label="Palavras > N letras" valor={config.normalizacao.minPalavra} onChange={(n) => onChange({ ...config, normalizacao: { ...config.normalizacao, minPalavra: n } })} dica="similaridade de alternativas" />
        </div>
      </Secao>

      {/* ---------- Regras ---------- */}
      <Secao
        titulo="Enunciado (extensão)"
        descricao="Escada: curto abaixo do 1º limiar; acima do 2º soma +1; acima do 3º soma +2."
        ativo={regras.enunciado.ativo}
        onToggle={(v) => setRegra("enunciado", { ativo: v })}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Numero label="Curto: abaixo de (chars)" valor={regras.enunciado.curto.limiar} onChange={(n) => setRegra("enunciado", { curto: { ...regras.enunciado.curto, limiar: n } })} />
          <Numero label="Curto: delta" valor={regras.enunciado.curto.delta} onChange={(n) => setRegra("enunciado", { curto: { ...regras.enunciado.curto, delta: n } })} />
          <Numero label="Longo: acima de (chars)" valor={regras.enunciado.longo.limiar} onChange={(n) => setRegra("enunciado", { longo: { ...regras.enunciado.longo, limiar: n } })} />
          <Numero label="Longo: delta" valor={regras.enunciado.longo.delta} onChange={(n) => setRegra("enunciado", { longo: { ...regras.enunciado.longo, delta: n } })} />
          <Numero label="Muito longo: acima de (chars)" valor={regras.enunciado.muitoLongo.limiar} onChange={(n) => setRegra("enunciado", { muitoLongo: { ...regras.enunciado.muitoLongo, limiar: n } })} />
          <Numero label="Muito longo: delta" valor={regras.enunciado.muitoLongo.delta} onChange={(n) => setRegra("enunciado", { muitoLongo: { ...regras.enunciado.muitoLongo, delta: n } })} />
        </div>
      </Secao>

      <Secao titulo="Texto de apoio" descricao="Texto junto (tabela/citação) maior que o limiar soma pontos." ativo={regras.apoio.ativo} onToggle={(v) => setRegra("apoio", { ativo: v })}>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <Numero label="Limiar (chars)" valor={regras.apoio.limiar} onChange={(n) => setRegra("apoio", { limiar: n })} />
          <Numero label="Delta" valor={regras.apoio.delta} onChange={(n) => setRegra("apoio", { delta: n })} />
        </div>
      </Secao>

      <Secao titulo="Pergunta contextualizada" descricao="Padrões no enunciado (aceita trecho literal ou regex) + complemento que só vale em textos longos." ativo={regras.contextual.ativo} onToggle={(v) => setRegra("contextual", { ativo: v })}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Numero label="Delta" valor={regras.contextual.delta} onChange={(n) => setRegra("contextual", { delta: n })} />
            <Numero label="Complemento a partir de (chars)" valor={regras.contextual.complemento.minChars} onChange={(n) => setRegra("contextual", { complemento: { ...regras.contextual.complemento, minChars: n } })} />
          </div>
          <ListaLinhas
            label="Padrões (um por linha — unidos com | como regex, sem distinção de caixa)"
            itens={regras.contextual.padroes}
            onChange={(lista) => setRegra("contextual", { padroes: lista })}
            placeholder="considere&#10;de acordo com"
          />
          <ListaLinhas
            label="Complemento (vale só acima do chars do complemento)"
            itens={regras.contextual.complemento.padroes}
            onChange={(lista) => setRegra("contextual", { complemento: { ...regras.contextual.complemento, padroes: lista } })}
            linhas={2}
          />
        </div>
      </Secao>

      <Secao titulo="Resposta óbvia" descricao="Uma alternativa completa e as demais vagas: maior > fator × segunda, maior > mínimo e segunda <= máximo." ativo={regras.obvia.ativo} onToggle={(v) => setRegra("obvia", { ativo: v })}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Numero label="Mín. de alternativas" valor={regras.obvia.minAlts} onChange={(n) => setRegra("obvia", { minAlts: n })} />
          <Numero label="Fator (×)" valor={regras.obvia.fator} step={0.1} onChange={(n) => setRegra("obvia", { fator: n })} />
          <Numero label="Maior > (chars)" valor={regras.obvia.minMaior} onChange={(n) => setRegra("obvia", { minMaior: n })} />
          <Numero label="Segunda <= (chars)" valor={regras.obvia.maxSegunda} onChange={(n) => setRegra("obvia", { maxSegunda: n })} />
          <Numero label="Delta" valor={regras.obvia.delta} onChange={(n) => setRegra("obvia", { delta: n })} />
        </div>
      </Secao>

      <Secao titulo="Alternativas elaboradas e parecidas" descricao="2+ alternativas longas somam; 3+ comparadas por Jaccard podem somar mais." ativo={regras.elaboradas.ativo} onToggle={(v) => setRegra("elaboradas", { ativo: v })}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Numero label="Elaborada >= (chars)" valor={regras.elaboradas.minChars} onChange={(n) => setRegra("elaboradas", { minChars: n })} />
          <Numero label="Qtd. mínima (delta)" valor={regras.elaboradas.minQtd} onChange={(n) => setRegra("elaboradas", { minQtd: n })} />
          <Numero label="Delta" valor={regras.elaboradas.delta} onChange={(n) => setRegra("elaboradas", { delta: n })} />
          <Numero label="Parecidas: qtd. mínima" valor={regras.parecidas.minQtd} onChange={(n) => setRegra("parecidas", { minQtd: n })} />
          <Numero label="Similaridade forte >=" valor={regras.parecidas.limiarForte} step={0.05} onChange={(n) => setRegra("parecidas", { limiarForte: n })} />
          <Numero label="Delta forte" valor={regras.parecidas.deltaForte} onChange={(n) => setRegra("parecidas", { deltaForte: n })} />
          <Numero label="Similaridade fraca >=" valor={regras.parecidas.limiarFraco} step={0.05} onChange={(n) => setRegra("parecidas", { limiarFraco: n })} />
          <Numero label="Delta fraco" valor={regras.parecidas.deltaFraco} onChange={(n) => setRegra("parecidas", { deltaFraco: n })} />
        </div>
        <div className="mt-2">
          <button className="text-[11px] text-slate-400 hover:text-slate-600 underline underline-offset-2" onClick={() => setRegra("parecidas", { ativo: !regras.parecidas.ativo })}>
            regra de parecidas: {regras.parecidas.ativo ? "ligada" : "desligada"}
          </button>
        </div>
      </Secao>

      <Secao titulo="Número de alternativas" descricao="Mais alternativas somam; poucas alternativas penalizam (inclusive lista vazia)." ativo={regras.alternativas.ativo} onToggle={(v) => setRegra("alternativas", { ativo: v })}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
          <Numero label="A partir de N (delta)" valor={regras.alternativas.seis.min} onChange={(n) => setRegra("alternativas", { seis: { ...regras.alternativas.seis, min: n } })} />
          <Numero label="Delta +" valor={regras.alternativas.seis.delta} onChange={(n) => setRegra("alternativas", { seis: { ...regras.alternativas.seis, delta: n } })} />
          <Numero label="Até N (delta)" valor={regras.alternativas.duas.max} onChange={(n) => setRegra("alternativas", { duas: { ...regras.alternativas.duas, max: n } })} />
          <Numero label="Delta −" valor={regras.alternativas.duas.delta} onChange={(n) => setRegra("alternativas", { duas: { ...regras.alternativas.duas, delta: n } })} />
        </div>
      </Secao>

      <Secao titulo="Interdisciplinaridade" descricao="Contam as Áreas (abaixo) que tiverem N+ termos no enunciado; 2+ áreas disparam." ativo={regras.interdisciplinar.ativo} onToggle={(v) => setRegra("interdisciplinar", { ativo: v })}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-xl">
          <Numero label="Termos por área >=" valor={regras.interdisciplinar.minAcertosChave} onChange={(n) => setRegra("interdisciplinar", { minAcertosChave: n })} />
          <Numero label="Áreas necessárias >=" valor={regras.interdisciplinar.minAreas} onChange={(n) => setRegra("interdisciplinar", { minAreas: n })} />
          <Numero label="Delta" valor={regras.interdisciplinar.delta} onChange={(n) => setRegra("interdisciplinar", { delta: n })} />
        </div>
      </Secao>

      <div className="grid gap-4 md:grid-cols-2">
        <Secao titulo="Múltiplas corretas" descricao="Mais de uma alternativa marcada como correta." ativo={regras.multiplasCorretas.ativo} onToggle={(v) => setRegra("multiplasCorretas", { ativo: v })}>
          <div className="max-w-[140px]">
            <Numero label="Delta" valor={regras.multiplasCorretas.delta} onChange={(n) => setRegra("multiplasCorretas", { delta: n })} />
          </div>
        </Secao>
        <Secao titulo="Peso de tema" descricao="Assunto/tema com peso na tabela abaixo soma pontos." ativo={regras.pesoTema.ativo} onToggle={(v) => setRegra("pesoTema", { ativo: v })}>
          <div className="max-w-[140px]">
            <Numero label="Delta" valor={regras.pesoTema.delta} onChange={(n) => setRegra("pesoTema", { delta: n })} />
          </div>
        </Secao>
      </div>

      {/* ---------- Áreas ---------- */}
      <Secao titulo="Áreas (interdisciplinaridade)" descricao="Chave da área → termos que contam como pistas (sem distinção de caixa/acento). Duas ou mais áreas no mesmo enunciado disparam a regra.">
        <div className="space-y-3">
          {Object.entries(config.areas).map(([nome, termos]) => (
            <AreaEditor
              key={nome}
              nome={nome}
              termos={termos}
              onRenomear={(novo) => {
                if (!novo || novo === nome) return;
                const areas: Record<string, string[]> = {};
                for (const [k, v] of Object.entries(config.areas)) areas[k === nome ? novo : k] = v;
                onChange({ ...config, areas });
              }}
              onTermos={(lista) => onChange({ ...config, areas: { ...config.areas, [nome]: lista } })}
              onRemover={() => {
                const areas = { ...config.areas };
                delete areas[nome];
                onChange({ ...config, areas });
              }}
            />
          ))}
          <div className="flex gap-2 max-w-md">
            <Input value={novaArea} placeholder="Nova área (ex.: Educação Física)" className="h-8 text-sm" onChange={(e) => setNovaArea(e.target.value)} />
            <Button variant="outline" size="sm" className="h-8 shrink-0" disabled={!novaArea.trim()} onClick={() => { onChange({ ...config, areas: { ...config.areas, [novaArea.trim()]: ["exemplo de termo"] } }); setNovaArea(""); }}>
              <Plus size={14} className="mr-1" />Área
            </Button>
          </div>
        </div>
      </Secao>

      {/* ---------- Pesos de tema ---------- */}
      <Secao titulo="Pesos de tema" descricao='Formato exato: "Assunto > Tema" (ex.: Álgebra > Funções). Peso > 0 soma os pontos do delta. A comparação ignora acento e caixa.'>
        <div className="space-y-2">
          {Object.entries(config.pesoTemas).map(([chave, peso]) => (
            <div key={chave || "(vazio)"} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
              <Input
                defaultValue={chave}
                key={chave}
                placeholder="Assunto > Tema"
                className="h-8 text-sm"
                onBlur={(e) => {
                  const novo = e.target.value.trim();
                  if (novo === chave) return;
                  const pesos: Record<string, number> = {};
                  for (const [k, v] of Object.entries(config.pesoTemas)) if (k !== chave) pesos[k] = v;
                  if (novo) pesos[novo] = peso;
                  onChange({ ...config, pesoTemas: pesos });
                }}
              />
              <Numero label="Peso" valor={peso} onChange={(n) => onChange({ ...config, pesoTemas: { ...config.pesoTemas, [chave]: n } })} />
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600" onClick={() => { const pesos = { ...config.pesoTemas }; delete pesos[chave]; onChange({ ...config, pesoTemas: pesos }); }}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          <div className="flex gap-2 max-w-md pt-1">
            <Input value={novoPeso} placeholder="Assunto > Tema" className="h-8 text-sm" onChange={(e) => setNovoPeso(e.target.value)} />
            <Button variant="outline" size="sm" className="h-8 shrink-0" disabled={!novoPeso.includes(">")} onClick={() => { onChange({ ...config, pesoTemas: { ...config.pesoTemas, [novoPeso.trim()]: 1 } }); setNovoPeso(""); }}>
              <Plus size={14} className="mr-1" />Tema
            </Button>
          </div>
        </div>
      </Secao>
    </div>
  );
}

/** Linha de área: nome editável (commit no sair do campo) + termos em linhas. */
function AreaEditor({ nome, termos, onRenomear, onTermos, onRemover }: { nome: string; termos: string[]; onRenomear: (novo: string) => void; onTermos: (lista: string[]) => void; onRemover: () => void }) {
  const [edicao, setEdicao] = useState(nome);
  return (
    <Card className="border-slate-200 bg-slate-50/60">
      <CardContent className="px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Input value={edicao} className="h-7 text-sm font-medium" onChange={(e) => setEdicao(e.target.value)} onBlur={() => onRenomear(edicao.trim())} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">{termos.length} termos</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 shrink-0" onClick={onRemover}>
            <Trash2 size={14} />
          </Button>
        </div>
        <ListaLinhas label="Termos (um por linha)" itens={termos} onChange={onTermos} linhas={2} />
      </CardContent>
    </Card>
  );
}
