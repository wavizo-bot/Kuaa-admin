/* kuaa — acervo administrativo editorial: prompt, entrada direta da IA, busca e operações locais. */
import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Clipboard, Copy, Download, FileInput, FileJson, ListChecks, Play, Search, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { inferExamRole, isUnresolvedRole } from "@/lib/examMetadata";
import { generateKuaaId, parseKuaaText, serializeKuaaJson, serializeKuaaText, NIVEL_LABELS, parseNivel, type Nivel } from "@/lib/kuaaFormat";
import { APP_VERSION } from "@/version";

type Answer = string;
type Question = { id: number; originalNumber?: string; label: string; text: string; alternatives: { id: string; text: string; kind?: "discursiva"; maxLength?: number; placeholder?: string; pontos?: Record<string, number> }[]; correct: Answer; subject: string; baseText?: string; imageUrl?: string; imageName?: string; imageRequired?: boolean; visualStatus?: "pending" | "needed" | "not_needed"; visualNotes?: string; difficulty?: Difficulty; nivel?: Nivel; type?: QuestionType; expectedAnswer?: string; points?: number; estimatedMinutes?: number; minSelect?: number; maxSelect?: number };
export type ExamRecord = { id: string; title: string; city: string; state: string; year: string; board?: string; booklet?: string; role: string; status: string; questions: Question[]; updatedAt: string; pointsByDifficulty?: Record<Difficulty, number>; ungraded?: boolean; kind?: "prova" | "quiz" | "formulario"; quizFinais?: { id: string; titulo: string; texto: string }[]; quizDesempate?: 1 | 2; formAnonimo?: boolean; aleatorio?: boolean };
type Difficulty = "facil" | "media" | "dificil";
type QuestionType = "unica" | "multipla" | "discursiva";

const EXTRACTION_PROMPT = `Você receberá DOIS PDFs do mesmo concurso: (1) prova/caderno de questões e (2) gabarito. Extraia TODO o conteúdo, sem resumir e sem limitar a quantidade de questões. Retorne APENAS um único JSON válido, sem Markdown, sem comentários e sem texto antes ou depois.

Objetivo: produzir um pacote importável para o app kuaa (estudo de concursos). Preencha TODOS os campos possíveis de identificar no material: cargo, órgão/ente público que oferece a vaga, banca, ano, país, cidade, metodologia (se conseguir enquadrar entre: padrao, tri, fgv, cebraspe), e para cada questão preencha a hierarquia completa matéria > assunto > tema > tópico quando existir no material, além de texto_apoio e dica_estudo quando fizer sentido.

Regra essencial para o campo cargo: ele deve conter SOMENTE o nome de um cargo/função profissional real disputado, por exemplo "Enfermeiro", "Terapeuta Ocupacional", "Pedagogo" ou "Engenheiro Civil". NUNCA use como cargo um número isolado, número de questão, número de prova, código do caderno, "Prova tipo 1", cor da prova, folha de respostas, número do edital ou identificador como "988_CE_01_NS_DM". Antes de responder, faça esta checagem: cargo precisa ter letras e nomear uma profissão, especialidade, emprego público ou função reconhecível.

Para CADA questão da prova, mantenha o número ORIGINAL do caderno, o enunciado completo e TODAS as alternativas. Uma questão normalmente possui 4 a 6 alternativas. Há apenas uma resposta correta, exceto quando o gabarito informar anulação.

Textos-base: detecte qualquer texto, tabela, trecho legal, poema, notícia, caso clínico ou enunciado compartilhado apresentado antes de uma ou mais questões. Copie-o integralmente em "texto_apoio" e repita/associe-o às questões que dependem dele.

Dica de estudo: para cada questão, preencha "dica_estudo" com uma dica prática de como revisar/aprender aquele ponto (ex.: "Troque a palavra feminina por uma masculina. Se resultar em 'ao' ou 'aos', há crase."). Mesmo que o material não traga dica explícita, crie uma baseada no conteúdo da questão.

Hierarquia de matéria: sempre que possível, preencha os 4 níveis em cada questão:
- "materia": disciplina principal (ex.: "Língua Portuguesa", "Matemática", "Conhecimentos Específicos — Enfermeiro")
- "assunto": subgrupo da matéria (ex.: "Sintaxe")
- "tema": subgrupo do assunto (ex.: "Regência")
- "topico": subgrupo do tema (ex.: "Estudo da crase")
Se algum nível não for identificável, deixe vazio, mas sempre preencha "materia".

Gabarito: associe cada resposta à questão correspondente. Use A, B, C, D, E, F ou ANULADA. Se não houver certeza, deixe a alternativa correspondente sem "correta":true para revisão humana.

Contrato JSON obrigatório (formato kuaa/ — novo):
{
  "format":"kuaa/",
  "tipo":"prova",
  "id":"",  // gerado pelo app; deixe vazio
  "origem":"pronta",
  "banca":"...", "orgao":"...", "cargo":"...",
  "ano":2026, "pais":"Brasil", "cidade":"...",
  "metodologia":"padrao",  // padrao | tri | fgv | cebraspe
  "questoes":[
    {
      "id":"", "numeracao":1, "dificuldade":"media", "tempo":1,
      "materia":"...", "assunto":"...", "tema":"...", "topico":"...",
      "enunciado":"enunciado integral",
      "texto_apoio":"texto-base se houver",
      "dica_estudo":"dica prática de revisão",
      "alternativas":[
        {"id":"A01","texto":"...","correta":true},
        {"id":"A02","texto":"...","correta":false}
      ]
    }
  ]
}

O formato anterior (caderno-aprovacao/v1) continua sendo aceito pelo app, mas prefira o novo formato kuaa/ para novas extrações.

Revise a numeração, compare com o gabarito e devolva todos os itens antes de responder.`;

const SYNTHETIC_TITLE = "Estudo para concurso";
const SYNTHETIC_ROLE = "Estudante";
const SYNTHETIC_CITY = "Brasil";
const SYNTHETIC_STATE = "BR";
const SYNTHETIC_BATCH_SIZE = 30; // era 50; reduzido para 30 conforme update.txt (menos cansativo)
const ADMIN_PAGE_SIZE = 10;

const PROFILE_OPTIONS = [
  "Concurso público - nível médio \"Dificuldade padrão para cargos de ensino médio\"",
  "Concurso público - nível superior \"Dificuldade elevada para cargos de ensino superior\"",
  "Concurso público - nível diplomata \"Máxima exigência: enunciados complexos, temas avançados, raciocínio crítico\"",
  "Prova escolar regular (nível básico)",
  "Revista juvenil científica",
  "Revista infanto-juvenil de curiosidade",
  "Quiz de auditório de TV",
  "Provas com pegadinhas linguísticas",
  "Estilo BuzzFeed",
];

// Metodologias de prova (update3.txt §Copiar prompt). Cada uma ajusta o prompt enviado à IA.
// "cebraspe" obriga o campo "Quantidade de alternativas" a 2 (formato Certo/Errado).
type KuaaMethodology = "padrao" | "enem" | "fgv" | "cebraspe";
const METHODOLOGY_OPTIONS: { id: KuaaMethodology; label: string; prompt: string; forceAlternativas?: number }[] = [
  { id: "padrao", label: "Metodologia padrão - 1 acerto, 1 ponto", prompt: "Use enunciados diretos e objetivos. Cada questão vale 1 ponto (ou o peso definido por dificuldade). Metodologia padrão de prova de concurso." },
  { id: "enem", label: "Metodologia ENEM - focada em TRI", prompt: "Siga o estilo ENEM: enunciados longos com contexto, interdisciplinaridade, foco em interpretação. Cada questão deve trazer um caso ou situação que exija aplicar o conhecimento, não apenas memorizar." },
  { id: "fgv", label: "Metodologia FGV - enunciados longos simulando situações reais", prompt: "Siga o estilo FGV: enunciados longos (3-5 parágrafos) simulando situações reais do cotidiano profissional ou do serviço público. Foque em interpretação de texto e aplicação prática do conhecimento, não em memorização. Use casos concretos, historietas ou cenários profissionais." },
  { id: "cebraspe", label: "Metodologia CEBRASPE - formato Certo/Errado", prompt: "Siga o formato CEBRASPE: questões de julgamento (Certo/Errado) com fator de penalização (uma errada anula uma certa). Enunciados objetivos, foco em conhecimento específico. Cada questão deve ter exatamente 2 alternativas: 'Certo' e 'Errado'.", forceAlternativas: 2 },
];

const CREATIVITY_OPTIONS: { id: "baixa" | "media" | "alta" | "irracional"; label: string; helper: string; guidance: string }[] = [
  { id: "baixa", label: "Baixa", helper: "concursos sérios e letra de lei", guidance: "Mantenha um tom sério e formal, próximo da letra da lei e de concursos tradicionais, sem floreios nem contextos inventados." },
  { id: "media", label: "Média", helper: "padrão: exemplos práticos, atualidades", guidance: "Use um tom padrão, evite repetições exaustivas do mesmo modelo de pergunta, insira exemplos práticos e referências a atualidades quando fizer sentido." },
  { id: "alta", label: "Alta", helper: "multidisciplinar, estudos de caso", guidance: "Combine múltiplas disciplinas, construa estudos de caso e situações contextualizadas, evite perguntas diretas e rasas." },
  { id: "irracional", label: "Irracional", helper: "humor, metalinguagem, sem regras", guidance: "Ignore as convenções tradicionais de prova: pode usar humor como foco central, quebrar a quarta parede, se comunicar diretamente com quem está respondendo e recorrer a metalinguagem." },
];

const QUESTION_TYPE_OPTIONS: { id: QuestionType; label: string }[] = [
  { id: "unica", label: "Única escolha (uma resposta correta)" },
  { id: "multipla", label: "Múltipla escolha (mais de uma correta)" },
  { id: "discursiva", label: "Discursiva" },
];

const TIME_OPTIONS = ["Até 1 minuto", "Até 2 minutos", "Até 3 minutos", "Até 4 minutos", "Até 5 minutos"];

const DIFFICULTY_LABELS: Record<Difficulty, string> = { facil: "Fácil", media: "Média", dificil: "Difícil" };

const QUIZ_SKELETON = `{
Quiz: Título do seu quiz (a pergunta que aparece pro estudante)
Tipo: 1
Desempate: 1
Final1_titulo: Nome do primeiro resultado
Final1_texto: Texto mostrado quando esse resultado vence.
Final2_titulo: Nome do segundo resultado
Final2_texto: Texto mostrado quando esse resultado vence.
///
Questao 1: Enunciado da primeira pergunta
Alternativa 1: Texto da primeira alternativa
Final1: 2
Final2: 0
Alternativa 2: Texto da segunda alternativa
Final1: 0
Final2: 2
}`;

// Prompt pronto pra pedir um Quiz de personalidade a qualquer IA de chat (fora do app). Ensina o
// formato de texto (não-JSON) na primeira tentativa, evitando o "cargo profissional" inválido que
// acontecia quando a IA inventava um JSON parecido, mas com um formato levemente diferente do nosso.
const QUIZ_AI_PROMPT = `Crie um quiz de personalidade (aquele estilo "Qual X eu seria?") sobre o tema que vou te passar.

Responda SOMENTE com o texto no formato abaixo — nada de JSON, nada de Markdown, nada de explicação antes ou depois. Comece direto em "{" e termine em "}".

Formato exato a seguir:
{
Quiz: [a pergunta central do quiz, ex: "Qual Ranger eu seria?"]
Tipo: 1
Desempate: 1
Final1_titulo: [nome do 1º resultado possível]
Final1_texto: [texto mostrado a quem tirar esse resultado]
Final2_titulo: [nome do 2º resultado possível]
Final2_texto: [texto mostrado a quem tirar esse resultado]
(repita Final3, Final4... para cada resultado possível — pode ter quantos quiser)
///
Questao 1: [enunciado da pergunta 1]
Alternativa 1: [texto da alternativa]
Final1: [quantos pontos essa alternativa dá pro Final1, pode ser 0]
Final2: [quantos pontos essa alternativa dá pro Final2, pode ser 0]
(repita a linha "FinalN:" pra cada resultado que exista, mesmo que seja 0)
Alternativa 2: [texto da alternativa]
Final1: [pontos]
Final2: [pontos]
(repita "Alternativa" pra cada opção da pergunta — normalmente de 2 a 5)
(repita "Questao 2:", "Questao 3:"... pra cada pergunta do quiz — normalmente de 5 a 10 perguntas)
}

Regras importantes:
- "Tipo: 1" significa que cada pergunta só pode ter uma alternativa marcada (Tipo: 2 seria múltiplas).
- "Desempate: 1" significa que, em caso de empate na pontuação final, vence quem chegou na pontuação máxima primeiro.
- Cada alternativa deve pontuar de forma coerente pro(s) resultado(s) que ela representa, e 0 pros demais.
- Não invente um formato diferente nem responda em JSON — o programa só entende exatamente esse formato de texto.

Tema do quiz: [DESCREVA AQUI o assunto/tema do quiz]
Quantidade de perguntas: [defina um número, ex: 8]
Quantidade de resultados possíveis: [defina um número, ex: 4]`;

const FORM_SKELETON = `{
Formulario: Título do seu formulário
Anonimo: 1
Questao 1@: Pergunta de única escolha (marque só uma)
Alternativa 1: Primeira opção
Alternativa 2: Segunda opção
Questao 2#: Pergunta de múltipla escolha (sem limite de quantas marcar)
Alternativa 1: Primeira opção
Alternativa 2: Segunda opção
Dissertativa 300 [Escreva aqui, se quiser]:
}`;

// ===== Modelos Prompt/Parser para Prova/Quiz/Formulário (update3.txt §Cole o JSON) =====
// Cada tipo tem um Prompt (instruções completas para IA) e um Parser (exemplo de texto kuaa/
// para preencher à mão). Os 6 textos são copiados para a área de transferência.

