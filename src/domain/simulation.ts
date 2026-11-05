import {
  cetAnual,
  simulateFinancing,
  somarFinanciamento,
  type FinancingCalcParams,
  type FinancingResult,
  type FinancingRow,
  type FinancingTotals,
} from './financing';
import {
  restituicaoDaCota,
  simulateConsortium,
  type ConsortiumCalcParams,
  type ConsortiumResult,
  type Restituicao,
} from './consortium';
import { normalizeInput } from './normalize';
import { anualParaMensal, valorPresente, valorReal } from './rates';
import type { ScenarioInput, SituacaoAtual } from './types';

export type CategoriaKey =
  | 'amortizacao'
  | 'juros'
  | 'correcao'
  | 'mip'
  | 'dfi'
  | 'tarifas'
  | 'itbiRegistro'
  | 'admConsorcio'
  | 'fundoReserva'
  | 'seguroConsorcio'
  | 'aluguel'
  | 'lanceCaixa'
  | 'complemento'
  | 'restituicao';

export const CATEGORIAS: ReadonlyArray<{ key: CategoriaKey; label: string }> = [
  { key: 'amortizacao', label: 'Principal (entrada, amortização, fundo comum)' },
  { key: 'juros', label: 'Juros' },
  { key: 'correcao', label: 'Correção monetária (TR)' },
  { key: 'mip', label: 'Seguro MIP' },
  { key: 'dfi', label: 'Seguro DFI' },
  { key: 'tarifas', label: 'Tarifas (avaliação, cadastro, administração)' },
  { key: 'itbiRegistro', label: 'ITBI e registro' },
  { key: 'admConsorcio', label: 'Taxa de administração (consórcio)' },
  { key: 'fundoReserva', label: 'Fundo de reserva (consórcio)' },
  { key: 'seguroConsorcio', label: 'Seguro do consórcio' },
  { key: 'aluguel', label: 'Aluguel até a contemplação' },
  { key: 'lanceCaixa', label: 'Lance em dinheiro' },
  { key: 'complemento', label: 'Complemento do próprio bolso' },
  { key: 'restituicao', label: 'Restituição da cota cancelada (entrada de caixa)' },
];

export type FluxosPorCategoria = Record<CategoriaKey, number[]>;

export interface Fluxos {
  total: number[];
  porCategoria: FluxosPorCategoria;
}

export interface CustosIniciaisFinanciamento {
  entrada: number;
  itbiRegistro: number;
  avaliacao: number;
  cadastro: number;
  total: number;
}

export interface Simulation {
  input: ScenarioInput;
  principal: number;
  custosIniciais: CustosIniciaisFinanciamento;
  paramsFin: FinancingCalcParams;
  paramsCon: ConsortiumCalcParams;
  fin: FinancingResult;
  finCet: number | null;
  con: ConsortiumResult;
  /** maior t (meses a partir de HOJE) com algum fluxo, em qualquer das duas opções */
  horizonte: number;
  situacao: SituacaoAtual;
  /** parcelas já pagas que valem na situação atual (consórcio em andamento OU financiamento em andamento) */
  parcelasPagas: number;
  parcelasPagasConsorcio: number;
  parcelasPagasFinanciamento: number;
  /** custo afundado: soma nominal dos desembolsos dos meses já pagos (fora da comparação) */
  jaPago: { consorcio: number; financiamento: number };
  /** consórcio em andamento: o que volta se a cota for cancelada hoje */
  restituicao?: Restituicao;
  /** financiamento em andamento: saldo devedor hoje, após as parcelas já pagas */
  saldoFinanciamentoHoje?: number;
  /** totais do financiamento a partir de hoje (exclui as parcelas já pagas) */
  finTotals: FinancingTotals;
  /** parâmetros do financiamento "a partir de hoje" (saldo atual e prazo restante quando em andamento) */
  paramsFinHoje: FinancingCalcParams;
}

export function financingParams(
  input: ScenarioInput,
  overrides: Partial<FinancingCalcParams> = {},
): FinancingCalcParams {
  const { comum, financiamento: f } = input;
  return {
    principal: comum.valorImovel * (1 - f.entradaPct),
    valorImovel: comum.valorImovel,
    jurosAa: f.jurosAa,
    trAm: f.trAm,
    prazoMeses: f.prazoMeses,
    sistema: f.sistema,
    mipAm: f.mipAm,
    dfiAm: f.dfiAm,
    tarifaAdmMensal: f.tarifaAdmMensal,
    amortExtraMensal: f.amortExtraMensal,
    modoAmortExtra: f.modoAmortExtra,
    ...overrides,
  };
}

