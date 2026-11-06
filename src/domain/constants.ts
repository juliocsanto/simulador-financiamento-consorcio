/** Constantes nomeadas do domínio (sem números mágicos espalhados). */
export const MESES_POR_ANO = 12;
export const SALDO_ZERO_TOLERANCIA = 0.005;
export const EMPATE_TECNICO_PCT_IMOVEL = 0.01;
export const JANELA_FRONT_LOADING_MESES = 60;
export const SENSIBILIDADE_CO_PP = 0.03;
export const ALERTA_JUROS_ALTOS_AA = 0.12;
export const ANOS_QUITACAO_FINANCIAMENTO = [5, 7, 10, 15] as const;
export const ANOS_QUITACAO_CONSORCIO = [3, 5, 7, 10] as const;
export const AMORT_EXTRA_REFERENCIA = 1000;
export const LANCE_REFERENCIA_PCT = 0.3;
export const EMBUTIDO_TETO_TIPICO_PCT = 0.3;
export const MESES_ENTRE_USOS_FGTS = 24;
export const PAGINA_CRONOGRAMA = 36;
export const IRR_TOLERANCIA_RELATIVA = 1e-9;
export const IRR_MAX_ITERACOES = 200;
export const IRR_CHUTE_INICIAL = 0.01;
export const IRR_GRADE_MIN = -0.5;
export const IRR_GRADE_MAX = 1.5;
export const IRR_GRADE_PASSO = 0.005;
/** Faixa plausível de TIR anual para fluxos com mais de uma troca de sinal. */
export const TIR_FAIXA_MIN_AA = -0.5;
export const TIR_FAIXA_MAX_AA = 1.0;
/** Passo (mensal) da varredura fina de raízes. */
export const TIR_PASSO_FINO_AM = 0.0002;
export const BISSECAO_ITERACOES = 60;
/**
 * Tarifa de avaliação (vistoria do imóvel) acima desta fração do valor do imóvel é quase certamente
 * erro de digitação: o usuário informou o preço do imóvel no campo da tarifa (caso real, nov/2026:
 * R$ 920.000 de "avaliação"). A tarifa de mercado fica na casa de R$ 1 mil a R$ 4 mil.
 */
export const TARIFA_AVALIACAO_MAX_PCT_IMOVEL = 0.02;
export const tarifaImplausivel = (tarifa: number, valorImovel: number): boolean =>
  valorImovel > 0 && tarifa > TARIFA_AVALIACAO_MAX_PCT_IMOVEL * valorImovel;
