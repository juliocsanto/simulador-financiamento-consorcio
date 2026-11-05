import {
  MESES_POR_ANO,
  SALDO_ZERO_TOLERANCIA,
  TIR_FAIXA_MAX_AA,
  TIR_FAIXA_MIN_AA,
  TIR_PASSO_FINO_AM,
} from './constants';
import { anualParaMensal, mensalParaAnual, raizesTir } from './rates';
import type { ModoPosLance } from './types';

export interface ConsortiumCalcParams {
  valorCarta: number;
  prazoMeses: number;
  taxaAdmPct: number;
  fundoReservaPct: number;
  seguroAm: number;
  reajusteCartaAa: number;
  mesContemplacao: number;
  lancePct: number;
  embutidoPct: number;
  embutidoAbateSaldo: boolean;
  modoPosLance: ModoPosLance;
  tarifaAvaliacaoConsorcio: number;
  devolveFundoReserva: boolean;
  valorImovel: number;
  valorizacaoImovelAa: number;
  itbiPct: number;
  registroPct: number;
  aluguelMensal: number;
  reajusteAluguelAa: number;
  /** quitar o saldo devedor logo após pagar a parcela deste mês (precisa ser > contemplação) */
  quitacaoAntecipadaMes?: number;
  /** redutor de parcela (art. 22.6): fração da parcela cheia não paga antes da contemplação (padrão 0) */
  redutorParcelaPct?: number;
  /** parcelas já pagas (custo afundado): contemplação ≥ m+1; aluguel e preço do imóvel contam a partir de m */
  parcelasPagas?: number;
  /**
   * Modo "financiamento em andamento": saldo devedor do financiamento depois de j parcelas de espera (índice j).
   * O crédito disponível na contemplação quita esse saldo em vez de comprar um imóvel (sem ITBI, registro nem aluguel).
   */
  saldosFinanciamentoAQuitar?: readonly number[];
  /** pula a TIR (cara): usado nas varreduras que só olham as linhas e o fluxo de caixa */
  ignorarCustoEfetivo?: boolean;
}

export interface ConsortiumRow {
  mes: number;
  /** parcela total: fundo comum + adm + FR + seguro */
  parcela: number;
  parcelaBase: number;
  fundoComum: number;
  adm: number;
  fundoReserva: number;
  seguro: number;
  aluguel: number;
  lanceCaixa: number;
  complemento: number;
  /** ITBI + registro da compra */
  custosCompra: number;
  tarifaAvaliacao: number;
  /** valor pago na quitação antecipada (já decomposto nas colunas fundoComum/adm/FR) */
  quitacao: number;
  devolucaoFundoReserva: number;
  desembolso: number;
  saldoDevedor: number;
  creditoCorrigido: number;
}

export interface Contemplacao {
  mes: number;
  creditoCorrigido: number;
  base: number;
  lance: number;
  embutido: number;
  lanceCaixa: number;
  creditoDisponivel: number;
  /** preço do imóvel no mês, ou saldo do financiamento a quitar quando `destino` = 'financiamento' */
  precoImovel: number;
  destino: 'imovel' | 'financiamento';
  complemento: number;
  sobraCredito: number;
  saldoAntes: number;
  saldoDepois: number;
}

export interface ConsortiumTotals {
  parcelas: number;
  fundoComum: number;
  adm: number;
  fundoReserva: number;
  seguro: number;
  aluguel: number;
  lanceCaixa: number;
  complemento: number;
  custosCompra: number;
  tarifaAvaliacao: number;
  quitacao: number;
  devolucaoFundoReserva: number;
  desembolso: number;
}

/** Cancelamento de cota não contemplada (art. 11.1.1 / art. 10 do regulamento; STJ Tema 312). */
export interface Restituicao {
  /** percentual do bem pago ao fundo comum até hoje */
  pctAmortizado: number;
  multaPct: number;
  /** crédito corrigido até o fim do grupo */
  creditoPrazo: number;
  valor: number;
  /** mês (a partir de hoje) em que a restituição é recebida */
  t: number;
}

export interface CustoEfetivo {
  taxaAa: number | null;
  status: 'ok' | 'fluxo-misto' | 'sem-raiz';
  raizesAa: number[];
  motivo: string;
}

const MOTIVO_MISTO =
  'Antes da contemplação você poupa e depois toma emprestado; a TIR não mede custo de crédito aqui — use o valor presente.';