const PROVA_PROMPT_TEMPLATE = `Crie uma prova completa no formato kuaa/ sobre o tema solicitado.

Retorne APENAS um JSON válido, começando em "{" e terminando em "}", sem Markdown nem texto antes/depois. Preencha TODOS os campos possíveis: banca (use seu nome comercial), orgao, cargo, ano, pais, cidade, metodologia (padrao | tri | fgv | cebraspe), e para cada questão preencha materia, assunto, tema, topico, enunciado, texto_apoio (se houver), dica_estudo e alternativas com id A01/A02/... e "correta":true/false.

Contrato:
{
  "format":"kuaa/",
  "tipo":"prova",
  "id":"",
  "origem":"pronta",
  "banca":"SEU_NOME_COMERCIAL",
  "orgao":"...",
  "cargo":"...",
  "ano":ANO_ATUAL,
  "pais":"Brasil",
  "cidade":"...",
  "metodologia":"padrao",
  "questoes":[
    {
      "id":"",
      "numeracao":1,
      "dificuldade":"media",
      "tempo":1,
      "materia":"...",
      "assunto":"...",
      "tema":"...",
      "topico":"...",
      "enunciado":"enunciado completo",
      "texto_apoio":"",
      "dica_estudo":"dica prática",
      "alternativas":[
        {"id":"A01","texto":"...","correta":true},
        {"id":"A02","texto":"...","correta":false}
      ]
    }
  ]
}

Tema da prova: [DESCREVA AQUI]
Quantidade de questões: [número]
Metodologia desejada: [padrao | tri | fgv | cebraspe]`;

const PROVA_PARSER_TEMPLATE = `{
format: kuaa/
tipo: prova
id: PD20260913H230415
origem: pronta
banca: ChatGPT
orgao: Prefeitura de Exemplo
cargo: Professor de Educação Básica
ano: 2026
pais: Brasil
cidade: Exemplo
metodologia: padrao

///
questao: PD20260913H230415Q001
numeracao: 1
dificuldade: media
tempo: 1
materia: Língua Portuguesa
assunto: Sintaxe
tema: Regência
topico: Estudo da crase
enunciado: Assinale a alternativa que apresenta uso correto da crase.
texto_apoio:
dica_estudo: Troque a palavra feminina por uma masculina. Se resultar em "ao" ou "aos", há crase.

alternativa: A01 | Fui à escola. | correta
alternativa: A02 | Fui a escola. | errada
alternativa: A03 | Fui á escola. | errada
alternativa: A04 | Fui à escola ontem à noite. | correta

///
questao: PD20260913H230415Q002
numeracao: 2
dificuldade: facil
tempo: 1
materia: Matemática
assunto: Aritmética
enunciado: Quanto é 2 + 2?
dica_estudo: Some os dois números.

alternativa: A01 | 3 | errada
alternativa: A02 | 4 | correta
alternativa: A03 | 5 | errada
}`;

const QUIZ_PROMPT_TEMPLATE = `Crie um quiz de personalidade (estilo "Qual X eu seria?") no formato kuaa/.

Retorne APENAS um JSON válido, começando em "{" e terminando em "}", sem Markdown nem texto antes/depois. Defina um título (começando com 🧐), uma temática, finais (cada um com id F01/F02/..., titulo e texto descritivo) e perguntas (id P01/P02/...). Cada alternativa de cada pergunta deve ter "valores" no formato "0,1,0,3" indicando quantos pontos soma para cada final (na ordem dos finais).

Contrato:
{
  "format":"kuaa/",
  "tipo":"quiz",
  "id":"",
  "titulo":"🧐 [pergunta central do quiz]",
  "tematica":"[categoria, ex.: Personalidade]",
  "finais":[
    {"id":"F01","titulo":"[nome do 1º resultado]","texto":"[texto mostrado a quem tirar esse resultado]"},
    {"id":"F02","titulo":"[nome do 2º resultado]","texto":"[texto do 2º resultado]"}
  ],
  "perguntas":[
    {
      "id":"P01",
      "enunciado":"[pergunta]",
      "alternativas":[
        {"id":"A01","texto":"[texto da alternativa]","valores":"0,1,0"},
        {"id":"A02","texto":"[texto da alternativa]","valores":"1,0,0"}
      ]
    }
  ]
}

Tema do quiz: [DESCREVA AQUI]
Quantidade de perguntas: [número, ex: 8]
Quantidade de resultados possíveis: [número, ex: 4]`;

const QUIZ_PARSER_TEMPLATE = `{
format: kuaa/
tipo: quiz
id: QD20260913H235642
titulo: 🧐Qual docinho de festa você é?
tematica: Personalidade

///
// FINAIS
final: F01 | 🍫 BRIGADEIRO — Você achou que era o favorito? Achou errado!
final_texto: F01 | Você é o Brigadeiro que todo mundo come com os olhos, mas ninguém lembra depois da festa.

final: F02 | 🍬 BEIJINHO — Você é discreto, mas inesquecível.
final_texto: F02 | Você é o Beijinho de coco. Não chama atenção, mas quem prova nunca esquece.

final: F03 | 🥥 COCO QUEIMADO — Você é autêntico e não se importa com opinião alheia.
final_texto: F03 | Você é o Coco Queimado. Tem personalidade forte e não se molda para agradar.

///
// PERGUNTAS
pergunta: P01
enunciado: Se pudesse resumir seu papel numa briga, seria:
alternativa: A01 | Eu ataco primeiro, penso depois | valores: 0,1,0
alternativa: A02 | Eu tento resolver na conversa | valores: 1,0,0
alternativa: A03 | Eu chamo meus amigos para ajudar | valores: 0,0,1

pergunta: P02
enunciado: Qual seu tipo de festa ideal?
alternativa: A01 | Balada até o sol nascer | valores: 0,1,0
alternativa: A02 | Jantar íntimo com amigos | valores: 1,0,0
alternativa: A03 | Churrasco com a família | valores: 0,0,1
}`;

const FORM_PROMPT_TEMPLATE = `Crie um formulário de pesquisa no formato kuaa/.

Retorne APENAS um JSON válido, começando em "{" e terminando em "}", sem Markdown nem texto antes/depois. Defina um título (começando com 📝), anonimato (true/false), e perguntas (id dados01/dados02/...). Cada pergunta tem enunciado, minimo, maximo e alternativas (id alt01/alt02/... com texto) ou discursivas (id disc01/disc02/... com limite de caracteres e placeholder).

Contrato:
{
  "format":"kuaa/",
  "tipo":"formulario",
  "id":"",
  "titulo":"📝 [título do formulário]",
  "anonimato":true,
  "perguntas":[
    {
      "id":"dados01",
      "enunciado":"[pergunta]",
      "minimo":1,
      "maximo":1,
      "alternativas":[
        {"id":"alt01","texto":"[primeira opção]"},
        {"id":"alt02","texto":"[segunda opção]"},
        {"id":"disc01","tipo":"discursiva","limite":500,"placeholder":""}
      ]
    }
  ]
}

Tema do formulário: [DESCREVA AQUI]
Quantidade de perguntas: [número]`;

const FORM_PARSER_TEMPLATE = `{
format: kuaa/
tipo: formulario
id: FD20260913H001607
titulo: 📝Levantamento de Vulnerabilidade Social e de Saúde
anonimato: permitido

///
pergunta: dados01
enunciado: Selecione a sua idade:
minimo: 1
maximo: 1
alternativa: alt01 | 18 a 24 anos
alternativa: alt02 | 25 a 39 anos
alternativa: alt03 | 40 a 59 anos
alternativa: alt04 | 60 anos ou mais

///
pergunta: dados02
enunciado: Quais serviços de saúde você utiliza?
minimo: 0
maximo: 3
alternativa: alt01 | UBS
alternativa: alt02 | UPA
alternativa: alt03 | Hospital
alternativa: alt04 | Clínica particular
discursiva: disc01 | 250 | Outro serviço, especifique:

///
pergunta: dados03
enunciado: Observações adicionais:
minimo: 0
maximo: 0
discursiva: disc01 | 1000 | Deixe suas observações aqui
}`;

function buildCustomSyntheticPrompt(config: { profile: string; subject: string; plan: Record<Difficulty, { quantity: number; points: number }>; creativity: "baixa" | "media" | "alta" | "irracional"; types: QuestionType[]; timeLabel: string; timeAiSuggests: boolean; customRules: string; methodology: KuaaMethodology; alternativasCount: number; alternativasAiSuggests: boolean; mode: "lote" | "prova" }) {
  const totalQuestions = (Object.keys(config.plan) as Difficulty[]).reduce((sum, key) => sum + (config.plan[key].quantity || 0), 0);
  const distributionText = (Object.keys(config.plan) as Difficulty[]).filter((key) => config.plan[key].quantity > 0).map((key) => `${config.plan[key].quantity} ${DIFFICULTY_LABELS[key].toLowerCase()}(is)`).join(", ") || "nenhuma quantidade definida ainda";
  const creativity = CREATIVITY_OPTIONS.find((item) => item.id === config.creativity) || CREATIVITY_OPTIONS[1];
  const methodology = METHODOLOGY_OPTIONS.find((item) => item.id === config.methodology) || METHODOLOGY_OPTIONS[0];
  const typeLabels = config.types.map((id) => QUESTION_TYPE_OPTIONS.find((item) => item.id === id)?.label || id).join(", ") || "única escolha";
  const timeInstruction = config.timeAiSuggests ? `Para cada questão, informe também um campo "tempo" (número inteiro de minutos) com o tempo que você estima ser necessário para respondê-la.` : `Todas as questões devem ser respondíveis dentro do tempo de ${config.timeLabel.toLowerCase()}; ajuste a complexidade do enunciado para caber nesse tempo. Informe o campo "tempo" em cada questão com esse valor.`;
  const alternativasInstruction = config.alternativasAiSuggests
    ? `A quantidade de alternativas por questão fica a critério da IA — use entre 2 e 6 alternativas conforme fizer sentido para cada questão.`
    : `Cada questão deve ter EXATAMENTE ${config.alternativasCount} alternativas.`;
  const rules = config.customRules.trim() ? `\n\nRegras adicionais definidas pelo solicitante: ${config.customRules.trim()}` : "";
  const isProvaMode = config.mode === "prova";
  const origemInstruction = isProvaMode
    ? `Esta resposta será importada como uma PROVA SINTÉTICA completa — preencha "origem":"sintetica" no JSON e NÃO use "synthetic":true (esse modo é para lote parcial).`
    : `Esta resposta será importada como LOTE PARCIAL — preencha "synthetic":true no JSON para que o app acumule as questões em um banco sintético.`;

  return `Você é uma banca elaboradora de questões para o perfil "${config.profile}". Crie EXATAMENTE ${totalQuestions} questões sobre a matéria: "${config.subject}", distribuídas assim por dificuldade: ${distributionText}. Marque em cada questão o campo "dificuldade" como exatamente "facil", "media" ou "dificil", de acordo com a dificuldade pretendida para ela.

Metodologia (${methodology.label}): ${methodology.prompt}

Tom e criatividade (nível ${creativity.label.toLowerCase()}): ${creativity.guidance}

Tipos de questão permitidos nesta solicitação: ${typeLabels}. IMPORTANTE: gere SOMENTE questões dos tipos listados acima. Para questões de única escolha, marque apenas UMA alternativa com "correta":true. Para múltipla escolha, marque uma ou mais. Para discursivas, "alternativas" deve ser lista vazia e preencha "dica_estudo" com a resposta-modelo.

${alternativasInstruction}

${timeInstruction}

Para cada questão, preencha TODOS os campos possíveis do formato kuaa/:
- "materia": a matéria principal (no mínimo; se souber, preencha também "assunto", "tema", "topico" para hierarquizar)
- "dica_estudo": uma dica prática sobre como estudar/revisar aquele ponto (ex.: "Troque a palavra feminina por uma masculina. Se resultar em 'ao' ou 'aos', há crase.")
- "texto_apoio": se a questão depender de texto-base, trecho de lei ou caso, preencha aqui
- "enunciado": o enunciado completo
- "alternativas": lista com id (A01, A02, ...), texto e "correta":true/false

Use "materia" exatamente "${config.subject}" em todas as questões, sem complementos, para que o programa acumule este banco corretamente. Varie os enunciados sem repetir a mesma habilidade de forma disfarçada.${rules}

Antes de responder, identifique qual é o ano atual e preencha esse ano, com quatro dígitos, no campo "ano" do JSON.

Todas as perguntas devem ser autorais e autossuficientes. Não use imagens externas nem referências a questões anteriores. Revise coerência e gabarito antes de responder.

Banca e cargo: se o conteúdo for de ANO LETIVO escolar (5º ao 9º ano do Ensino Fundamental ou 1º ao 3º do Ensino Médio), preencha "banca" com "Ensino Fundamental" (5º-9º) ou "Ensino Médio" (1º-3º EM) — NUNCA com o nome de uma IA — e preencha "cargo" com o ano exato ("Estudante 5º EF", "Estudante 9º EF", "Estudante 1º EM", ..., "Estudante 3º EM"). Para conteúdo de concurso/vestibular cuja banca oficial exista, use o nome dessa banca em "banca". Só use o seu nome comercial (por exemplo "ChatGPT", "Claude", "Gemini" ou "Microsoft Copilot") quando nenhum dos casos acima se aplicar. Não escreva o texto literal "NOME_DA_IA" e não peça essa informação ao usuário.

${origemInstruction}

Retorne APENAS um JSON válido no formato kuaa/, começando direto em "{" e terminando em "}", sem Markdown, sem blocos de código (não use \`\`\`), sem comentários e sem nenhum texto antes ou depois, seguindo este contrato:
{
  "format":"kuaa/",
  "tipo":"prova",
  "id":"",${isProvaMode ? "" : `\n  "synthetic":true,`}
  "origem":"${isProvaMode ? "sintetica" : "manual"}",
  "banca":"SEU_NOME_COMERCIAL",
  "cargo":"${SYNTHETIC_ROLE}",
  "ano":ANO_ATUAL,
  "pais":"${SYNTHETIC_STATE}",
  "cidade":"${SYNTHETIC_CITY}",
  "metodologia":"${config.methodology === "padrao" ? "padrao" : config.methodology === "enem" ? "tri" : config.methodology === "fgv" ? "fgv" : "cebraspe"}",
  "questoes":[
    {
      "id":"",
      "numeracao":1,
      "dificuldade":"facil",
      "tempo":1,
      "materia":"${config.subject}",
      "assunto":"",
      "tema":"",
      "topico":"",
      "enunciado":"enunciado completo",
      "texto_apoio":"",
      "dica_estudo":"dica prática de estudo",
      "alternativas":[
        {"id":"A01","texto":"...","correta":true},
        {"id":"A02","texto":"...","correta":false}
      ]
    }
  ]
}`;
}