export function consortiumParams(
  input: ScenarioInput,
  overrides: Partial<ConsortiumCalcParams> = {},
): ConsortiumCalcParams {
  const { comum, consorcio: c } = input;
  return {
    valorCarta: c.valorCarta,
    prazoMeses: c.prazoMeses,
    taxaAdmPct: c.taxaAdmPct,
    fundoReservaPct: c.fundoReservaPct,
    seguroAm: c.seguroAm,
    reajusteCartaAa: c.reajusteCartaAa,
    mesContemplacao: c.mesContemplacao,
    lancePct: c.lancePct,
    embutidoPct: c.embutidoPct,
    embutidoAbateSaldo: c.embutidoAbateSaldo,
    modoPosLance: c.modoPosLance,
    tarifaAvaliacaoConsorcio: c.tarifaAvaliacaoConsorcio,
    devolveFundoReserva: c.devolveFundoReserva,
    redutorParcelaPct: c.redutorParcelaPct,
    parcelasPagas: comum.situacaoAtual === 'consorcio-em-andamento' ? c.parcelasPagas : 0,
    valorImovel: comum.valorImovel,
    valorizacaoImovelAa: comum.valorizacaoImovelAa,
    itbiPct: comum.itbiPct,
    registroPct: comum.registroPct,
    aluguelMensal: comum.aluguelMensal,
    reajusteAluguelAa: comum.reajusteAluguelAa,
    ...overrides,
  };
}

export function custosIniciais(input: ScenarioInput): CustosIniciaisFinanciamento {
  const { comum, financiamento: f } = input;
  const entrada = comum.valorImovel * f.entradaPct;
  const itbiRegistro = (comum.itbiPct + comum.registroPct) * comum.valorImovel;
  return {
    entrada,
    itbiRegistro,
    avaliacao: f.tarifaAvaliacao,
    cadastro: f.tarifaCadastro,
    total: entrada + itbiRegistro + f.tarifaAvaliacao + f.tarifaCadastro,
  };
}

const CUSTOS_INICIAIS_ZERO: CustosIniciaisFinanciamento = { entrada: 0, itbiRegistro: 0, avaliacao: 0, cadastro: 0, total: 0 };

/** Roda os dois cálculos mês a mês (entrada é normalizada). */
export function simulate(rawInput: ScenarioInput): Simulation {
  const input = normalizeInput(rawInput);
  const situacao = input.comum.situacaoAtual;
  const consorcioEmAndamento = situacao === 'consorcio-em-andamento';
  const financiamentoEmAndamento = situacao === 'financiamento-em-andamento';
  const pagasCon = consorcioEmAndamento ? input.consorcio.parcelasPagas : 0;
  const pagasFin = financiamentoEmAndamento ? input.financiamento.parcelasPagas : 0;

  const paramsFin = financingParams(input);
  const fin = simulateFinancing(paramsFin);
  const saldoApos = (parcelas: number): number =>
    parcelas === 0 ? paramsFin.principal : (fin.rows[parcelas - 1]?.saldoFinal ?? 0);
  const saldoHoje = saldoApos(pagasFin);
  const saldosFin = financiamentoEmAndamento
    ? Array.from({ length: input.consorcio.prazoMeses + 1 }, (_, j) => saldoApos(pagasFin + j))
    : undefined;

  const paramsCon = consortiumParams(input, saldosFin ? { saldosFinanciamentoAQuitar: saldosFin } : {});
  const con = simulateConsortium(paramsCon);
  const iniciais = custosIniciais(input);
  const finCet = cetAnual(fin, paramsFin.principal, iniciais.avaliacao + iniciais.cadastro);
  const restituicao = consorcioEmAndamento ? restituicaoDaCota(con.rows, paramsCon) : undefined;

  return {
    input,
    principal: paramsFin.principal,
    // financiamento em andamento: entrada, ITBI e tarifas iniciais já foram pagos (e o imóvel já é seu)
    custosIniciais: financiamentoEmAndamento ? CUSTOS_INICIAIS_ZERO : iniciais,
    paramsFin,
    paramsCon,
    fin,
    finCet,
    con,
    horizonte: Math.max(fin.rows.length - pagasFin, con.rows.length - pagasCon, restituicao?.t ?? 0),
    situacao,
    parcelasPagas: pagasCon + pagasFin,
    parcelasPagasConsorcio: pagasCon,
    parcelasPagasFinanciamento: pagasFin,
    jaPago: {
      consorcio: con.jaPago,
      financiamento: fin.rows.filter((r) => r.mes <= pagasFin).reduce((s, r) => s + r.desembolso, 0),
    },
    restituicao,
    saldoFinanciamentoHoje: financiamentoEmAndamento ? saldoHoje : undefined,
    finTotals: pagasFin > 0 ? somarFinanciamento(fin.rows.filter((r) => r.mes > pagasFin)) : fin.totals,
    paramsFinHoje: financiamentoEmAndamento
      ? { ...paramsFin, principal: saldoHoje, prazoMeses: paramsFin.prazoMeses - pagasFin }
      : paramsFin,
  };
}