const MOTIVO_SEM_RAIZ = 'O fluxo do consórcio não tem TIR numa faixa plausível — use o valor presente.';
const CUSTO_EFETIVO_NAO_CALCULADO: CustoEfetivo = {
  taxaAa: null,
  status: 'sem-raiz',
  raizesAa: [],
  motivo: 'Custo efetivo não calculado nesta varredura.',
};
const MOTIVO_OK = 'Fluxo com formato de empréstimo: a TIR mede o custo do crédito.';

function custoEfetivoDe(fluxo: readonly number[], rows: readonly ConsortiumRow[], k: number): CustoEfetivo {
  const raizesAa = raizesTir(fluxo, anualParaMensal(TIR_FAIXA_MIN_AA), anualParaMensal(TIR_FAIXA_MAX_AA), TIR_PASSO_FINO_AM).map(
    mensalParaAnual,
  );
  if (raizesAa.length === 0) return { taxaAa: null, status: 'sem-raiz', raizesAa, motivo: MOTIVO_SEM_RAIZ };
  if (raizesAa.length > 1) return { taxaAa: null, status: 'fluxo-misto', raizesAa, motivo: MOTIVO_MISTO };
  let antes = 0;
  let depois = 0;
  for (const r of rows) {
    if (r.mes < k) antes += r.parcela;
    else if (r.mes > k) depois += r.parcela + r.quitacao;
  }
  if (depois > antes) return { taxaAa: raizesAa[0], status: 'ok', raizesAa, motivo: MOTIVO_OK };
  return { taxaAa: null, status: 'fluxo-misto', raizesAa, motivo: MOTIVO_MISTO };
}

export interface ConsortiumResult {
  rows: ConsortiumRow[];
  contemplacao: Contemplacao;
  /** totais dos meses a partir de hoje (exclui as parcelas já pagas) */
  totals: ConsortiumTotals;
  /** soma dos desembolsos dos meses já pagos (custo afundado) */
  jaPago: number;
  base0: number;
  custoEfetivo: CustoEfetivo;
}

const MULTA_FAIXA_1_PCT = 0.5;
const MULTA_FAIXA_2_PCT = 0.8;
const MULTA_FAIXA_1 = 0.1;
const MULTA_FAIXA_2 = 0.05;
/** Restituição de cota cancelada: 60 dias após a última assembleia (≈ 2 meses depois do fim do grupo). */
const MESES_RESTITUICAO_APOS_FIM = 2;

export const multaDeCancelamento = (pctAmortizado: number): number =>
  pctAmortizado <= MULTA_FAIXA_1_PCT ? MULTA_FAIXA_1 : pctAmortizado <= MULTA_FAIXA_2_PCT ? MULTA_FAIXA_2 : 0;

/** Quanto volta se a cota (com `parcelasPagas` parcelas pagas) for cancelada hoje. */
export function restituicaoDaCota(rows: readonly ConsortiumRow[], p: ConsortiumCalcParams): Restituicao {
  const m = parcelasPagasEfetivas(p);
  let pctAmortizado = 0;
  for (const r of rows) if (r.mes <= m) pctAmortizado += r.fundoComum / r.creditoCorrigido;
  const reajustes = Math.floor((p.prazoMeses - 1) / MESES_POR_ANO);
  const creditoPrazo = p.valorCarta * (1 + p.reajusteCartaAa) ** reajustes;
  const multaPct = multaDeCancelamento(pctAmortizado);
  return {
    pctAmortizado,
    multaPct,
    creditoPrazo,
    valor: pctAmortizado * creditoPrazo * (1 - multaPct),
    t: p.prazoMeses - m + MESES_RESTITUICAO_APOS_FIM,
  };
}

const parcelasPagasEfetivas = (p: ConsortiumCalcParams): number =>
  Math.min(Math.max(0, Math.round(p.parcelasPagas ?? 0)), p.prazoMeses - 1);

/** Base de incidência do lance: crédito + taxa de administração + fundo de reserva (e não só a carta). */
export const baseDeIncidencia = (credito: number, adm: number, fundoReserva: number): number =>
  credito * (1 + adm + fundoReserva);

export const precoImovelNoMes = (valorImovel: number, valorizacaoAa: number, mes: number): number =>
  valorImovel * (1 + valorizacaoAa) ** (mes / MESES_POR_ANO);