function syntheticBucket(question: Question, declaredSubject: string) {
  const subject = question.subject.trim();
  if (/^matem[aá]tica\b/i.test(subject)) return "Matemática";
  if (/^(l[ií]ngua\s+)?portugu[eê]s\b/i.test(subject)) return "Língua Portuguesa";
  return declaredSubject || subject || "Questões gerais";
}

function isSyntheticExam(exam: ExamRecord) {
  return exam.booklet?.startsWith("Banco sintético") || (exam.title === SYNTHETIC_TITLE && exam.role === SYNTHETIC_ROLE);
}

function fingerprint(exam: ExamRecord) { return [exam.role, exam.city, exam.state, exam.year, exam.board, exam.booklet].map((item) => (item || "").trim().toLowerCase()).join("|"); }

// Nome visível da prova: "Cargo · Assunto · lote #" (ou variações sem cargo / com vários assuntos).
// Preserva o número de lote já atribuído à prova; só assina um novo número quando ela ainda não tem um.
function subjectsOf(exam: ExamRecord): string[] { return Array.from(new Set(exam.questions.map((question) => question.subject.trim()).filter(Boolean))); }
function cargoLabelOf(exam: ExamRecord): string | null { return exam.role && exam.role !== SYNTHETIC_ROLE && !isUnresolvedRole(exam.role) ? exam.role : null; }
function baseTitleOf(exam: ExamRecord): string { const subjects = subjectsOf(exam); const subjectPart = subjects.length === 1 ? subjects[0] : "Abrangente"; const cargo = cargoLabelOf(exam); return cargo ? `${cargo} · ${subjectPart}` : subjectPart; }
function retitleExam(exam: ExamRecord, allExams: ExamRecord[]): string {
  const base = baseTitleOf(exam);
  const existingLote = exam.title.match(/lote\s*(\d+)\s*$/i);
  if (existingLote) return `${base} · lote ${existingLote[1]}`;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped} · lote(\\d+)$`);
  const maxLote = allExams.filter((item) => item.id !== exam.id).reduce((max, item) => { const found = item.title.match(pattern); return found ? Math.max(max, Number(found[1])) : max; }, 0);
  return `${base} · lote ${maxLote + 1}`;
}

type TemplateAlt = { id: string; text: string; kind?: "discursiva"; maxLength?: number; placeholder?: string; markedCorrect?: boolean; markedIncorrect?: boolean };
type TemplateQuestionDraft = { number: string; points?: number; subject: string; estimatedMinutes?: number; difficulty?: Difficulty; statement: string; baseText: string; alternatives: TemplateAlt[] };

// Parser do "template de texto": permite criar uma prova colando um bloco { ... } estruturado,
// sem depender de IA. Sintaxe e regras completas na Seção 3.4 do relatório do produto.
// Parser do Quiz de personalidade: várias questões, cada alternativa soma pontos para um ou mais
// finais; ao terminar, vence o final com mais pontos (critério de desempate configurável).
function parseQuizText(raw: string): ExamRecord {
  const openIndex = raw.indexOf("{");
  const closeIndex = raw.lastIndexOf("}");
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) throw new Error('O texto precisa estar todo entre chaves "{" e "}".');
  const lines = raw.slice(openIndex + 1, closeIndex).split(/\r?\n/);

  let quizTitle = "";
  let tipo: 1 | 2 = 1;
  let desempate: 1 | 2 = 1;
  const finaisMap = new Map<string, { titulo: string; texto: string }>();
  type QuizAlt = { id: string; text: string; pontos: Record<string, number> };
  type QuizDraft = { number: string; text: string; alternatives: QuizAlt[] };
  const drafts: QuizDraft[] = [];
  let current: QuizDraft | null = null;
  let currentAlt: QuizAlt | null = null;

  const topRegex = /^(Quiz|Tipo|Desempate)\s*:\s*(.*)$/i;
  const finalFieldRegex = /^Final(\d+)_(titulo|texto)\s*:\s*(.*)$/i;
  const questionRegex = /^Quest[aã]o\s*(\d+)\s*:\s*(.*)$/i;
  const altRegex = /^Alternativa\s*(\d+)\s*:\s*(.*)$/i;
  const pontosRegex = /^Final(\d+)\s*:\s*(-?\d+)\s*$/i;

  for (const originalLine of lines) {
    const trimmed = originalLine.trim();
    if (trimmed.startsWith("///") || !trimmed) continue;
    let match: RegExpMatchArray | null;
    if ((match = trimmed.match(finalFieldRegex))) {
      const key = `final${match[1]}`;
      const entry = finaisMap.get(key) || { titulo: "", texto: "" };
      if (match[2].toLowerCase() === "titulo") entry.titulo = match[3].trim(); else entry.texto = match[3].trim();
      finaisMap.set(key, entry);
      continue;
    }
    if ((match = trimmed.match(questionRegex))) {
      if (current) drafts.push(current);
      current = { number: match[1], text: match[2].trim(), alternatives: [] };
      currentAlt = null;
      continue;
    }
    if ((match = trimmed.match(altRegex))) {
      if (!current) throw new Error("Encontrei uma alternativa antes de qualquer questão.");
      currentAlt = { id: String.fromCharCode(65 + current.alternatives.length), text: match[2].trim(), pontos: {} };
      current.alternatives.push(currentAlt);
      continue;
    }
    if ((match = trimmed.match(pontosRegex))) {
      if (!currentAlt) throw new Error("Encontrei uma pontuação de final antes de qualquer alternativa.");
      currentAlt.pontos[`final${match[1]}`] = Number(match[2]);
      continue;
    }
    if ((match = trimmed.match(topRegex))) {
      const key = match[1].toLowerCase();
      if (key === "quiz") quizTitle = match[2].trim();
      else if (key === "tipo") tipo = match[2].trim().startsWith("2") ? 2 : 1;
      else if (key === "desempate") desempate = match[2].trim().startsWith("2") ? 2 : 1;
      continue;
    }
    if (currentAlt) currentAlt.text += (currentAlt.text ? "\n" : "") + trimmed;
    else if (current) current.text += (current.text ? "\n" : "") + trimmed;
  }
  if (current) drafts.push(current);

  if (!quizTitle) throw new Error('Campo "Quiz" (o título/pergunta) é obrigatório.');
  if (!finaisMap.size) throw new Error('Nenhum final foi definido (use "Final1_titulo:" e "Final1_texto:").');
  if (!drafts.length) throw new Error("Nenhuma questão foi reconhecida no texto.");
  for (const draft of drafts) if (draft.alternatives.length < 2) throw new Error(`Questão ${draft.number}: precisa de ao menos 2 alternativas.`);

  const finais = Array.from(finaisMap.entries()).map(([id, value]) => ({ id, titulo: value.titulo || id, texto: value.texto || "" }));
  const questions: Question[] = drafts.map((draft, index) => ({ id: index + 1, originalNumber: draft.number, label: `Questão ${draft.number}`, text: draft.text, alternatives: draft.alternatives.map((alt) => ({ id: alt.id, text: alt.text, pontos: alt.pontos })), correct: "", subject: "", type: tipo === 2 ? "multipla" : "unica" }));

  return { id: `quiz-${Date.now()}`, title: quizTitle, city: "", state: "", year: "", board: "", booklet: "", role: quizTitle, status: "Revisão pendente", questions, updatedAt: new Date().toISOString(), kind: "quiz", quizFinais: finais, quizDesempate: desempate };
}

// Parser do Formulário: perguntas de única/múltipla escolha (com limites configuráveis) e campos
// dissertativos; gera estatísticas locais, sem gabarito.
function parseFormText(raw: string): ExamRecord {
  const openIndex = raw.indexOf("{");
  const closeIndex = raw.lastIndexOf("}");
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) throw new Error('O texto precisa estar todo entre chaves "{" e "}".');
  const lines = raw.slice(openIndex + 1, closeIndex).split(/\r?\n/);

  let title = "";
  let anonimo = false;
  type FormAlt = { id: string; text: string; kind?: "discursiva"; maxLength?: number; placeholder?: string };
  type FormDraft = { number: string; mode: "unica" | "multipla"; minSelect?: number; maxSelect?: number; text: string; alternatives: FormAlt[] };
  const drafts: FormDraft[] = [];
  let current: FormDraft | null = null;

  const topRegex = /^(Formul[aá]rio)\s*:\s*(.*)$/i;
  const anonRegex = /^An[oô]nimo\s*:\s*(.*)$/i;
  const questionRegex = /^Quest[aã]o\s*(\d+)\s*(?:(@|#)(\d*))?\s*:\s*(.*)$/i;
  const altRegex = /^Alternativa\s*(\d+)\s*:\s*(.*)$/i;
  const dissertativaRegex = /^Dissertativa\s*(\d+)\s*(?:\[([^\]]*)\])?\s*:\s*(.*)$/i;

  for (const originalLine of lines) {
    const trimmed = originalLine.trim();
    if (trimmed.startsWith("///") || !trimmed) continue;
    let match: RegExpMatchArray | null;
    if ((match = trimmed.match(questionRegex))) {
      if (current) drafts.push(current);
      const symbol = match[2];
      const count = match[3] ? Number(match[3]) : undefined;
      let mode: "unica" | "multipla" = "multipla";
      let minSelect: number | undefined;
      let maxSelect: number | undefined;
      if (symbol === "@") { if (count && count > 1) { mode = "multipla"; minSelect = count; maxSelect = count; } else { mode = "unica"; minSelect = 1; maxSelect = 1; } }
      else { mode = "multipla"; minSelect = 0; maxSelect = count; }
      current = { number: match[1], mode, minSelect, maxSelect, text: match[4].trim(), alternatives: [] };
      continue;
    }
    if ((match = trimmed.match(altRegex))) {
      if (!current) throw new Error("Encontrei uma alternativa antes de qualquer questão.");
      current.alternatives.push({ id: String.fromCharCode(65 + current.alternatives.length), text: match[2].trim() });
      continue;
    }
    if ((match = trimmed.match(dissertativaRegex))) {
      if (!current) throw new Error("Encontrei um campo Dissertativa antes de qualquer questão.");
      current.alternatives.push({ id: String.fromCharCode(65 + current.alternatives.length), text: "", kind: "discursiva", maxLength: Number(match[1]), placeholder: match[2] || undefined });
      continue;
    }
    if ((match = trimmed.match(anonRegex))) { anonimo = match[1].trim() === "1"; continue; }
    if ((match = trimmed.match(topRegex))) { title = match[2].trim(); continue; }
    if (current) current.text += (current.text ? "\n" : "") + trimmed;
  }
  if (current) drafts.push(current);

  if (!title) throw new Error('Campo "Formulario" (o título) é obrigatório.');
  if (!drafts.length) throw new Error("Nenhuma questão foi reconhecida no texto.");
  for (const draft of drafts) if (!draft.alternatives.length) throw new Error(`Questão ${draft.number}: precisa de ao menos 1 alternativa ou campo Dissertativa.`);

  const questions: Question[] = drafts.map((draft, index) => ({ id: index + 1, originalNumber: draft.number, label: `Questão ${draft.number}`, text: draft.text, alternatives: draft.alternatives, correct: "", subject: "", type: draft.mode, minSelect: draft.minSelect, maxSelect: draft.maxSelect }));

  return { id: `form-${Date.now()}`, title, city: "", state: "", year: "", board: "", booklet: "", role: title, status: "Revisão pendente", questions, updatedAt: new Date().toISOString(), kind: "formulario", formAnonimo: anonimo };
}

function parseTemplateText(raw: string, existingExams: ExamRecord[]): ExamRecord {
  const openIndex = raw.indexOf("{");
  const closeIndex = raw.lastIndexOf("}");
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) throw new Error('O texto precisa estar todo entre chaves "{" e "}".');
  const lines = raw.slice(openIndex + 1, closeIndex).split(/\r?\n/);

  const topFieldRegex = /^(Cargo|Banca|Modelo)\s*:\s*(.*)$/i;
  const questionHeaderRegex = /^Quest[aã]o\s*(\d+)\s*(#|@)\s*(\d*)\s*:\s*(.*)$/i;
  const questionFieldRegex = /^(Assunto|Tempo|Dificuldade|Enunciado|Texto)\s*:\s*(.*)$/i;
  const respostaRegex = /^Resposta\s*(\d+)\s*(?:(@|#|D(\d+)(\[[^\]]*\])?))?\s*:\s*(.*)$/i;

  let cargo = "";
  let banca = "";
  let modelo: 1 | 2 | null = null;
  const drafts: TemplateQuestionDraft[] = [];
  let current: TemplateQuestionDraft | null = null;
  let pendingField: string | null = null;
  const finishQuestion = () => { if (current) drafts.push(current); current = null; };

  for (const originalLine of lines) {
    const trimmed = originalLine.trim();
    if (trimmed.startsWith("///")) continue;
    if (!trimmed) {
      if (current && (pendingField === "Enunciado" || pendingField === "Texto")) { const key = pendingField === "Enunciado" ? "statement" : "baseText"; current[key] += "\n"; }
      continue;
    }
    let match: RegExpMatchArray | null;
    if ((match = trimmed.match(questionHeaderRegex))) {
      finishQuestion();
      const [, number, suffix, pointsRaw] = match;
      current = { number, points: pointsRaw ? Number(pointsRaw) : undefined, subject: "", statement: "", baseText: "", alternatives: [] };
      if (suffix === "@" && pointsRaw) throw new Error(`Questão ${number}: o sufixo "@" não leva valor de pontos (só "#" leva).`);
      pendingField = null;
      continue;
    }
    if ((match = trimmed.match(respostaRegex))) {
      if (!current) throw new Error('Encontrei uma "Resposta" antes de qualquer "Questão" ser declarada.');
      const [, , suffixFull, discLimit, discPlaceholderRaw, text] = match;
      const id = String.fromCharCode(65 + current.alternatives.length);
      if (suffixFull && suffixFull.toUpperCase().startsWith("D")) current.alternatives.push({ id, text: (text || "").trim(), kind: "discursiva", maxLength: discLimit ? Number(discLimit) : undefined, placeholder: discPlaceholderRaw ? discPlaceholderRaw.slice(1, -1) : undefined });
      else current.alternatives.push({ id, text: (text || "").trim(), markedCorrect: suffixFull === "#", markedIncorrect: suffixFull === "@" });
      pendingField = `Resposta${current.alternatives.length}`;
      continue;
    }
    if (current && (match = trimmed.match(questionFieldRegex))) {
      const [, name, value] = match;
      const key = name.toLowerCase();
      if (key === "assunto") current.subject = value.trim();
      else if (key === "tempo") current.estimatedMinutes = Number(value.trim()) || undefined;
      else if (key === "dificuldade") current.difficulty = value.trim() === "1" ? "facil" : value.trim() === "3" ? "dificil" : "media";
      else if (key === "enunciado") current.statement = value.trim();
      else if (key === "texto") current.baseText = value.trim();
      pendingField = name[0].toUpperCase() + name.slice(1).toLowerCase();
      continue;
    }
    if (!current && (match = trimmed.match(topFieldRegex))) {
      const [, name, value] = match;
      const key = name.toLowerCase();
      if (key === "cargo") cargo = value.trim();
      else if (key === "banca") banca = value.trim();
      else if (key === "modelo") modelo = value.trim().startsWith("2") ? 2 : 1;
      pendingField = null;
      continue;
    }
    if (current && pendingField === "Enunciado") current.statement += (current.statement ? "\n" : "") + trimmed;
    else if (current && pendingField === "Texto") current.baseText += (current.baseText ? "\n" : "") + trimmed;
    else if (current && pendingField?.startsWith("Resposta") && current.alternatives.length) { const last = current.alternatives[current.alternatives.length - 1]; last.text += (last.text ? "\n" : "") + trimmed; }
  }
  finishQuestion();

  if (!modelo) throw new Error('Campo "Modelo" é obrigatório (1 = Prova Comum, 2 = Questionário/Formulário).');
  if (!drafts.length) throw new Error("Nenhuma questão foi reconhecida no texto.");

  const finalQuestions: Question[] = drafts.map((draft, index) => {
    if (!draft.subject) throw new Error(`Questão ${draft.number}: o campo "Assunto" é obrigatório.`);
    if (!draft.difficulty) throw new Error(`Questão ${draft.number}: o campo "Dificuldade" é obrigatório (1, 2 ou 3).`);
    if (!draft.statement) throw new Error(`Questão ${draft.number}: o campo "Enunciado" é obrigatório.`);
    const correctIds = draft.alternatives.filter((alt) => alt.markedCorrect).map((alt) => alt.id);
    const discursivaOnly = draft.alternatives.length > 0 && draft.alternatives.every((alt) => alt.kind === "discursiva");
    if (modelo === 1) {
      const countableAlternatives = draft.alternatives.filter((alt) => alt.kind !== "discursiva").length;
      const hasDiscursiva = draft.alternatives.some((alt) => alt.kind === "discursiva");
      if (!((correctIds.length && countableAlternatives >= 2) || hasDiscursiva)) throw new Error(`Questão ${draft.number}: Modelo 1 exige ao menos 1 resposta correta ("#") e 2 alternativas no total, ou 1 campo discursivo ("D").`);
    } else if (!draft.alternatives.length) throw new Error(`Questão ${draft.number}: Modelo 2 exige ao menos 1 resposta definida.`);
    const type: QuestionType = discursivaOnly ? "discursiva" : correctIds.length > 1 ? "multipla" : "unica";
    return { id: index + 1, originalNumber: draft.number, label: `Questão ${draft.number}`, text: draft.statement, alternatives: draft.alternatives.map(({ markedCorrect, markedIncorrect, ...alt }) => alt), correct: correctIds.join(""), subject: draft.subject, baseText: draft.baseText || undefined, difficulty: draft.difficulty, type, points: draft.points, estimatedMinutes: draft.estimatedMinutes, visualStatus: "not_needed" };
  });

  const subjects = Array.from(new Set(finalQuestions.map((question) => question.subject)));
  const baseTitle = cargo || (subjects.length === 1 ? subjects[0] : "") || (modelo === 1 ? "Prova" : "Formulário");
  const lotePattern = new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} - lote(\\d+)$`);
  const lastLote = existingExams.reduce((max, exam) => { const found = exam.title.match(lotePattern); return found ? Math.max(max, Number(found[1])) : max; }, 0);
  const [bancaBoard, bancaCity, bancaYear] = banca.split(",").map((part) => part.trim());
  const role = inferExamRole({ role: cargo, evidence: finalQuestions.map((question) => ({ subject: question.subject, text: question.text })) });

  return { id: `texto-${Date.now()}`, title: `${baseTitle} - lote${lastLote + 1}`, city: bancaCity || "Não informado", state: "", year: bancaYear || "", board: bancaBoard || "", role, status: "Revisão pendente", questions: finalQuestions, updatedAt: new Date().toISOString(), ungraded: modelo === 2 };
}

