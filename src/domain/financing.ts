import { SALDO_ZERO_TOLERANCIA } from './constants';
import { anualParaMensal, irrAnual, pmt } from './rates';
import type { ModoAmortExtra, SistemaAmortizacao } from './types';

export interface FinancingCalcParams {
  principal: number;
  valorImovel: number;
  jurosAa: number;
  trAm: number;
  prazoMeses: number;
  sistema: SistemaAmortizacao;
  mipAm: number;
  dfiAm: number;
  tarifaAdmMensal: number;
  amortExtraMensal: number;
  modoAmortExtra: ModoAmortExtra;
  /** amortizações extras pontuais (ex.: FGTS), por mês */
  extrasPontuais?: Readonly<Record<number, number>>;
}

export interface FinancingRow {
  mes: number;
  saldoInicial: number;
  correcao: number;
  juros: number;
  amortizacao: number;
  extra: number;
  mip: number;
  dfi: number;
  tarifa: number;
  /** amortização + juros */
  parcela: number;
  /** tudo que sai do bolso no mês (parcela + seguros + tarifa + extra) */
  desembolso: number;
  saldoFinal: number;
}

export interface FinancingTotals {
  juros: number;
  amortizacao: number;
  extra: number;
  correcao: number;
  mip: number;
  dfi: number;
  tarifa: number;
  desembolso: number;
}

export interface FinancingResult {
  rows: FinancingRow[];
  totals: FinancingTotals;
  taxaMensal: number;
}

/** Amortização/parcela-alvo sem extra: regra do saldo/n restante (equivale a A0*(1+TR)^t no modo prazo). */
function amortizacaoBase(
  p: FinancingCalcParams,
  saldoCorrigido: number,
  juros: number,
  taxaMensal: number,
  mes: number,
  amortInicial: number,
  parcelaInicial: number,
): number {
  const restantes = p.prazoMeses - mes + 1;
  const fatorTR = (1 + p.trAm) ** mes;
  const usaRegraPrazo = p.modoAmortExtra === 'prazo';
  if (p.sistema === 'SAC') {
    return usaRegraPrazo ? Math.min(saldoCorrigido, amortInicial * fatorTR) : saldoCorrigido / restantes;
  }
  if (usaRegraPrazo) {
    const parcela = Math.min(saldoCorrigido + juros, parcelaInicial * fatorTR);
    return parcela - juros;
  }
  return pmt(saldoCorrigido, taxaMensal, restantes) - juros;
}

export function simulateFinancing(p: FinancingCalcParams): FinancingResult {
  const taxaMensal = anualParaMensal(p.jurosAa);
  const amortInicial = p.principal / p.prazoMeses;
  const parcelaInicial = pmt(p.principal, taxaMensal, p.prazoMeses);
  const rows: FinancingRow[] = [];
  let saldo = p.principal;

  for (let mes = 1; mes <= p.prazoMeses && saldo > SALDO_ZERO_TOLERANCIA; mes++) {
    const saldoCorrigido = saldo * (1 + p.trAm);
    const juros = saldoCorrigido * taxaMensal;
    let amortizacao =
      mes === p.prazoMeses
        ? saldoCorrigido
        : amortizacaoBase(p, saldoCorrigido, juros, taxaMensal, mes, amortInicial, parcelaInicial);
    amortizacao = Math.max(0, Math.min(amortizacao, saldoCorrigido));
    const extraDesejado = p.amortExtraMensal + (p.extrasPontuais?.[mes] ?? 0);
    const extra = Math.max(0, Math.min(extraDesejado, saldoCorrigido - amortizacao));
    let saldoFinal = saldoCorrigido - amortizacao - extra;
    if (saldoFinal <= SALDO_ZERO_TOLERANCIA) saldoFinal = 0;
    const mip = p.mipAm * saldoCorrigido;
    const dfi = p.dfiAm * p.valorImovel;
    const parcela = amortizacao + juros;
    rows.push({
      mes,
      saldoInicial: saldo,
      correcao: saldoCorrigido - saldo,
      juros,
      amortizacao,
      extra,
      mip,
      dfi,
      tarifa: p.tarifaAdmMensal,
      parcela,
      desembolso: parcela + mip + dfi + p.tarifaAdmMensal + extra,
      saldoFinal,
    });
    saldo = saldoFinal;
  }
  return { rows, totals: somarFinanciamento(rows), taxaMensal };
}

function somarFinanciamento(rows: readonly FinancingRow[]): FinancingTotals {
  const zero: FinancingTotals = {
    juros: 0,
    amortizacao: 0,
    extra: 0,
    correcao: 0,
    mip: 0,
    dfi: 0,
    tarifa: 0,
    desembolso: 0,
  };
  for (const r of rows) {
    zero.juros += r.juros;
    zero.amortizacao += r.amortizacao;
    zero.extra += r.extra;
    zero.correcao += r.correcao;
    zero.mip += r.mip;
    zero.dfi += r.dfi;
    zero.tarifa += r.tarifa;
    zero.desembolso += r.desembolso;
  }
  return zero;
}

/** CET (a.a.): TIR de [+principal - tarifas iniciais, -desembolsos...]. */
export function cetAnual(
  result: FinancingResult,
  principal: number,
  tarifasIniciais: number,
): number | null {
  const fluxos = [principal - tarifasIniciais, ...result.rows.map((r) => -r.desembolso)];
  return irrAnual(fluxos);
}