export const aluguelNoMes = (aluguelInicial: number, reajusteAa: number, mes: number): number =>
  aluguelInicial * (1 + reajusteAa) ** Math.floor((mes - 1) / MESES_POR_ANO);

const ehMesDeReajuste = (mes: number): boolean => mes > 1 && (mes - 1) % MESES_POR_ANO === 0;

function calcularContemplacao(
  p: ConsortiumCalcParams,
  mes: number,
  credito: number,
  saldo: number,
  mesesJaPagos: number,
): Contemplacao {
  const base = baseDeIncidencia(credito, p.taxaAdmPct, p.fundoReservaPct);
  const lance = p.lancePct * base;
  const embutido = Math.min(p.embutidoPct, p.lancePct) * base;
  const lanceCaixa = Math.min(lance - embutido, saldo);
  let saldoDepois = saldo - lanceCaixa;
  if (p.embutidoAbateSaldo) saldoDepois -= Math.min(embutido, saldoDepois);
  const creditoDisponivel = credito - embutido;
  const destino = p.saldosFinanciamentoAQuitar ? 'financiamento' : 'imovel';
  const precoImovel = p.saldosFinanciamentoAQuitar
    ? p.saldosFinanciamentoAQuitar[mes]
    : precoImovelNoMes(p.valorImovel, p.valorizacaoImovelAa, mes - mesesJaPagos);
  const complemento = Math.max(0, precoImovel - creditoDisponivel);
  const sobraCredito = Math.max(0, creditoDisponivel - precoImovel);
  saldoDepois -= Math.min(sobraCredito, saldoDepois);
  return {
    mes,
    creditoCorrigido: credito,
    base,
    lance,
    embutido,
    lanceCaixa,
    creditoDisponivel,
    precoImovel,
    destino,
    complemento,
    sobraCredito,
    saldoAntes: saldo,
    saldoDepois,
  };
}