function fluxosVazios(tamanho: number): FluxosPorCategoria {
  const out = {} as FluxosPorCategoria;
  for (const c of CATEGORIAS) out[c.key] = new Array<number>(tamanho).fill(0);
  return out;
}

function totalizar(porCategoria: FluxosPorCategoria, tamanho: number): number[] {
  const total = new Array<number>(tamanho).fill(0);
  for (const c of CATEGORIAS) {
    const serie = porCategoria[c.key];
    for (let t = 0; t < tamanho; t++) total[t] += serie[t];
  }
  return total;
}

function somarLinhaFinanciamento(cat: FluxosPorCategoria, t: number, r: FinancingRow): void {
  cat.amortizacao[t] += r.amortizacao + r.extra - r.correcao;
  cat.correcao[t] += r.correcao;
  cat.juros[t] += r.juros;
  cat.mip[t] += r.mip;
  cat.dfi[t] += r.dfi;
  cat.tarifas[t] += r.tarifa;
}

/**
 * Fluxos de caixa da OPÇÃO FINANCIAMENTO por categoria, índice 0 = hoje.
 * Meses de contrato já pagos ficam de fora (custo afundado). No consórcio em andamento esta opção inclui a
 * restituição da cota cancelada como entrada de caixa (valor negativo).
 */
export function fluxosFinanciamento(sim: Simulation): Fluxos {
  const n = sim.horizonte + 1;
  const cat = fluxosVazios(n);
  const ini = sim.custosIniciais;
  cat.amortizacao[0] += ini.entrada;
  cat.itbiRegistro[0] += ini.itbiRegistro;
  cat.tarifas[0] += ini.avaliacao + ini.cadastro;
  const pagas = sim.parcelasPagasFinanciamento;
  for (const r of sim.fin.rows) {
    if (r.mes > pagas) somarLinhaFinanciamento(cat, r.mes - pagas, r);
  }
  if (sim.restituicao) cat.restituicao[sim.restituicao.t] -= sim.restituicao.valor;
  return { porCategoria: cat, total: totalizar(cat, n) };
}

/**
 * Fluxos de caixa da OPÇÃO CONSÓRCIO por categoria, índice 0 = hoje. `con` permite avaliar outra contemplação
 * (varredura de equilíbrio) com exatamente as mesmas regras da comparação principal.
 * Financiamento em andamento: as parcelas do financiamento pagas até a contemplação entram nas categorias
 * do financiamento.
 */
export function fluxosConsorcio(sim: Simulation, con: ConsortiumResult = sim.con): Fluxos {
  const pagas = sim.parcelasPagasConsorcio;
  const n = Math.max(sim.horizonte, con.rows.length - pagas) + 1;
  const cat = fluxosVazios(n);
  for (const r of con.rows) {
    if (r.mes <= pagas) continue;
    const t = r.mes - pagas;
    cat.amortizacao[t] += r.fundoComum;
    cat.admConsorcio[t] += r.adm;
    cat.fundoReserva[t] += r.fundoReserva - r.devolucaoFundoReserva;
    cat.seguroConsorcio[t] += r.seguro;
    cat.aluguel[t] += r.aluguel;
    cat.lanceCaixa[t] += r.lanceCaixa;
    cat.complemento[t] += r.complemento;
    cat.itbiRegistro[t] += r.custosCompra;
    cat.tarifas[t] += r.tarifaAvaliacao;
  }
  if (sim.situacao === 'financiamento-em-andamento') {
    const pagasFin = sim.parcelasPagasFinanciamento;
    const espera = sim.fin.rows.slice(pagasFin, pagasFin + con.contemplacao.mes);
    espera.forEach((r, i) => somarLinhaFinanciamento(cat, i + 1, r));
  }
  return { porCategoria: cat, total: totalizar(cat, n) };
}

export interface OpcaoResumo {
  totalNominal: number;
  /** valor presente a custo de oportunidade */
  vp: number;
  /** R$ de hoje (deflacionado pelo IPCA) */
  totalReal: number;
}

export const somar = (serie: readonly number[]): number => serie.reduce((s, v) => s + v, 0);

export function resumirFluxos(
  serie: readonly number[],
  custoOportunidadeAa: number,
  ipcaAa: number,
): OpcaoResumo {
  return {
    totalNominal: somar(serie),
    vp: valorPresente(serie, anualParaMensal(custoOportunidadeAa)),
    totalReal: valorReal(serie, ipcaAa),
  };
}

/** Série de desembolso total (índice 0 = hoje) da opção financiamento: mesma fonte da comparação principal. */
export const serieTotalFinanciamento = (sim: Simulation): number[] => fluxosFinanciamento(sim).total;

/** Série de desembolso total da opção consórcio para uma simulação `con` (padrão: a da comparação). */
export const serieTotalConsorcio = (sim: Simulation, con: ConsortiumResult = sim.con): number[] =>
  fluxosConsorcio(sim, con).total;
