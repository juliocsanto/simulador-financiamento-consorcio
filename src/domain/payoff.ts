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
import { serieTotalConsorcio, somar, type Simulation } from './simulation';

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
  /* v8 ignore start -- defensivo: na última linha o saldo é 0, então o fundo (>0) sempre o alcança antes do loop acabar */
  return { mesQuitacao: null, vp, vantagemDoFundoVP: vpAmortizando - vp };
}
/* v8 ignore stop */

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
  const prazo = sim.paramsFinHoje.prazoMeses;
  for (let mes = MESES_ENTRE_USOS_FGTS; mes <= prazo; mes += MESES_ENTRE_USOS_FGTS) {
    extras[mes] = fgtsAporteMensal * MESES_ENTRE_USOS_FGTS + (mes === MESES_ENTRE_USOS_FGTS ? fgtsSaldo : 0);
  }
  const result = simulateFinancing({
    ...sim.paramsFinHoje,
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
  const baselineSim = simulateFinancing({ ...sim.paramsFinHoje, amortExtraMensal: 0, modoAmortExtra: 'prazo' });
  const baseline = estrategia(sim.paramsFinHoje, baselineSim, coAa, null, 'Seguir as parcelas até o fim', 0);
  const estrategias = ANOS_QUITACAO_FINANCIAMENTO.filter((a) => a * MESES_POR_ANO < sim.paramsFinHoje.prazoMeses).map(
    (anos) =>
      estrategia(
        sim.paramsFinHoje,
        baselineSim,
        coAa,
        anos,
        `Quitar em ${anos} anos`,
        extraNecessarioParaQuitar(sim.paramsFinHoje, anos),
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
  const baselineSerie = serieTotalConsorcio(sim);
  const baselineVP = vpDe(baselineSerie);
  const baselineNominal = somar(baselineSerie);
  const mesContemplacao = sim.con.contemplacao.mes;
  const quitacoes: QuitacaoConsorcio[] = [];
  // o contrato pode acabar antes do prazo do grupo (ex.: a sobra de crédito quita o saldo na contemplação)
  const fimReal = Math.min(sim.paramsCon.prazoMeses, sim.con.rows[sim.con.rows.length - 1].mes);
  for (const anos of ANOS_QUITACAO_CONSORCIO) {
    // os anos contam a partir de HOJE; com parcelas já pagas o mês do contrato é deslocado (e nunca cai antes de m+1)
    const mes = sim.parcelasPagasConsorcio + anos * MESES_POR_ANO;
    if (mes >= fimReal || mes <= mesContemplacao) continue;
    const alt = simulateConsortium({ ...sim.paramsCon, quitacaoAntecipadaMes: mes });
    const serieAlt = serieTotalConsorcio(sim, alt);
    const vp = vpDe(serieAlt);
    const totalNominal = somar(serieAlt);
    quitacoes.push({
      anos,
      mes,
      valorQuitacao: alt.totals.quitacao,
      totalNominal,
      vp,
      economiaNominal: baselineNominal - totalNominal,
      economiaVP: baselineVP - vp,
      admPaga: alt.totals.adm,
    });
  }
  const dividaReal = realDe(sim.paramsCon.reajusteCartaAa, ipcaAa);
  const coReal = realDe(coAa, ipcaAa);
  return {
    baselineNominal,
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