// Quiz e Formulário não têm "cargo profissional" de verdade — o campo role neles é só um rótulo.
// Quando a IA (ou um pacote já exportado) entrega o JSON pronto nesse formato (raw.kind já vem
// "quiz" ou "formulario"), usamos essa função em vez de normalize(), pulando totalmente a
// validação de cargo, que só faz sentido para provas de verdade.
function hydrateDirectExam(raw: Record<string, unknown>, fallbackId: string): ExamRecord {
  const kind = raw.kind === "quiz" ? "quiz" as const : "formulario" as const;
  const fallbackTitle = kind === "quiz" ? "Quiz" : "Formulário";
  const questions: Question[] = Array.isArray(raw.questions) ? (raw.questions as Record<string, unknown>[]).map((item, index) => {
    const alternatives = Array.isArray(item.alternatives) ? (item.alternatives as Record<string, unknown>[]).map((alt) => ({ id: String(alt.id || ""), text: String(alt.text || ""), kind: alt.kind === "discursiva" ? "discursiva" as const : undefined, maxLength: typeof alt.maxLength === "number" ? alt.maxLength : undefined, placeholder: typeof alt.placeholder === "string" ? alt.placeholder : undefined, pontos: alt.pontos && typeof alt.pontos === "object" ? alt.pontos as Record<string, number> : undefined })).filter((alt) => alt.id) : [];
    const type = ["unica", "multipla", "discursiva"].includes(String(item.type)) ? (item.type as QuestionType) : "unica";
    return { id: Number(item.id) || index + 1, originalNumber: String(item.originalNumber || item.id || index + 1), label: String(item.label || `Questão ${index + 1}`), text: String(item.text || ""), alternatives, correct: String(item.correct || ""), subject: String(item.subject || ""), type, minSelect: typeof item.minSelect === "number" ? item.minSelect : undefined, maxSelect: typeof item.maxSelect === "number" ? item.maxSelect : undefined };
  }) : [];
  const title = String(raw.title || fallbackTitle);
  return { id: String(raw.id || fallbackId), title, city: String(raw.city || ""), state: String(raw.state || ""), year: String(raw.year || ""), board: String(raw.board || ""), booklet: String(raw.booklet || ""), role: String(raw.role || title), status: String(raw.status || "Revisão pendente"), questions, updatedAt: new Date().toISOString(), kind, quizFinais: Array.isArray(raw.quizFinais) ? (raw.quizFinais as Record<string, unknown>[]).map((item) => ({ id: String(item.id || ""), titulo: String(item.titulo || ""), texto: String(item.texto || "") })) : undefined, quizDesempate: raw.quizDesempate === 2 ? 2 : raw.quizDesempate === 1 ? 1 : undefined, formAnonimo: typeof raw.formAnonimo === "boolean" ? raw.formAnonimo : undefined };
}

function normalize(raw: Record<string, unknown>, fallback: string): ExamRecord {
  const source = (raw.exam && typeof raw.exam === "object" ? raw.exam : raw) as Record<string, unknown>;
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).map((item, index) => {
    const value = item as Record<string, unknown>;
    const alternatives = Array.isArray(value.alternatives) ? value.alternatives.map((alternative) => { const option = alternative as Record<string, unknown>; return { id: String(option.id || ""), text: String(option.text || "") }; }).filter((item) => item.id) : [];
    const number = String(value.number || value.originalNumber || index + 1);
    const answer = String(value.correctAnswer || value.correct || "");
    const visualStatus: NonNullable<Question["visualStatus"]> = value.visualStatus === "needed" || value.visualStatus === "not_needed" ? value.visualStatus : "pending";
    const difficulty = ["facil", "media", "dificil"].includes(String(value.difficulty)) ? (value.difficulty as Difficulty) : undefined;
    const nivel = parseNivel(value.dificuldade_nivel ?? value.nivel) ?? (difficulty ? (difficulty === "facil" ? 2 : difficulty === "dificil" ? 4 : 3) : undefined);
    const type = ["unica", "multipla", "discursiva"].includes(String(value.type)) ? (value.type as QuestionType) : "unica";
    return { id: Number(value.id) || index + 1, originalNumber: number, label: `Questão ${number}`, text: String(value.statement || value.text || ""), alternatives, correct: (["A", "B", "C", "D", "E", "F", "ANULADA"].includes(answer) || /^[A-F]{2,}$/.test(answer) ? answer : "") as Answer, subject: String(value.subjectSuggested || value.subject || ""), baseText: String(value.baseText || ""), imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined, imageName: typeof value.imageName === "string" ? value.imageName : undefined, imageRequired: visualStatus === "needed", visualStatus, visualNotes: String(value.imageDescription || value.visualNotes || ""), difficulty, nivel, type, expectedAnswer: typeof value.expectedAnswer === "string" ? value.expectedAnswer : undefined };
  });
  const title = String(source.title || source.organization || source.contest || raw.title || "Prova importada");
  const role = inferExamRole({ role: source.role || raw.role, cargo: source.cargo, title, evidence: questions });
  const pointsByDifficulty = raw.pointsByDifficulty && typeof raw.pointsByDifficulty === "object" ? raw.pointsByDifficulty as Record<Difficulty, number> : undefined;
  const record: ExamRecord = { id: String(raw.id || ""), title, city: String(source.city || raw.city || "Município não informado"), state: String(source.state || raw.state || ""), year: String(source.year || raw.year || ""), board: String(source.board || raw.board || ""), booklet: String(source.booklet || raw.booklet || ""), role, status: String(raw.status || "Revisão pendente"), questions, updatedAt: new Date().toISOString(), pointsByDifficulty };
  return { ...record, id: record.id || fingerprint(record) || fallback };
}

function exportJson(value: unknown) { const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }); const href = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = href; anchor.download = "pacote-kuaa-estudante.json"; anchor.click(); URL.revokeObjectURL(href); }

