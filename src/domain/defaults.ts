import type { ScenarioInput } from './types';

const VALOR_IMOVEL_PADRAO = 600_000;
const ALUGUEL_PCT_IMOVEL = 0.004;

export function defaultInput(): ScenarioInput {
  return {
    comum: {
      situacaoAtual: 'nova-compra',
      valorImovel: VALOR_IMOVEL_PADRAO,
      valorizacaoImovelAa: 0.062,
      ipcaAa: 0.046,
      custoOportunidadeAa: 0.114,
      itbiPct: 0.03,
      registroPct: 0.006,
      aluguelMensal: VALOR_IMOVEL_PADRAO * ALUGUEL_PCT_IMOVEL,
      reajusteAluguelAa: 0.046,
    },
    financiamento: {
      sistema: 'SAC',
      entradaPct: 0.2,
      jurosAa: 0.115,
      trAm: 0.0015,
      prazoMeses: 360,
      mipAm: 0.00021,
      dfiAm: 0.000034,
      tarifaAdmMensal: 25,
      tarifaAvaliacao: 3000,
      tarifaCadastro: 1000,
      amortExtraMensal: 0,
      modoAmortExtra: 'prazo',
      fgtsSaldo: 0,
      fgtsAporteMensal: 0,
      parcelasPagas: 0,
    },
    consorcio: {
      valorCarta: VALOR_IMOVEL_PADRAO,
      prazoMeses: 200,
      taxaAdmPct: 0.19,
      fundoReservaPct: 0.005,
      seguroAm: 0,
      reajusteCartaAa: 0.056,
      mesContemplacao: 24,
      lancePct: 0,
      embutidoPct: 0,
      embutidoAbateSaldo: false,
      modoPosLance: 'parcela',
      tarifaAvaliacaoConsorcio: 2000,
      devolveFundoReserva: false,
      redutorParcelaPct: 0,
      parcelasPagas: 0,
    },
  };
}
