/** Motor de classificação de dificuldade — superfície pública única. */
export * from "./tipos";
export {
  AREAS_PADRAO,
  CONFIG_PADRAO,
  PADROES_CONTEXTUAIS_PADRAO,
  PERFIS_EMBUTIDOS,
  PESOS_TEMA_PADRAO,
  cloneConfig,
  mesclarConfig,
  normalizarConfig,
  pesoTemaDe,
} from "./config";
export { assuntoTema, avaliarQuestao, jaccard, palavras } from "./motor";
export type { ExtraAvaliacao } from "./motor";
export {
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