function InlineReview({ exam, exams, onChange, onClose }: { exam: ExamRecord; exams: ExamRecord[]; onChange: (records: ExamRecord[]) => void; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const question = exam.questions[index];
  const updateQuestion = (patch: Partial<Question>) => onChange(exams.map((item) => item.id !== exam.id ? item : { ...item, updatedAt: new Date().toISOString(), questions: item.questions.map((current) => current.id === question.id ? { ...current, ...patch } : current) }));
  const pointsByDifficulty = exam.pointsByDifficulty || { facil: 1, media: 1, dificil: 1 };
  const updateExamPoints = (level: Difficulty, value: number) => onChange(exams.map((item) => item.id !== exam.id ? item : { ...item, updatedAt: new Date().toISOString(), pointsByDifficulty: { ...pointsByDifficulty, [level]: Math.max(0, value) } }));
  // updateExam: edita campos da prova (banca, orgao, cargo, ano, pais, cidade, metodologia, tematica, title, etc.)
  const updateExam = (patch: Partial<ExamRecord>) => onChange(exams.map((item) => item.id !== exam.id ? item : { ...item, updatedAt: new Date().toISOString(), ...patch }));
  // addQuestion: adiciona uma nova questão vazia ao final e abre para edição
  const addQuestion = () => {
    const newId = Math.max(0, ...exam.questions.map((q) => Number(q.id) || 0)) + 1;
    const newQuestion: Question = { id: newId, originalNumber: String(exam.questions.length + 1), label: `Questão ${exam.questions.length + 1}`, text: "", alternatives: [{ id: "A", text: "" }, { id: "B", text: "" }], correct: "", subject: "", type: "unica", visualStatus: "not_needed" };
    onChange(exams.map((item) => item.id !== exam.id ? item : { ...item, updatedAt: new Date().toISOString(), questions: [...item.questions, newQuestion] }));
    setIndex(exam.questions.length);
  };
  // deleteQuestion: remove a questão atual e ajusta o índice
  const deleteQuestion = () => {
    if (!window.confirm(`Excluir a questão ${question.originalNumber || index + 1}? Esta ação não pode ser desfeita.`)) return;
    const newQuestions = exam.questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, id: i + 1, originalNumber: String(i + 1), label: `Questão ${i + 1}` }));
    onChange(exams.map((item) => item.id !== exam.id ? item : { ...item, updatedAt: new Date().toISOString(), questions: newQuestions }));
    setIndex(Math.max(0, index - 1));
    toast.success("Questão excluída");
  };
  // addAlternative: adiciona uma nova alternativa à questão atual
  const addAlternative = () => {
    const nextLetter = String.fromCharCode(65 + question.alternatives.length);
    updateQuestion({ alternatives: [...question.alternatives, { id: nextLetter, text: "" }] });
  };
  // deleteAlternative: remove uma alternativa pelo índice
  const deleteAlternative = (altIndex: number) => {
    const newAlts = question.alternatives.filter((_, i) => i !== altIndex).map((a, i) => ({ ...a, id: String.fromCharCode(65 + i) }));
    updateQuestion({ alternatives: newAlts, correct: "" });
  };
  const attachImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const imageUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    updateQuestion({ imageUrl, imageName: file.name, imageRequired: false, visualStatus: "not_needed" });
    toast.success("Imagem associada à questão");
  };
  if (!question) return <main className="workspace review-workspace"><Button onClick={onClose}>Voltar ao acervo</Button></main>;
  const isProva = exam.kind === "prova" || !exam.kind;
  const isQuiz = exam.kind === "quiz";
  const isFormulario = exam.kind === "formulario";
  return <main className="workspace review-workspace">
    <section className="review-heading"><div><button className="back-link" onClick={onClose}><ArrowLeft size={17} /> Voltar ao acervo</button><p className="eyebrow">REVISÃO HUMANA · {exam.role}</p><h1>Questão {question.originalNumber || index + 1} da prova selecionada.</h1><p>Confirme gabarito, matéria e qualquer elemento visual antes de entregar a prova aos estudantes.</p></div></section>

    {/* Metadados da prova/quiz/formulário (update3.txt §REVISÃO HUMANA) */}
    <section className="review-points-batch"><div className="field-title"><div><strong>Metadados — como aparece no app</strong><span>Edite banca, órgão, cargo, ano, país, cidade, metodologia (prova), temática (quiz) e o título exibido.</span></div></div>
      <div className="review-points-inputs review-metadata-grid">
        <label>ID (nome visível)<input value={exam.id} onChange={(event) => updateExam({ id: event.target.value })} /></label>
        <label>Título exibido<input value={exam.title} onChange={(event) => updateExam({ title: event.target.value })} placeholder="Se vazio, usa o ID" /></label>
        {isProva && <>
          <label>Banca<input value={exam.board || ""} onChange={(event) => updateExam({ board: event.target.value })} /></label>
          <label>Órgão<input value={exam.booklet?.startsWith("Origem:") ? "" : exam.booklet || ""} onChange={(event) => updateExam({ booklet: event.target.value })} placeholder="Órgão solicitante" /></label>
          <label>Cargo<input value={exam.role} onChange={(event) => updateExam({ role: event.target.value })} /></label>
          <label>Ano<input value={exam.year} onChange={(event) => updateExam({ year: event.target.value })} /></label>
          <label>País<input value={exam.state} onChange={(event) => updateExam({ state: event.target.value })} /></label>
          <label>Cidade<input value={exam.city} onChange={(event) => updateExam({ city: event.target.value })} /></label>
        </>}
        {isQuiz && <label>Temática<input value={exam.booklet || ""} onChange={(event) => updateExam({ booklet: event.target.value })} /></label>}
      </div>
    </section>

    {isProva && <section className="review-points-batch"><div className="field-title"><div><strong>Pontuação por dificuldade (vale para a prova inteira)</strong><span>Ajuste aqui se juntou lotes gerados com pontuações diferentes. Toda questão fácil/média/difícil desta prova passa a valer o novo número.</span></div></div><div className="review-points-inputs">{(["facil", "media", "dificil"] as Difficulty[]).map((level) => <label key={level}>{DIFFICULTY_LABELS[level]}<input type="number" min={0} value={pointsByDifficulty[level]} onChange={(event) => updateExamPoints(level, Number(event.target.value) || 0)} /></label>)}</div></section>}
    <section className="review-board">
      <aside className="review-queue"><p className="card-caption"><span>01</span> QUESTÕES</p>{exam.questions.map((item, itemIndex) => <button key={item.id} className={itemIndex === index ? "is-current" : ""} onClick={() => setIndex(itemIndex)}><span>{item.originalNumber || itemIndex + 1}</span><div><strong>Questão {item.originalNumber || itemIndex + 1}</strong><small>{item.subject || "Sem matéria"}</small></div></button>)}<Button variant="outline" onClick={addQuestion} className="review-add-question-btn">+ Adicionar questão</Button></aside>
      <section className="review-sheet">
        <div className="review-sheet-top"><Badge>{exam.role} · questão {question.originalNumber || index + 1}</Badge><Button variant="outline" className="danger-button review-delete-question-btn" onClick={deleteQuestion}><Trash2 size={14} /> Excluir questão</Button></div>
        <h2><textarea className="review-enunciado-editor" value={question.text} onChange={(event) => updateQuestion({ text: event.target.value })} placeholder="Enunciado da questão" /></h2>
        <div className="review-fields">
          {!isFormulario && <section><div className="field-title"><div><strong>Gabarito confirmado</strong><span>{question.type === "discursiva" ? "Resposta-modelo ou critério de correção." : question.type === "multipla" ? "Marque todas as alternativas corretas." : "Selecione a alternativa correta."}</span></div></div>{question.type === "discursiva" ? <textarea value={question.expectedAnswer || ""} onChange={(event) => updateQuestion({ expectedAnswer: event.target.value })} placeholder="Resposta-modelo ou critério de correção" /> : <div className="answer-picker">{question.alternatives.map((alt) => alt.id).map((letter) => { const isMultipla = question.type === "multipla"; const isSelected = isMultipla ? question.correct.includes(letter) : question.correct === letter; return <button key={letter} className={isSelected ? "is-selected" : ""} onClick={() => { if (isMultipla) { const next = question.correct.includes(letter) ? question.correct.split("").filter((id) => id !== letter).join("") : [...question.correct.split(""), letter].sort().join(""); updateQuestion({ correct: next }); } else { updateQuestion({ correct: letter as Answer }); } }}>{letter}</button>; })}<button className={question.correct === "ANULADA" ? "is-annulled" : ""} onClick={() => updateQuestion({ correct: "ANULADA" })}>Anulada</button></div>}</section>}
          {isProva && <section><div className="field-title"><div><strong>Matéria</strong><span>Hierarquia: matéria &gt; assunto &gt; tema &gt; tópico. Use " — " para separar níveis.</span></div></div><input value={question.subject} onChange={(event) => updateQuestion({ subject: event.target.value })} placeholder="Ex.: Língua Portuguesa — Sintaxe — Regência — Estudo da crase" /></section>}
          {isProva && <section><div className="field-title"><div><strong>Texto de apoio</strong><span>Texto-base, trecho de lei, caso, etc. — deixe vazio se não houver.</span></div></div><textarea value={question.baseText || ""} onChange={(event) => updateQuestion({ baseText: event.target.value })} placeholder="Texto de apoio da questão" /></section>}
          {isProva && <section><div className="field-title"><div><strong>Dica de estudo</strong><span>Dica prática para revisar este ponto.</span></div></div><textarea value={(question as Question & { dica_estudo?: string }).dica_estudo || ""} onChange={(event) => updateQuestion({ ...( { dica_estudo: event.target.value } as Partial<Question> & { dica_estudo?: string }) } as Partial<Question>)} placeholder="Ex.: Troque a palavra feminina por uma masculina..." /></section>}
          {isProva && <section><div className="field-title"><div><strong>Dificuldade (5 níveis)</strong><span>Nível fino de 1 a 5; os pontos continuam pela faixa (Fácil/Média/Difícil) da tabela acima.</span></div></div><div className="answer-picker">{([1, 2, 3, 4, 5] as Nivel[]).map((n) => { const atual = question.nivel ?? (question.difficulty === "facil" ? 2 : question.difficulty === "dificil" ? 4 : 3); return <button key={n} className={atual === n ? "is-selected" : ""} onClick={() => updateQuestion({ nivel: n, difficulty: n <= 2 ? "facil" : n === 3 ? "media" : "dificil" })}>{NIVEL_LABELS[n]}</button>; })}</div></section>}
          {isProva && <section><div className="field-title"><div><strong>Pontos (exceção só desta questão)</strong><span>Deixe em branco para usar o valor da dificuldade acima.</span></div></div><input type="number" min={0} value={question.points ?? ""} onChange={(event) => updateQuestion({ points: event.target.value === "" ? undefined : Math.max(0, Number(event.target.value)) })} placeholder={String(pointsByDifficulty[question.difficulty || "media"])} /></section>}
        </div>
        {/* Editor de alternativas (update3.txt §REVISÃO HUMANA: revisar, excluir ou adicionar alternativas) */}
        <section className="review-alternatives-editor">
          <div className="field-title"><div><strong>Alternativas</strong><span>Edite o texto, adicione ou remova alternativas. A correta é definida acima.</span></div></div>
          {question.alternatives.map((alt, altIndex) => (
            <div key={altIndex} className="review-alt-row">
              <span className="alt-letter">{alt.id}</span>
              <input value={alt.text} onChange={(event) => updateQuestion({ alternatives: question.alternatives.map((a, i) => i === altIndex ? { ...a, text: event.target.value } : a) })} placeholder={`Texto da alternativa ${alt.id}`} />
              <Button variant="outline" className="danger-button icon-action" onClick={() => deleteAlternative(altIndex)} aria-label={`Excluir alternativa ${alt.id}`}><Trash2 size={14} /></Button>
            </div>
          ))}
          <Button variant="outline" onClick={addAlternative} className="review-add-alt-btn">+ Adicionar alternativa</Button>
        </section>
        <section className="review-visual">
          <div className="field-title"><div><strong>Imagem, gráfico ou tirinha</strong><span>{question.visualNotes || "Associe o recurso visual necessário para responder a questão."}</span></div></div>
          {question.imageUrl ? <figure><img src={question.imageUrl} alt={question.imageName || `Imagem da questão ${question.originalNumber || index + 1}`} /><figcaption>{question.imageName || "Imagem associada"}</figcaption><Button variant="outline" className="danger-button" onClick={() => updateQuestion({ imageUrl: undefined, imageName: undefined, imageRequired: true, visualStatus: "pending" })}>Remover imagem</Button></figure> : <div className="review-visual-empty">Nenhuma imagem associada a esta questão.</div>}
          <label className="button button-outline file-action"><UploadCloud size={16} /> Associar imagem<input type="file" accept="image/*" onChange={(event) => { attachImage(event).catch(() => toast.error("Não foi possível ler a imagem")); }} /></label>
          <textarea value={question.visualNotes || ""} onChange={(event) => updateQuestion({ visualNotes: event.target.value })} placeholder="Descreva o gráfico, a tirinha ou o símbolo que precisa ser revisado." />
        </section>
        <footer className="review-footer"><Button variant="outline" disabled={index === 0} onClick={() => setIndex((value) => value - 1)}><ChevronLeft size={17} /> Anterior</Button><span>Alterações salvas na prova.</span><Button className="lime-button" onClick={() => index < exam.questions.length - 1 ? setIndex((value) => value + 1) : onClose()}>{index < exam.questions.length - 1 ? "Salvar e próxima" : "Concluir e voltar"}<ChevronRight size={17} /></Button></footer>
      </section>
    </section>
  </main>;
}

