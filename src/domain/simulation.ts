import {
  cetAnual,
  simulateFinancing,
  type FinancingCalcParams,
  type FinancingResult,
} from './financing';
import {
  simulateConsortium,
  type ConsortiumCalcParams,
  type ConsortiumResult,
} from './consortium';
import { normalizeInput } from './normalize';
import { anualParaMensal, valorPresente, valorReal } from './rates';
import type { ScenarioInput } from './types';

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
  | 'complemento';

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
  horizonte: number;
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

/** Roda os dois cálculos mês a mês (entrada é normalizada). */
export function simulate(rawInput: ScenarioInput): Simulation {
  const input = normalizeInput(rawInput);
  const paramsFin = financingParams(input);
  const paramsCon = consortiumParams(input);
  const fin = simulateFinancing(paramsFin);
  const con = simulateConsortium(paramsCon);
  const iniciais = custosIniciais(input);
  const finCet = cetAnual(fin, paramsFin.principal, iniciais.avaliacao + iniciais.cadastro);
  return {
    input,
    principal: paramsFin.principal,
    custosIniciais: iniciais,
    paramsFin,
    paramsCon,
    fin,
    finCet,
    con,
    horizonte: Math.max(fin.rows.length, con.rows.length),
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

/** Fluxos de caixa do financiamento por categoria, índice 0 = hoje. */
export function fluxosFinanciamento(sim: Simulation): Fluxos {
  const n = sim.horizonte + 1;
  const cat = fluxosVazios(n);
  const ini = sim.custosIniciais;
  cat.amortizacao[0] += ini.entrada;
  cat.itbiRegistro[0] += ini.itbiRegistro;
  cat.tarifas[0] += ini.avaliacao + ini.cadastro;
  for (const r of sim.fin.rows) {
    cat.amortizacao[r.mes] += r.amortizacao + r.extra - r.correcao;
    cat.correcao[r.mes] += r.correcao;
    cat.juros[r.mes] += r.juros;
    cat.mip[r.mes] += r.mip;
    cat.dfi[r.mes] += r.dfi;
    cat.tarifas[r.mes] += r.tarifa;
  }
  return { porCategoria: cat, total: totalizar(cat, n) };
}

export function fluxosConsorcio(sim: Simulation): Fluxos {
  const n = sim.horizonte + 1;
  const cat = fluxosVazios(n);
  for (const r of sim.con.rows) {
    cat.amortizacao[r.mes] += r.fundoComum;
    cat.admConsorcio[r.mes] += r.adm;
    cat.fundoReserva[r.mes] += r.fundoReserva - r.devolucaoFundoReserva;
    cat.seguroConsorcio[r.mes] += r.seguro;
    cat.aluguel[r.mes] += r.aluguel;
    cat.lanceCaixa[r.mes] += r.lanceCaixa;
    cat.complemento[r.mes] += r.complemento;
    cat.itbiRegistro[r.mes] += r.custosCompra;
    cat.tarifas[r.mes] += r.tarifaAvaliacao;
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

/** Série de desembolso total da opção a partir das linhas (rápido; usada em varreduras). */
export function serieTotalFinanciamento(sim: Simulation): number[] {
  const serie = [sim.custosIniciais.total];
  for (const r of sim.fin.rows) serie[r.mes] = r.desembolso;
  return serie;
}

export function serieTotalConsorcio(con: ConsortiumResult): number[] {
  const serie = [0];
  for (const r of con.rows) serie[r.mes] = r.desembolso;
  return serie;
}
