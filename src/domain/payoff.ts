import {
  ANOS_QUITACAO_CONSORCIO,
  ANOS_QUITACAO_FINANCIAMENTO,
  BISSECAO_ITERACOES,
  MESES_ENTRE_USOS_FGTS,
  MESES_POR_ANO,
} from './constants';
import { simulateConsortium } from './consortium';
import { simulateFinancing, type FinancingCalcParams, type FinancingResult } from './financing';
import { anualParaMensal, valorPresente } from './rates';
import { consortiumParams, serieTotalConsorcio, type Simulation } from './simulation';

/** VP (a custo de oportunidade) apenas das parcelas do financiamento, mês 1 em diante. */
function vpFinanciamento(result: FinancingResult, coAa: number): number {
  const serie = [0, ...result.rows.map((r) => r.desembolso)];
  return valorPresente(serie, anualParaMensal(coAa));
}

/** Menor amortização extra mensal (modo prazo) que quita o financiamento em até `anos` anos. */
export function extraNecessarioParaQuitar(params: FinancingCalcParams, anos: number): number {
  const meses = anos * MESES_POR_ANO;
  const cabe = (extra: number): boolean =>
    simulateFinancing({ ...params, amortExtraMensal: extra, modoAmortExtra: 'prazo', extrasPontuais: undefined })
      .rows.length <= meses;
  if (cabe(0)) return 0;
  let lo = 0;
  let hi = params.principal;
  for (let i = 0; i < BISSECAO_ITERACOES; i++) {
    const mid = (lo + hi) / 2;
    if (cabe(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface FundoQuitacao {
  /** mês em que o fundo (extra investido ao custo de oportunidade) cobre o saldo devedor */
  mesQuitacao: number | null;
  vp: number;
  /** VP de amortizar todo mês menos VP do fundo. Positivo: o fundo é mais barato. */
  vantagemDoFundoVP: number;
}

export interface EstrategiaFinanciamento {
  anosAlvo: number | null;
  rotulo: string;
  extraMensal: number;
  parcelaInicialTotal: number;
  meses: number;
  totalNominal: number;
  vp: number;
  jurosPagos: number;
  jurosEconomizados: number;
  fundo: FundoQuitacao | null;
}

export interface UsoFgts {
  meses: number;
  mesesReduzidos: number;
  jurosPagos: number;
  jurosEconomizados: number;
  totalFgtsUsado: number;
  /** nominal pago do próprio bolso (sem o FGTS) */
  totalNominalBolso: number;
}

export interface PlanoFinanciamento {
  baseline: EstrategiaFinanciamento;
  estrategias: EstrategiaFinanciamento[];
  fgts: UsoFgts | null;
  cet: number | null;
  custoOportunidadeAa: number;
  /** regra da wiki: amortizar só compensa se CET > custo de oportunidade */
  amortizarCompensa: boolean | null;
}

function fundoDeQuitacao(
  baseline: FinancingResult,
  extra: number,
  coAa: number,
  vpAmortizando: number,
): FundoQuitacao {
  const taxa = anualParaMensal(coAa);
  let fundo = 0;
  let vp = 0;
  for (const r of baseline.rows) {
    fundo = fundo * (1 + taxa) + extra;
    vp += (r.desembolso + extra) / (1 + taxa) ** r.mes;
    if (fundo >= r.saldoFinal) {
      vp -= (fundo - r.saldoFinal) / (1 + taxa) ** r.mes;
      return { mesQuitacao: r.mes, vp, vantagemDoFundoVP: vpAmortizando - vp };
    }
  }
  return { mesQuitacao: null, vp, vantagemDoFundoVP: vpAmortizando - vp };
}

function estrategia(
  params: FinancingCalcParams,
  baseline: FinancingResult,
  coAa: number,
  anos: number | null,
  rotulo: string,
  extra: number,
): EstrategiaFinanciamento {
  const result = simulateFinancing({
    ...params,
    amortExtraMensal: extra,
    modoAmortExtra: 'prazo',
    extrasPontuais: undefined,
  });
  const vp = vpFinanciamento(result, coAa);
  return {
    anosAlvo: anos,
    rotulo,
    extraMensal: extra,
    parcelaInicialTotal: result.rows[0]?.desembolso ?? 0,
    meses: result.rows.length,
    totalNominal: result.totals.desembolso,
    vp,
    jurosPagos: result.totals.juros,
    jurosEconomizados: baseline.totals.juros - result.totals.juros,
    fundo: extra > 0 ? fundoDeQuitacao(baseline, extra, coAa, vp) : null,
  };
}

function usoFgts(sim: Simulation, baselineJuros: number, baselineMeses: number): UsoFgts | null {
  const { fgtsSaldo, fgtsAporteMensal } = sim.input.financiamento;
  if (fgtsSaldo <= 0 && fgtsAporteMensal <= 0) return null;
  const extras: Record<number, number> = {};
  const prazo = sim.paramsFin.prazoMeses;
  for (let mes = MESES_ENTRE_USOS_FGTS; mes <= prazo; mes += MESES_ENTRE_USOS_FGTS) {
    extras[mes] = fgtsAporteMensal * MESES_ENTRE_USOS_FGTS + (mes === MESES_ENTRE_USOS_FGTS ? fgtsSaldo : 0);
  }
  const result = simulateFinancing({
    ...sim.paramsFin,
    amortExtraMensal: 0,
    modoAmortExtra: 'prazo',
    extrasPontuais: extras,
  });
  const fgtsUsado = result.rows.reduce((s, r) => s + Math.min(r.extra, extras[r.mes] ?? 0), 0);
  return {
    meses: result.rows.length,
    mesesReduzidos: baselineMeses - result.rows.length,
    jurosPagos: result.totals.juros,
    jurosEconomizados: baselineJuros - result.totals.juros,
    totalFgtsUsado: fgtsUsado,
    totalNominalBolso: result.totals.desembolso - fgtsUsado,
  };
}

export function planoFinanciamento(sim: Simulation): PlanoFinanciamento {
  const coAa = sim.input.comum.custoOportunidadeAa;
  const baselineSim = simulateFinancing({ ...sim.paramsFin, amortExtraMensal: 0, modoAmortExtra: 'prazo' });
  const baseline = estrategia(sim.paramsFin, baselineSim, coAa, null, 'Seguir as parcelas até o fim', 0);
  const estrategias = ANOS_QUITACAO_FINANCIAMENTO.filter((a) => a * MESES_POR_ANO < sim.paramsFin.prazoMeses).map(
    (anos) =>
      estrategia(
        sim.paramsFin,
        baselineSim,
        coAa,
        anos,
        `Quitar em ${anos} anos`,
        extraNecessarioParaQuitar(sim.paramsFin, anos),
      ),
  );
  const cet = sim.finCet;
  return {
    baseline,
    estrategias,
    fgts: usoFgts(sim, baselineSim.totals.juros, baselineSim.rows.length),
    cet,
    custoOportunidadeAa: coAa,
    amortizarCompensa: cet === null ? null : cet > coAa,
  };
}

export interface QuitacaoConsorcio {
  anos: number;
  mes: number;
  valorQuitacao: number;
  totalNominal: number;
  vp: number;
  economiaNominal: number;
  /** VP de seguir pagando menos VP de quitar. Positivo: quitar é mais barato. */
  economiaVP: number;
  admPaga: number;
}

export interface PlanoConsorcio {
  baselineNominal: number;
  baselineVP: number;
  baselineAdm: number;
  quitacoes: QuitacaoConsorcio[];
  /** custo real do saldo restante após a contemplação: corrigido pelo reajuste da carta (a adm não é descontada na antecipação) */
  custoDividaRestanteRealAa: number;
  custoOportunidadeRealAa: number;
  /** wiki G6: antecipar só faz sentido se o custo real da dívida restante superar o custo de oportunidade real */
  quitarCompensa: boolean | null;
}

const realDe = (nominalAa: number, ipcaAa: number): number => (1 + nominalAa) / (1 + ipcaAa) - 1;

export function planoConsorcio(sim: Simulation): PlanoConsorcio {
  const { custoOportunidadeAa: coAa, ipcaAa } = sim.input.comum;
  const taxa = anualParaMensal(coAa);
  const vpDe = (serie: number[]): number => valorPresente(serie, taxa);
  const baselineVP = vpDe(serieTotalConsorcio(sim.con));
  const mesContemplacao = sim.con.contemplacao.mes;
  const quitacoes: QuitacaoConsorcio[] = [];
  for (const anos of ANOS_QUITACAO_CONSORCIO) {
    const mes = anos * MESES_POR_ANO;
    if (mes >= sim.paramsCon.prazoMeses || mes <= mesContemplacao) continue;
    const alt = simulateConsortium(consortiumParams(sim.input, { quitacaoAntecipadaMes: mes }));
    const vp = vpDe(serieTotalConsorcio(alt));
    quitacoes.push({
      anos,
      mes,
      valorQuitacao: alt.totals.quitacao,
      totalNominal: alt.totals.desembolso,
      vp,
      economiaNominal: sim.con.totals.desembolso - alt.totals.desembolso,
      economiaVP: baselineVP - vp,
      admPaga: alt.totals.adm,
    });
  }
  const dividaReal = realDe(sim.paramsCon.reajusteCartaAa, ipcaAa);
  const coReal = realDe(coAa, ipcaAa);
  return {
    baselineNominal: sim.con.totals.desembolso,
    baselineVP,
    baselineAdm: sim.con.totals.adm,
    quitacoes,
    custoDividaRestanteRealAa: dividaReal,
    custoOportunidadeRealAa: coReal,
    quitarCompensa: dividaReal > coReal,
  };
}

export interface PlanoQuitacao {
  financiamento: PlanoFinanciamento;
  consorcio: PlanoConsorcio;
}

export function buildPayoffPlan(sim: Simulation): PlanoQuitacao {
  return { financiamento: planoFinanciamento(sim), consorcio: planoConsorcio(sim) };
}

export interface ComparacaoModosExtra {
  extraMensal: number;
  vpPrazo: number;
  vpParcela: number;
  mesesPrazo: number;
  mesesParcela: number;
  parcelaFinalParcela: number;
}

/** Mesmo extra mensal aplicado reduzindo prazo vs reduzindo parcela. */
export function compararModosExtra(params: FinancingCalcParams, extraMensal: number, coAa: number): ComparacaoModosExtra {
  const prazo = simulateFinancing({ ...params, amortExtraMensal: extraMensal, modoAmortExtra: 'prazo' });
  const parcela = simulateFinancing({ ...params, amortExtraMensal: extraMensal, modoAmortExtra: 'parcela' });
  return {
    extraMensal,
    vpPrazo: vpFinanciamento(prazo, coAa),
    vpParcela: vpFinanciamento(parcela, coAa),
    mesesPrazo: prazo.rows.length,
    mesesParcela: parcela.rows.length,
    parcelaFinalParcela: parcela.rows[parcela.rows.length - 1]?.desembolso ?? 0,
  };
}