export default function AdminPreviewNew({ exams, selectedExamId, onChange, onStudy, onReview }: { exams: ExamRecord[]; selectedExamId: string; onChange: (records: ExamRecord[]) => void; onStudy: (id: string) => void; onReview: (id: string) => void }) {
  // Persistência da última configuração do gerador (update3.txt §Copiar prompt):
  // localStorage preserva perfil, metodologia, criatividade, tipos, tempo, regras e alternativas
  // mesmo mudando para a versão de estudante e voltando.
  const STORAGE_PREFIX = "kuaa-admin-gen-";
  const readStr = (key: string, fallback = "") => { try { return window.localStorage.getItem(STORAGE_PREFIX + key) ?? fallback; } catch { return fallback; } };
  const readBool = (key: string, fallback = false) => readStr(key, fallback ? "1" : "0") === "1";
  const readNum = (key: string, fallback: number) => Number(readStr(key, String(fallback))) || fallback;
  const writeStr = (key: string, value: string) => { try { window.localStorage.setItem(STORAGE_PREFIX + key, value); } catch { /* ignora */ } };

  const [response, setResponse] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(selectedExamId ? [selectedExamId] : []);
  const [reviewId, setReviewId] = useState("");
  const [requestedSubject, setRequestedSubject] = useState(readStr("requestedSubject"));
  const [manualSubject, setManualSubject] = useState(readStr("manualSubject"));
  const [generationProfile, setGenerationProfile] = useState(readStr("profile"));
  const [difficultyPlan, setDifficultyPlan] = useState<Record<Difficulty, { quantity: number; points: number }>>(() => {
    try { const saved = JSON.parse(readStr("difficultyPlan")); if (saved && typeof saved === "object") return { facil: { quantity: Number(saved.facil?.quantity) || 0, points: Number(saved.facil?.points) || 2 }, media: { quantity: Number(saved.media?.quantity) || 0, points: Number(saved.media?.points) || 3 }, dificil: { quantity: Number(saved.dificil?.quantity) || 0, points: Number(saved.dificil?.points) || 5 } }; } catch { /* ignora */ }
    return { facil: { quantity: 0, points: 2 }, media: { quantity: 0, points: 3 }, dificil: { quantity: 0, points: 5 } };
  });
  const [generationCreativity, setGenerationCreativity] = useState<"baixa" | "media" | "alta" | "irracional">((() => { const v = readStr("creativity", "media"); return (v === "baixa" || v === "alta" || v === "irracional") ? v : "media"; })());
  const [generationMethodology, setGenerationMethodology] = useState<KuaaMethodology>((() => { const v = readStr("methodology", "padrao"); return (v === "enem" || v === "fgv" || v === "cebraspe") ? v : "padrao"; })());
  const [generationTypes, setGenerationTypes] = useState<QuestionType[]>(() => { try { const saved = JSON.parse(readStr("types")); return Array.isArray(saved) && saved.length ? saved : ["unica"]; } catch { return ["unica"]; } });
  const [lastRequestedTypes, setLastRequestedTypes] = useState<QuestionType[] | null>(null);
  const [generationTimeLabel, setGenerationTimeLabel] = useState(readStr("timeLabel", TIME_OPTIONS[1]));
  const [generationTimeAiSuggests, setGenerationTimeAiSuggests] = useState(readBool("timeAiSuggests", false));
  const [generationAlternativasCount, setGenerationAlternativasCount] = useState(readNum("alternativasCount", 4));
  const [generationAlternativasAiSuggests, setGenerationAlternativasAiSuggests] = useState(readBool("alternativasAiSuggests", false));
  const [generationMode, setGenerationMode] = useState<"lote" | "prova">((readStr("mode", "lote") as "lote" | "prova") || "lote");
  const [generationCustomRules, setGenerationCustomRules] = useState(readStr("customRules"));
  // Tipo do template (Prova/Quiz/Formulário) para botões Prompt/Parser (update3.txt §Cole o JSON)
  const [templateKind, setTemplateKind] = useState<"prova" | "quiz" | "formulario">("prova");
  const [adminPage, setAdminPage] = useState(0);
  const currentYear = String(new Date().getFullYear());

  // Persiste cada campo quando muda
  useEffect(() => { writeStr("requestedSubject", requestedSubject); }, [requestedSubject]);
  useEffect(() => { writeStr("manualSubject", manualSubject); }, [manualSubject]);
  useEffect(() => { writeStr("profile", generationProfile); }, [generationProfile]);
  useEffect(() => { writeStr("difficultyPlan", JSON.stringify(difficultyPlan)); }, [difficultyPlan]);
  useEffect(() => { writeStr("creativity", generationCreativity); }, [generationCreativity]);
  useEffect(() => { writeStr("methodology", generationMethodology); }, [generationMethodology]);
  useEffect(() => { writeStr("types", JSON.stringify(generationTypes)); }, [generationTypes]);
  useEffect(() => { writeStr("timeLabel", generationTimeLabel); }, [generationTimeLabel]);
  useEffect(() => { writeStr("timeAiSuggests", generationTimeAiSuggests ? "1" : "0"); }, [generationTimeAiSuggests]);
  useEffect(() => { writeStr("alternativasCount", String(generationAlternativasCount)); }, [generationAlternativasCount]);
  useEffect(() => { writeStr("alternativasAiSuggests", generationAlternativasAiSuggests ? "1" : "0"); }, [generationAlternativasAiSuggests]);
  useEffect(() => { writeStr("mode", generationMode); }, [generationMode]);
  useEffect(() => { writeStr("customRules", generationCustomRules); }, [generationCustomRules]);

  // Metodologia "cebraspe" força quantidade de alternativas = 2 (formato Certo/Errado)
  useEffect(() => {
    if (generationMethodology === "cebraspe" && generationAlternativasCount !== 2) {
      setGenerationAlternativasCount(2);
      setGenerationAlternativasAiSuggests(false);
    }
  }, [generationMethodology, generationAlternativasCount]);
  const filtered = useMemo(() => { const needle = query.trim().toLocaleLowerCase("pt-BR"); if (!needle) return exams; return exams.filter((exam) => [exam.title, exam.role, exam.city, exam.state, exam.year, exam.board, exam.booklet, exam.status].join(" ").toLocaleLowerCase("pt-BR").includes(needle)); }, [exams, query]);
  const knownSubjects = useMemo(() => Array.from(new Set(exams.flatMap((exam) => exam.questions.map((question) => question.subject.trim()).filter(Boolean)))).sort((first, second) => first.localeCompare(second, "pt-BR")), [exams]);
  const adminPageCount = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safeAdminPage = Math.min(adminPage, adminPageCount - 1);
  const visibleExams = filtered.slice(safeAdminPage * ADMIN_PAGE_SIZE, (safeAdminPage + 1) * ADMIN_PAGE_SIZE);
  const subjectToGenerate = manualSubject.trim() || requestedSubject;
  const generationTotalQuestions = difficultyPlan.facil.quantity + difficultyPlan.media.quantity + difficultyPlan.dificil.quantity;
  const generationReady = Boolean(generationProfile && subjectToGenerate && generationTypes.length && generationTotalQuestions > 0);
  useEffect(() => { setAdminPage(0); }, [query]);
  useEffect(() => { setAdminPage((page) => Math.min(page, adminPageCount - 1)); }, [adminPageCount]);
  const appendSyntheticQuestions = (raw: Record<string, unknown>) => {
    const generated = normalize(raw, `sintetica-${Date.now()}`);
    const source = (raw.exam && typeof raw.exam === "object" ? raw.exam : raw) as Record<string, unknown>;
    const board = String(source.board || source.banca || raw.banca || raw.aiName || "IA não informada").trim() || "IA não informada";
    const year = String(source.year || currentYear);
    // Cargo do contrato tem prioridade (conteúdo de ano letivo carrega
    // "Estudante 3º EM" etc.); "Estudante" puro só entra como fallback.
    const role = String(source.cargo || source.role || raw.cargo || "").trim() || SYNTHETIC_ROLE;
    const validQuestions = generated.questions.filter((question) => { if (!question.text.trim()) return false; if (question.type === "discursiva") return Boolean(question.expectedAnswer?.trim()); return question.alternatives.length >= 2 && question.alternatives.length <= 10 && Boolean(question.correct) && question.correct !== "ANULADA"; });
    const offSpecCount = lastRequestedTypes ? validQuestions.filter((question) => !lastRequestedTypes.includes(question.type || "unica")).length : 0;
    const onSpecQuestions = lastRequestedTypes ? validQuestions.filter((question) => lastRequestedTypes.includes(question.type || "unica")) : validQuestions;
    if (!onSpecQuestions.length) { toast.error("Nenhuma questão sintética válida", { description: offSpecCount ? `A IA só retornou tipos diferentes dos solicitados (${offSpecCount} descartada(s)). Peça novamente, reforçando o tipo exigido.` : "Questões de escolha precisam de 2 a 10 alternativas e um gabarito; discursivas precisam de uma resposta-modelo (expectedAnswer)." }); return; }
    const nextRecords = exams.map((exam) => ({ ...exam, questions: [...exam.questions] }));
    const questionFingerprints = new Set(nextRecords.flatMap((exam) => exam.questions.map((question) => `${question.text.trim().toLocaleLowerCase("pt-BR")}|${question.alternatives.map((option) => option.text.trim().toLocaleLowerCase("pt-BR")).join("|")}`)));
    const fresh = onSpecQuestions.filter((question) => { const key = `${question.text.trim().toLocaleLowerCase("pt-BR")}|${question.alternatives.map((option) => option.text.trim().toLocaleLowerCase("pt-BR")).join("|")}`; if (questionFingerprints.has(key)) return false; questionFingerprints.add(key); return true; });
    if (!fresh.length) { toast.error("Questões repetidas", { description: "Todas as questões desta resposta já estão no acervo." }); return; }
    const touched = new Set<string>();
    const declaredSubject = String(raw.syntheticSubject || "").trim();
    const bySubject = fresh.reduce<Record<string, Question[]>>((groups, question) => { const bucket = syntheticBucket(question, declaredSubject); groups[bucket] = [...(groups[bucket] || []), question]; return groups; }, {});
    Object.entries(bySubject).forEach(([subject, entries]) => {
      const matching = (exam: ExamRecord) => exam.title === SYNTHETIC_TITLE && exam.role === role && exam.city === SYNTHETIC_CITY && exam.state === SYNTHETIC_STATE && exam.year === year && exam.board === board && exam.booklet?.startsWith(`Banco sintético · ${subject} ·`);
      let remaining = [...entries];
      while (remaining.length) {
        let target = nextRecords.find((exam) => matching(exam) && exam.questions.length < SYNTHETIC_BATCH_SIZE);
        if (!target) {
          const batch = nextRecords.filter(matching).length + 1;
          const slug = subject.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-");
          target = { id: `sintetica|${year}|${board.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-")}|${slug}|${batch}`, title: SYNTHETIC_TITLE, city: SYNTHETIC_CITY, state: SYNTHETIC_STATE, year, board, booklet: `Banco sintético · ${subject} · lote ${batch}`, role, status: "Revisão pendente", questions: [], updatedAt: new Date().toISOString(), pointsByDifficulty: { facil: difficultyPlan.facil.points, media: difficultyPlan.media.points, dificil: difficultyPlan.dificil.points } };
          nextRecords.push(target);
        }
        const capacity = SYNTHETIC_BATCH_SIZE - target.questions.length;
        const portion = remaining.splice(0, capacity).map((question, index) => ({ ...question, subject, id: target.questions.length + index + 1, originalNumber: String(target.questions.length + index + 1), label: `Questão ${target.questions.length + index + 1}` }));
        target.questions = [...target.questions, ...portion];
        target.updatedAt = new Date().toISOString();
        touched.add(target.id);
      }
    });
    onChange(nextRecords);
    setSelected(Array.from(touched));
    setResponse("");
    toast.success(`${fresh.length} questão(ões) sintéticas adicionadas`, { description: `Banco da ${board}: ${touched.size} prova(s) atualizada(s), com até ${SYNTHETIC_BATCH_SIZE} questões por disciplina.${offSpecCount ? ` ${offSpecCount} questão(ões) de tipo não solicitado foram descartadas.` : ""}` });
  };
  const importText = (value: string) => {
    const cleaned = value.replace(/```[a-zA-Z]*\n?/g, "").replace(/```/g, "").trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    const candidates = [cleaned];
    if (firstBrace !== -1 && lastBrace > firstBrace) candidates.push(cleaned.slice(firstBrace, lastBrace + 1));
    let raw: Record<string, unknown> | null = null;
    for (const candidate of candidates) { try { raw = JSON.parse(candidate) as Record<string, unknown>; break; } catch { /* tenta o próximo candidato */ } }
    if (raw) {
      // Formato kuaa/ (novo): despacha para o parser dedicado.
      if (raw.format === "kuaa/") {
        try {
          const exam = parseKuaaText(JSON.stringify(raw), generateKuaaId("P"));
          if (!exam.questions.length) { toast.error("Nenhuma questão reconhecida", { description: "O JSON kuaa/ não trouxe nenhuma questão válida." }); return; }

          // Quiz e Formulário: aceitam como estão (metadados únicos são suficientes)
          if (exam.kind === "quiz" || exam.kind === "formulario") {
            if (exams.some((item) => item.id === exam.id || fingerprint(item) === fingerprint(exam))) { toast.error("Duplicado", { description: "O acervo já possui isso." }); return; }
            onChange([...exams, exam]);
            setSelected([exam.id]);
            setResponse("");
            toast.success(`"${exam.title}" adicionado ao acervo (formato kuaa/)`, { description: `${exam.kind === "quiz" ? "Quiz" : "Formulário"} pronto para exportar ao app do estudante.` });
            return;
          }

          // PROVA: deduplicação por ENUNCIADO de questão (não por metadados).
          // O fluxograma esperado (update5.txt):
          //   pegar prompt -> solicitar JSON à IA -> entregar JSON ao programa ->
          //   programa verifica quantas questões são inéditas, adiciona elas no acervo,
          //   me informa quantas foram adicionadas e quantas foram recusadas ->
          //   cria um identificador único baseado em timestamp.
          const questionFingerprints = new Set(exams.flatMap((e) => e.questions.map((q) => {
            // Normaliza enunciado + alternativas para comparação robusta (ignora maiúsculas, acentos, espaços)
            const normalizedEnunciado = (q.text || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const normalizedAlts = q.alternatives.map((a) => (a.text || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
            return `${normalizedEnunciado}|${normalizedAlts.join("|")}`;
          })));
          let added = 0;
          let refused = 0;
          const freshQuestions: Question[] = [];
          for (const q of exam.questions) {
            const normalizedEnunciado = (q.text || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const normalizedAlts = q.alternatives.map((a) => (a.text || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
            const key = `${normalizedEnunciado}|${normalizedAlts.join("|")}`;
            if (questionFingerprints.has(key)) { refused++; continue; }
            questionFingerprints.add(key);
            freshQuestions.push(q);
            added++;
          }
          if (!added) { toast.error("Todas as questões são repetidas", { description: `${refused} questão(ões) recusada(s) — o acervo já possui todas com o mesmo enunciado.` }); return; }
          // Cria um novo ExamRecord com ID único baseado em timestamp
          const newExam: ExamRecord = {
            ...exam,
            id: generateKuaaId("P"),  // PD + data/hora atuais
            questions: freshQuestions.map((q, i) => ({ ...q, id: i + 1, originalNumber: String(i + 1), label: `Questão ${i + 1}` })),
            updatedAt: new Date().toISOString(),
            status: "Revisão pendente",
          };
          onChange([...exams, newExam]);
          setSelected([newExam.id]);
          setResponse("");
          setReviewId(newExam.id);
          const refusedText = refused > 0 ? ` ${refused} questão(ões) recusada(s) (enunciado repetido).` : "";
          toast.success(`${added} questão(ões) adicionada(s) (formato kuaa/)`, { description: `Prova criada com ID ${newExam.id}.${refusedText} A prova foi aberta para revisão.` });
          
        } catch (e) { toast.error("JSON kuaa/ inválido", { description: e instanceof Error ? e.message : "Confira o contrato do formato kuaa/." }); }
        return;
      }
      if (raw.synthetic === true || raw.format === "caderno-aprovacao/synthetic-v1") { appendSyntheticQuestions(raw); return; }
      if (raw.kind === "quiz" || raw.kind === "formulario") {
        const exam = hydrateDirectExam(raw, `${raw.kind}-${Date.now()}`);
        if (!exam.questions.length) { toast.error("Nenhuma questão reconhecida", { description: "O JSON não trouxe nenhuma questão válida." }); return; }
        if (exams.some((item) => item.id === exam.id || fingerprint(item) === fingerprint(exam))) { toast.error("Duplicado", { description: "O acervo já possui isso." }); return; }
        onChange([...exams, exam]);
        setSelected([exam.id]);
        setResponse("");
        toast.success(`"${exam.title}" adicionado ao acervo`, { description: `${exam.kind === "quiz" ? "Quiz" : "Formulário"} pronto para exportar ao app do estudante. A tela de Revisão ainda não foi adaptada para este tipo — confira o JSON original se precisar corrigir algo.` });
        return;
      }
      const exam = normalize(raw, `prova-${Date.now()}`);
      if (isUnresolvedRole(exam.role)) { toast.error("Cargo não confirmado", { description: "A IA não informou um cargo profissional válido. Copie o prompt atualizado, peça a correção do campo cargo e importe novamente." }); return; }
      if (exams.some((item) => item.id === exam.id || fingerprint(item) === fingerprint(exam))) { toast.error("Prova duplicada", { description: "O acervo já possui essa prova." }); return; }
      onChange([...exams, exam]);
      setSelected([exam.id]);
      setResponse("");
      setReviewId(exam.id);
      toast.success(`${exam.questions.length} questões adicionadas`, { description: "A prova foi aberta para revisão." });
      
      return;
    }
    // Parser de texto kuaa/ (format: kuaa/ + tipo: prova|quiz|formulario + blocos chave: valor)
    const isKuaaText = /^\s*format\s*:\s*kuaa\/\s*$/im.test(cleaned) || /tipo\s*:\s*(prova|quiz|formulario)\s*$/im.test(cleaned);
    if (isKuaaText) {
      try {
        const exam = parseKuaaText(cleaned, generateKuaaId("P"));
        if (!exam.questions.length) { toast.error("Nenhuma questão reconhecida", { description: "O texto kuaa/ não trouxe nenhuma questão válida." }); return; }
        if (exams.some((item) => item.id === exam.id || fingerprint(item) === fingerprint(exam))) { toast.error("Duplicado", { description: "O acervo já possui isso." }); return; }
        onChange([...exams, exam]);
        setSelected([exam.id]);
        setResponse("");
        if (exam.kind === "quiz" || exam.kind === "formulario") {
          toast.success(`"${exam.title}" adicionado ao acervo (formato kuaa/ texto)`, { description: `${exam.kind === "quiz" ? "Quiz" : "Formulário"} pronto para exportar.` });
          return;
        }
        setReviewId(exam.id);
        toast.success(`${exam.questions.length} questão(ões) criada(s) via texto kuaa/`, { description: `"${exam.title}" foi aberta para revisão.` });
        
      } catch (e) { toast.error("Texto kuaa/ inválido", { description: e instanceof Error ? e.message : "Confira a sintaxe do formato kuaa/." }); }
      return;
    }
    const isQuiz = /^\s*Quiz\s*:/im.test(value);
    const isForm = /^\s*Formul[aá]rio\s*:/im.test(value);
    const isProvaTemplate = /^\s*(Cargo|Banca|Modelo)\s*:/im.test(value);
    if (!isQuiz && !isForm && !isProvaTemplate) {
      if (cleaned.startsWith("{")) { toast.error("JSON não reconhecido", { description: "O texto parece ser uma resposta de IA, mas não é um JSON válido (provavelmente veio cortado ou com algo além do JSON). Peça pra IA reenviar só o JSON completo, sem texto antes/depois, e cole de novo." }); return; }
      toast.error("Resposta não reconhecida", { description: "Cole o JSON kuaa/ ou caderno-aprovacao/, ou um template de texto entre chaves { }." }); return;
    }
    try {
      const exam = isQuiz ? parseQuizText(value) : isForm ? parseFormText(value) : parseTemplateText(value, exams);
      if (exams.some((item) => item.id === exam.id || fingerprint(item) === fingerprint(exam))) { toast.error("Duplicado", { description: "O acervo já possui isso." }); return; }
      onChange([...exams, exam]);
      setSelected([exam.id]);
      setResponse("");
      if (isQuiz || isForm) { toast.success(`"${exam.title}" adicionado ao acervo`, { description: `${isQuiz ? "Quiz" : "Formulário"} pronto para exportar ao app do estudante. A tela de Revisão ainda não foi adaptada para este tipo — confira o texto original se precisar corrigir algo.` }); return; }
      setReviewId(exam.id);
      toast.success(`${exam.questions.length} questão(ões) criada(s) via texto`, { description: `"${exam.title}" foi aberta para revisão.` });
      
    } catch (error) { toast.error("Template de texto inválido", { description: error instanceof Error ? error.message : "Confira a sintaxe e tente novamente." }); }
  };
  const readClipboard = async () => { try { const text = await navigator.clipboard.readText(); setResponse(text); toast.success("Resposta lida da área de transferência"); return text; } catch { toast.error("Não foi possível ler a área de transferência", { description: "Cole o JSON manualmente no campo." }); return ""; } };
  // Botão "Adicionar ao acervo": se a caixa de texto estiver vazia, busca do clipboard (update3.txt §Cole o JSON)
  const addToAcervoFromTextOrClipboard = async () => {
    let text = response.trim();
    if (!text) {
      toast("Caixa de texto vazia — buscando da área de transferência...", { description: "Aguardando permissão para ler o clipboard." });
      text = (await navigator.clipboard.readText().catch(() => "")).trim();
      if (!text) { toast.error("Nada para adicionar", { description: "Cole o JSON na caixa de texto acima, ou copie um JSON válido e tente novamente." }); return; }
      setResponse(text);
    }
    importText(text);
  };
  // Botões Prompt/Parser (update3.txt §Cole o JSON): copiam o modelo completo para a área de transferência.
  const copyTemplate = async (kind: "prova" | "quiz" | "formulario", mode: "prompt" | "parser") => {
    const templates = {
      prova: { prompt: PROVA_PROMPT_TEMPLATE, parser: PROVA_PARSER_TEMPLATE },
      quiz: { prompt: QUIZ_PROMPT_TEMPLATE, parser: QUIZ_PARSER_TEMPLATE },
      formulario: { prompt: FORM_PROMPT_TEMPLATE, parser: FORM_PARSER_TEMPLATE },
    };
    const text = templates[kind][mode];
    try { await navigator.clipboard.writeText(text); toast.success(`${kind === "prova" ? "Prova" : kind === "quiz" ? "Quiz" : "Formulário"} · ${mode === "prompt" ? "Prompt" : "Parser"} copiado`, { description: mode === "prompt" ? "Cole numa conversa com a IA, preencha os campos entre [colchetes] e cole a resposta aqui." : "Cole na caixa de texto acima e edite os valores à mão." }); }
    catch { toast.error("Não foi possível copiar", { description: "Selecione e copie o texto manualmente." }); }
  };
  const copyPrompt = async () => { try { await navigator.clipboard.writeText(EXTRACTION_PROMPT); toast.success("Prompt copiado", { description: "Anexe a prova e o gabarito na IA e cole o retorno aqui." }); } catch { toast.error("Não foi possível copiar automaticamente", { description: "Selecione e copie o texto do prompt manualmente." }); } };
  const copySyntheticPrompt = async () => {
    if (!generationReady) { toast.error("Preencha os campos obrigatórios", { description: "Escolha o perfil, a matéria, ao menos um tipo de questão e a quantidade de questões por dificuldade." }); return; }
    const prompt = buildCustomSyntheticPrompt({ profile: generationProfile, subject: subjectToGenerate, plan: difficultyPlan, creativity: generationCreativity, types: generationTypes, timeLabel: generationTimeLabel, timeAiSuggests: generationTimeAiSuggests, customRules: generationCustomRules, methodology: generationMethodology, alternativasCount: generationAlternativasCount, alternativasAiSuggests: generationAlternativasAiSuggests, mode: generationMode });
    setLastRequestedTypes(generationTypes);
    try { await navigator.clipboard.writeText(prompt); toast.success("Prompt de geração copiado", { description: `Envie-o à IA e cole o JSON retornado na etapa 2. Modo: ${generationMode === "prova" ? "Prova sintética" : "Lote parcial"}.` }); } catch { toast.error("Não foi possível copiar automaticamente", { description: "Selecione e copie o texto do prompt manualmente." }); }
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) importText(await file.text()); };
  const importAdministrativePackage = async (event: ChangeEvent<HTMLInputElement>) => {
    // Importação múltipla: varre todos os JSONs escolhidos, deduplica por id ou
    // fingerprint (inclusive entre os próprios arquivos) e resume tudo no toast.
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const known = [...exams];
    let accumulated = [...exams];
    const freshIds: string[] = [];
    let restored = 0; let duplicates = 0; let failed = 0;
    const isDuplicate = (candidate: (typeof exams)[number]) => known.some((exam) => exam.id === candidate.id || fingerprint(exam) === fingerprint(candidate));
    for (const file of files) {
      try {
        const raw = JSON.parse(await file.text()) as Record<string, unknown>;
        const entries = Array.isArray(raw.exams) ? raw.exams : [raw];
        const candidates = entries.map((item, index) => { const value = item as Record<string, unknown>; return value.kind === "quiz" || value.kind === "formulario" ? hydrateDirectExam(value, `backup-${Date.now()}-${files.indexOf(file)}-${index}`) : normalize(value, `backup-${Date.now()}-${files.indexOf(file)}-${index}`); });
        const fresh = candidates.filter((candidate) => !isDuplicate(candidate));
        fresh.forEach((candidate) => { known.push(candidate); freshIds.push(candidate.id); });
        accumulated = [...accumulated, ...fresh];
        restored += fresh.length;
        duplicates += candidates.length - fresh.length;
      } catch { failed += 1; }
    }
    event.target.value = "";
    if (restored > 0) {
      onChange(accumulated);
      setSelected(freshIds);
      toast.success(`${restored} prova(s) restaurada(s)`, { description: `${files.length} arquivo(s) analisado(s). ${duplicates} duplicidade(s) ignorada(s).${failed ? ` ${failed} arquivo(s) não reconhecido(s).` : ""}` });
    } else {
      toast.error("Nenhuma prova importada", { description: failed ? "Nenhum arquivo foi reconhecido. Selecione JSONs exportados pelo kuaa." : "Todos os pacotes já estão no acervo." });
    }
  };
  const toggle = (id: string) => setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  const selectVisible = () => setSelected((items) => Array.from(new Set([...items, ...visibleExams.map((item) => item.id)])));
  const selectAllAcervo = () => setSelected(filtered.map((item) => item.id));
  const clearSelection = () => setSelected([]);
  const organizeAcervoSubjects = () => {
    if (!selected.length) { toast.error("Selecione ao menos uma prova", { description: "Marque uma ou mais provas antes de definir a matéria." }); return; }
    const input = window.prompt(`Digite a matéria que será atribuída às questões da(s) ${selected.length} prova(s) selecionada(s):`);
    if (!input || !input.trim()) { toast("Atribuição de matéria cancelada"); return; }
    const subject = input.trim();
    const withSubject = exams.map((exam) => selected.includes(exam.id) ? { ...exam, updatedAt: new Date().toISOString(), questions: exam.questions.map((question) => ({ ...question, subject })) } : exam);
    const organized = withSubject.map((exam) => selected.includes(exam.id) ? { ...exam, title: retitleExam(exam, withSubject) } : exam);
    onChange(organized);
    toast.success("Matéria atribuída", { description: `${selected.length} prova(s) atualizada(s) para "${subject}".` });
  };
  const mergeSelectedExams = () => {
    // Permitido com 1+ provas (update.txt: seleção única vira "prova unificada").
    // Com 1 seleção, cria uma cópia autônoma daquela prova com novo ID.
    if (selected.length < 1) { toast.error("Selecione ao menos uma prova", { description: "Marque uma ou mais provas/lotes para uni-los (ou duplicar, no caso de uma só) em uma prova só." }); return; }
    const chosen = exams.filter((exam) => selected.includes(exam.id));
    if (chosen.some((exam) => exam.kind === "quiz" || exam.kind === "formulario")) { toast.error("Não é possível unir Quiz ou Formulário", { description: "A união funciona só entre provas comuns." }); return; }
    const base = chosen[0];
    const mergedQuestions = chosen.flatMap((exam) => exam.questions).map((question, index) => ({ ...question, id: index + 1, originalNumber: String(index + 1), label: `Questão ${index + 1}` }));
    const remaining = exams.filter((exam) => !selected.includes(exam.id));
    // Se há bancas diferentes, "Multidisciplinar" vira o nome da banca; se todas iguais, mantém.
    const distinctBoards = Array.from(new Set(chosen.map((e) => e.board || "").filter(Boolean)));
    const unifiedBoard = distinctBoards.length <= 1 ? (distinctBoards[0] || "") : "Multidisciplinar";
    const draft: ExamRecord = { ...base, id: generateKuaaId("P"), title: "", board: unifiedBoard, questions: mergedQuestions, updatedAt: new Date().toISOString(), status: "Revisão pendente" };
    const merged: ExamRecord = { ...draft, title: retitleExam(draft, [...remaining, draft]) };
    onChange([...remaining, merged]);
    setSelected([merged.id]);
    setReviewId(merged.id);
    toast.success(selected.length === 1 ? "Prova unificada criada" : "Provas unidas", { description: `${mergedQuestions.length} questões combinadas em "${merged.title}".${unifiedBoard === "Multidisciplinar" ? " Banca definida como Multidisciplinar (bancas distintas)." : ""} Revise cargo, matéria e pontuação antes de exportar.` });
    
  };
  const organizeAcervoRoles = () => {
    if (!selected.length) { toast.error("Selecione ao menos uma prova", { description: "Marque uma ou mais provas antes de definir o cargo." }); return; }
    const input = window.prompt(`Digite o cargo que será atribuído à(s) ${selected.length} prova(s) selecionada(s):`);
    if (!input || !input.trim()) { toast("Atribuição de cargo cancelada"); return; }
    const role = input.trim();
    const withRole = exams.map((exam) => selected.includes(exam.id) ? { ...exam, role, updatedAt: new Date().toISOString() } : exam);
    onChange(withRole);
    toast.success("Cargo atribuído em lote", { description: `${selected.length} prova(s) atualizada(s) para "${role}".` });
  };
  // Edição em lote (update5.txt): banca, ano, país, cidade para provas; temática para quiz.
  const batchEditField = (field: "board" | "year" | "state" | "city" | "booklet" | "title", label: string, isQuiz = false) => {
    if (!selected.length) { toast.error("Selecione ao menos um item"); return; }
    const input = window.prompt(`Digite ${label} para ${selected.length} item(ns) selecionado(s):`);
    if (!input || !input.trim()) { toast("Edição cancelada"); return; }
    const value = input.trim();
    const updated = exams.map((exam) => selected.includes(exam.id) ? { ...exam, [field]: value, updatedAt: new Date().toISOString() } : exam);
    onChange(updated);
    toast.success(`${label} atribuído em lote`, { description: `${selected.length} item(ns) atualizado(s) para "${value}".` });
  };
  const exportSelection = () => { const chosen = exams.filter((item) => selected.includes(item.id)); if (!chosen.length) { toast.error("Selecione ao menos uma prova"); return; } const partialCount = chosen.filter((exam) => isSyntheticExam(exam) && exam.questions.length < SYNTHETIC_BATCH_SIZE).length; const exportExams = chosen.map((exam) => ({ ...exam, title: exam.title || exam.id })); exportJson({ format: "kuaa/estudante", createdAt: new Date().toISOString(), exams: exportExams }); toast.success("Pacote exportado (formato kuaa/)", { description: partialCount ? `${chosen.length} prova(s) exportada(s), incluindo ${partialCount} lote(s) parcial(is) para backup.` : `${chosen.length} prova(s) prontas para os estudantes.` }); };
  const deleteSelection = (ids = selected) => { const chosen = exams.filter((item) => ids.includes(item.id)); if (!chosen.length) { toast.error("Selecione ao menos uma prova"); return; } if (!window.confirm(`Excluir ${chosen.length} prova(s) do acervo administrativo? Esta ação não pode ser desfeita.`)) return; onChange(exams.filter((item) => !ids.includes(item.id))); setSelected((items) => items.filter((item) => !ids.includes(item))); toast.success(`${chosen.length} prova(s) excluída(s)`); };
  const reviewExam = exams.find((item) => item.id === reviewId);
  if (reviewExam) return <InlineReview exam={reviewExam} exams={exams} onChange={onChange} onClose={() => setReviewId("")} />;
  return (
    <main className="workspace admin-workspace">
      <section className="page-heading">
        <div><p className="eyebrow"><span className="pulse-dot" /> kuaa v{APP_VERSION} · INTERMEDIADORA · ACERVO LOCAL</p><h1>Adicione, gere, revise e compartilhe provas.</h1><p className="heading-copy">Use o prompt adequado: extração com prova e gabarito, ou geração de questões novas para reforçar a revisão rápida.</p></div>
        <div className="heading-aside"><span>ACERVO LOCAL</span><strong>{String(exams.length).padStart(2, "0")} provas</strong><small>Duplicidades são bloqueadas</small></div>
      </section>

      <section className="prompt-return-card">
        <div><p className="eyebrow">ETAPA 1 · PDFs NA IA</p><h2>Preparar o pedido completo.</h2><p>O prompt pede metadados, todas as questões, gabarito, matéria, textos-base e referências visuais para revisão humana.</p></div>
        <Button className="lime-button" onClick={copyPrompt}><Copy size={17} /> Copiar prompt para a IA</Button>
      </section>

      <section className="synthetic-generator">
        <div className="synthetic-generator-controls">
          <div className="generation-2col-layout">
            {/* Coluna esquerda (~60%): perfil, matéria, dificuldades, radio+botão */}
            <div className="generation-col-left">
              <label>Perfil<select value={generationProfile} onChange={(event) => setGenerationProfile(event.target.value)}><option value="">Escolha um perfil</option>{PROFILE_OPTIONS.map((profile) => <option key={profile} value={profile}>{profile}</option>)}</select></label>
              <label>Matéria do acervo<select value={requestedSubject} onChange={(event) => { setRequestedSubject(event.target.value); setManualSubject(""); }}><option value="">Escolha uma matéria do acervo</option>{knownSubjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
              <label>Ou digite uma matéria<input value={manualSubject} onChange={(event) => { setManualSubject(event.target.value); if (event.target.value) setRequestedSubject(""); }} placeholder="Ex.: Geografia" /></label>
              <div className="generation-difficulty-grid">{(["facil", "media", "dificil"] as Difficulty[]).map((key) => <div key={key} className="generation-difficulty-row"><span>{DIFFICULTY_LABELS[key]}</span><label>Quantidade<input type="number" min={0} max={99} value={difficultyPlan[key].quantity} onChange={(event) => setDifficultyPlan((plan) => ({ ...plan, [key]: { ...plan[key], quantity: Math.max(0, Math.min(99, Number(event.target.value) || 0)) } }))} /></label><label>Pontos<input type="number" min={0} value={difficultyPlan[key].points} onChange={(event) => setDifficultyPlan((plan) => ({ ...plan, [key]: { ...plan[key], points: Math.max(0, Number(event.target.value) || 0) } }))} /></label></div>)}</div>
              <div className="generation-mode-radios" role="radiogroup" aria-label="Modo de importação"><label className="template-radio"><input type="radio" name="gen-mode" value="lote" checked={generationMode === "lote"} onChange={() => setGenerationMode("lote")} /> Lote parcial</label><label className="template-radio"><input type="radio" name="gen-mode" value="prova" checked={generationMode === "prova"} onChange={() => setGenerationMode("prova")} /> Prova sintética</label></div>
              <Button className="lime-button" disabled={!generationReady} onClick={copySyntheticPrompt}><Copy size={17} /> Copiar prompt{generationTotalQuestions ? ` (${generationTotalQuestions} questões)` : ""}</Button>
            </div>
            {/* Coluna direita (~40%): criatividade, metodologia, tipos, tempo/alternativas, regras */}
            <div className="generation-col-right">
              <label>Criatividade<select value={generationCreativity} onChange={(event) => setGenerationCreativity(event.target.value as typeof generationCreativity)}>{CREATIVITY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label} — {option.helper}</option>)}</select></label>
              <label>Metodologia<select value={generationMethodology} onChange={(event) => setGenerationMethodology(event.target.value as KuaaMethodology)}>{METHODOLOGY_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select>{generationMethodology === "cebraspe" && <small>Forma Certo/Errado: 2 alternativas fixas.</small>}</label>
              <div className="generation-types"><span>Tipo de questão (marque um ou mais)</span>{QUESTION_TYPE_OPTIONS.map((option) => <label key={option.id} className="generation-type-option"><input type="checkbox" checked={generationTypes.includes(option.id)} onChange={(event) => setGenerationTypes((current) => event.target.checked ? [...current, option.id] : current.filter((item) => item !== option.id))} /> {option.label}</label>)}</div>
              <div className="generation-time-row">
                <label>Tempo estimado<select value={generationTimeLabel} disabled={generationTimeAiSuggests} onChange={(event) => setGenerationTimeLabel(event.target.value)}>{TIME_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                <label>Qtd. alternativas<input type="number" min={2} max={10} value={generationAlternativasCount} disabled={generationAlternativasAiSuggests || generationMethodology === "cebraspe"} onChange={(event) => setGenerationAlternativasCount(Math.max(2, Math.min(10, Number(event.target.value) || 4)))} /></label>
              </div>
              <label className="generation-type-option"><input type="checkbox" checked={generationTimeAiSuggests} onChange={(event) => setGenerationTimeAiSuggests(event.target.checked)} /> Deixar a IA sugerir o tempo</label>
              <label className="generation-type-option"><input type="checkbox" checked={generationAlternativasAiSuggests} disabled={generationMethodology === "cebraspe"} onChange={(event) => setGenerationAlternativasAiSuggests(event.target.checked)} /> Deixar a IA sugerir a quantidade</label>
              <label>Regras diversas (opcional)<textarea value={generationCustomRules} maxLength={500} onChange={(event) => setGenerationCustomRules(event.target.value)} placeholder='Ex.: "use linguagem coloquial" ou "as alternativas devem estar em inglês"' /><small>{generationCustomRules.length}/500</small></label>
            </div>
          </div>
        </div>
      </section>

      <section className="ai-response-import">
        <div><p className="eyebrow">ETAPA 2 · RESPOSTA DA IA</p><h2>Cole o JSON e adicione o conteúdo.</h2><p>A área aceita uma prova extraída ou o JSON de questões sintéticas. Os retornos sintéticos são acumulados automaticamente no lote correspondente.</p></div>
        <div className="ai-response-controls"><textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Cole aqui o JSON retornado pela IA, ou um template de texto entre chaves { }" /></div>
        <small className="template-hint">O botão "Adicionar ao acervo" usa o texto da caixa acima. Se estiver vazia, ele busca automaticamente da área de transferência.</small>
        <div className="template-skeleton-actions template-skeleton-actions-inline"><div className="template-kind-radios" role="radiogroup" aria-label="Tipo de modelo"><label className="template-radio"><input type="radio" name="template-kind" value="prova" checked={templateKind === "prova"} onChange={() => setTemplateKind("prova")} /> Prova</label><label className="template-radio"><input type="radio" name="template-kind" value="quiz" checked={templateKind === "quiz"} onChange={() => setTemplateKind("quiz")} /> Quiz</label><label className="template-radio"><input type="radio" name="template-kind" value="formulario" checked={templateKind === "formulario"} onChange={() => setTemplateKind("formulario")} /> Formulário</label></div><div className="template-buttons"><Button variant="outline" onClick={() => copyTemplate(templateKind, "prompt")}><Copy size={16} /> 💻 Prompt</Button><Button variant="outline" onClick={() => copyTemplate(templateKind, "parser")}><FileJson size={16} /> 📋 Parser</Button><Button className="ink-button" onClick={addToAcervoFromTextOrClipboard}><FileJson size={16} /> Adicionar ao acervo</Button></div></div>
      </section>

      <section className="admin-acervo">
        <div className="section-heading">
          <div><p className="eyebrow">ACERVO DE PROVAS</p><h2>Pesquise, revise ou opere em lote.</h2></div>
          <div className="admin-bulk-actions"><label className="button button-outline file-action admin-import-action"><FileInput size={16} /> Importar<input type="file" multiple accept="application/json,.json" onChange={importAdministrativePackage} /></label><Button variant="outline" disabled={!selected.length} onClick={organizeAcervoRoles}>Cargo</Button><Button variant="outline" disabled={!selected.length} onClick={() => batchEditField("board", "a banca")}>Banca</Button><Button variant="outline" disabled={!selected.length} onClick={() => batchEditField("city", "a cidade")}>Cidade</Button><Button variant="outline" disabled={!selected.length} onClick={() => batchEditField("state", "o país")}>País</Button><Button variant="outline" disabled={!selected.length} onClick={() => batchEditField("title", "o título")}>Título</Button><Button variant="outline" disabled={!selected.length} onClick={() => batchEditField("booklet", "o órgão")}>Órgão</Button><Button variant="outline" disabled={!selected.length} onClick={() => batchEditField("year", "o ano")}>Ano</Button><Button variant="outline" disabled={!selected.length} onClick={() => batchEditField("booklet", "a temática")}>Temática</Button><Button variant="outline" disabled={!selected.length} onClick={organizeAcervoSubjects}>Matéria</Button><Button variant="outline" disabled={!selected.length} onClick={mergeSelectedExams}>Unir selecionadas</Button><Button variant="outline" onClick={selectVisible}>Selecionar página</Button><Button variant="outline" onClick={selectAllAcervo}>Selecionar acervo</Button><Button variant="outline" disabled={!selected.length} onClick={clearSelection}>Limpar</Button><Button className="ink-button" disabled={!selected.length} onClick={exportSelection}><Download size={16} /> Exportar ({selected.length})</Button><Button variant="outline" className="danger-button" disabled={!selected.length} onClick={() => deleteSelection()}><Trash2 size={16} /> Excluir ({selected.length})</Button></div>
        </div>
        <div className="admin-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por cargo, ano, banca, órgão, cidade ou UF" /><span>{filtered.length} resultado(s)</span></div>
        {filtered.length > 0 && <nav className="collection-pagination" aria-label="Páginas do acervo administrativo"><Button variant="outline" disabled={safeAdminPage === 0} onClick={() => setAdminPage((page) => Math.max(0, page - 1))}><ChevronLeft size={16} /> Anteriores</Button><span>Provas {safeAdminPage * ADMIN_PAGE_SIZE + 1}–{Math.min((safeAdminPage + 1) * ADMIN_PAGE_SIZE, filtered.length)} de {filtered.length} · página {safeAdminPage + 1}/{adminPageCount}</span><Button variant="outline" disabled={safeAdminPage >= adminPageCount - 1} onClick={() => setAdminPage((page) => Math.min(adminPageCount - 1, page + 1))}>Próximas <ChevronRight size={16} /></Button></nav>}
          <Card className="paper-card admin-acervo-card"><CardContent className="p-0">{filtered.length ? visibleExams.map((exam) => { const partialSynthetic = isSyntheticExam(exam) && exam.questions.length < SYNTHETIC_BATCH_SIZE; const label = exam.title || exam.role; const bookletNote = !isSyntheticExam(exam) && exam.booklet && !/^\d+$/.test(exam.booklet) ? ` · caderno ${exam.booklet}` : ""; return <div className="admin-exam-row" key={exam.id}><input type="checkbox" checked={selected.includes(exam.id)} onChange={() => toggle(exam.id)} aria-label={`Selecionar ${label}`} /><div><strong>{label}</strong><span>{exam.city} · {exam.state || "UF não informada"} · {exam.year || "Ano não informado"} · {exam.board || "Banca não informada"}{bookletNote} · {exam.questions.length} questões{partialSynthetic ? " · lote parcial exportável" : ""}</span></div><Badge>{partialSynthetic ? "Lote parcial" : exam.status}</Badge><Button variant="outline" onClick={() => { setReviewId(exam.id); }}><ListChecks size={16} /> Revisar</Button><Button className="ink-button" disabled={partialSynthetic} title={partialSynthetic ? "Lotes sintéticos com menos de 30 questões ficam apenas no acervo administrativo." : undefined} onClick={() => onStudy(exam.id)}><Play size={16} /> Testar</Button><Button variant="outline" className="danger-button icon-action" onClick={() => deleteSelection([exam.id])} aria-label={`Excluir ${label}`}><Trash2 size={16} /></Button></div>; }) : <div className="admin-empty">Nenhuma prova corresponde à pesquisa.</div>}</CardContent></Card>
      </section>
    </main>
  );
}