export function simulateConsortium(p: ConsortiumCalcParams): ConsortiumResult {
  const m = parcelasPagasEfetivas(p);
  const redutor = p.redutorParcelaPct ?? 0;
  const k = Math.min(p.prazoMeses, Math.max(m + 1, Math.round(p.mesContemplacao)));
  const divisor = 1 + p.taxaAdmPct + p.fundoReservaPct;
  const base0 = baseDeIncidencia(p.valorCarta, p.taxaAdmPct, p.fundoReservaPct);
  const rows: ConsortiumRow[] = [];
  let saldo = base0;
  let credito = p.valorCarta;
  let contemplado = false;
  let parcelaFixa = 0;
  let contemplacao: Contemplacao | null = null;
  const fluxoCusto: number[] = [0];

  for (let mes = 1; mes <= p.prazoMeses; mes++) {
    if (ehMesDeReajuste(mes)) {
      saldo *= 1 + p.reajusteCartaAa;
      parcelaFixa *= 1 + p.reajusteCartaAa;
      if (!contemplado) credito *= 1 + p.reajusteCartaAa;
    }
    const restantes = p.prazoMeses - mes + 1;
    const usaParcelaFixa = contemplado && p.modoPosLance === 'prazo';
    const usaReducao = redutor > 0 && !contemplado && mes < p.prazoMeses;
    const parcelaBase =
      usaParcelaFixa && mes < p.prazoMeses
        ? Math.min(saldo, parcelaFixa)
        : usaReducao
          ? Math.min(saldo, ((1 - redutor) * credito * divisor) / p.prazoMeses)
          : saldo / restantes;
    const seguro = p.seguroAm * saldo;
    saldo -= parcelaBase;
    if (saldo <= SALDO_ZERO_TOLERANCIA) saldo = 0;

    let fundoComum = parcelaBase / divisor;
    let adm = (parcelaBase * p.taxaAdmPct) / divisor;
    let fundoReserva = (parcelaBase * p.fundoReservaPct) / divisor;
    const pagaAluguel = mes > m && mes <= k && !p.saldosFinanciamentoAQuitar;
    const aluguel = pagaAluguel ? aluguelNoMes(p.aluguelMensal, p.reajusteAluguelAa, mes - m) : 0;

    let lanceCaixa = 0;
    let complemento = 0;
    let custosCompra = 0;
    let tarifaAvaliacao = 0;
    let creditoRecebidoLiquido = 0;
    if (mes === k) {
      contemplacao = calcularContemplacao(p, mes, credito, saldo, m);
      saldo = contemplacao.saldoDepois;
      lanceCaixa = contemplacao.lanceCaixa;
      complemento = contemplacao.complemento;
      custosCompra = p.saldosFinanciamentoAQuitar ? 0 : (p.itbiPct + p.registroPct) * contemplacao.precoImovel;
      tarifaAvaliacao = p.tarifaAvaliacaoConsorcio;
      creditoRecebidoLiquido = contemplacao.creditoDisponivel - lanceCaixa;
      contemplado = true;
      // Com redutor, depois da contemplação a parcela volta ao mínimo da parcela cheia ou do saldo remanescente.
      parcelaFixa =
        redutor > 0 && mes < p.prazoMeses
          ? Math.max((credito * divisor) / p.prazoMeses, saldo / (p.prazoMeses - mes))
          : parcelaBase;
    }

    let quitacao = 0;
    if (p.quitacaoAntecipadaMes === mes && contemplado && saldo > SALDO_ZERO_TOLERANCIA) {
      quitacao = saldo;
      fundoComum += quitacao / divisor;
      adm += (quitacao * p.taxaAdmPct) / divisor;
      fundoReserva += (quitacao * p.fundoReservaPct) / divisor;
      saldo = 0;
    }

    const encerrou = saldo === 0 && contemplado;
    const devolucaoFundoReserva = 0;
    rows.push({
      mes,
      parcela: parcelaBase + seguro,
      parcelaBase,
      fundoComum,
      adm,
      fundoReserva,
      seguro,
      aluguel,
      lanceCaixa,
      complemento,
      custosCompra,
      tarifaAvaliacao,
      quitacao,
      devolucaoFundoReserva,
      desembolso: 0,
      saldoDevedor: saldo,
      creditoCorrigido: credito,
    });
    fluxoCusto[mes] = -(parcelaBase + seguro + quitacao) + creditoRecebidoLiquido;
    if (encerrou) break;
  }

  if (contemplacao === null) {
    throw new Error('Contemplação não ocorreu dentro do prazo do consórcio');
  }

  const ultima = rows[rows.length - 1];
  if (p.devolveFundoReserva) {
    const frPago = rows.reduce((s, r) => s + r.fundoReserva, 0);
    ultima.devolucaoFundoReserva = frPago;
    fluxoCusto[ultima.mes] += frPago;
  }
  for (const r of rows) {
    r.desembolso =
      r.parcela +
      r.quitacao +
      r.aluguel +
      r.lanceCaixa +
      r.complemento +
      r.custosCompra +
      r.tarifaAvaliacao -
      r.devolucaoFundoReserva;
  }

  const futuras = rows.filter((row) => row.mes > m);
  return {
    rows,
    contemplacao,
    totals: somarConsorcio(futuras),
    jaPago: rows.filter((row) => row.mes <= m).reduce((s, row) => s + row.desembolso, 0),
    base0,
    custoEfetivo: p.ignorarCustoEfetivo ? CUSTO_EFETIVO_NAO_CALCULADO : custoEfetivoDe([0, ...fluxoCusto.slice(m + 1)], futuras, k),
  };
}

function somarConsorcio(rows: readonly ConsortiumRow[]): ConsortiumTotals {
  const t: ConsortiumTotals = {
    parcelas: 0,
    fundoComum: 0,
    adm: 0,
    fundoReserva: 0,
    seguro: 0,
    aluguel: 0,
    lanceCaixa: 0,
    complemento: 0,
    custosCompra: 0,
    tarifaAvaliacao: 0,
    quitacao: 0,
    devolucaoFundoReserva: 0,
    desembolso: 0,
  };
  for (const r of rows) {
    t.parcelas += r.parcela;
    t.fundoComum += r.fundoComum;
    t.adm += r.adm;
    t.fundoReserva += r.fundoReserva;
    t.seguro += r.seguro;
    t.aluguel += r.aluguel;
    t.lanceCaixa += r.lanceCaixa;
    t.complemento += r.complemento;
    t.custosCompra += r.custosCompra;
    t.tarifaAvaliacao += r.tarifaAvaliacao;
    t.quitacao += r.quitacao;
    t.devolucaoFundoReserva += r.devolucaoFundoReserva;
    t.desembolso += r.desembolso;
  }
  return t;
}
