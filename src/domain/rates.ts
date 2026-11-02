import {
  BISSECAO_ITERACOES,
  IRR_CHUTE_INICIAL,
  IRR_GRADE_MAX,
  IRR_GRADE_MIN,
  IRR_GRADE_PASSO,
  IRR_MAX_ITERACOES,
  IRR_TOLERANCIA_RELATIVA,
  MESES_POR_ANO,
  TIR_FAIXA_MAX_AA,
  TIR_FAIXA_MIN_AA,
  TIR_PASSO_FINO_AM,
} from './constants';

export const anualParaMensal = (taxaAa: number): number => (1 + taxaAa) ** (1 / MESES_POR_ANO) - 1;
export const mensalParaAnual = (taxaAm: number): number => (1 + taxaAm) ** MESES_POR_ANO - 1;

/** Prestação constante (Tabela PRICE). Taxa zero: divisão simples. */
export function pmt(principal: number, taxaAm: number, nPeriodos: number): number {
  if (nPeriodos <= 0) return principal;
  if (taxaAm === 0) return principal / nPeriodos;
  return (principal * taxaAm) / (1 - (1 + taxaAm) ** -nPeriodos);
}

/** Valor presente de fluxos indexados por mês (índice 0 = hoje, sem desconto). */
export function valorPresente(fluxos: readonly number[], taxaAm: number): number {
  let total = 0;
  for (let t = 0; t < fluxos.length; t++) total += fluxos[t] / (1 + taxaAm) ** t;
  return total;
}

/** Valor "em R$ de hoje": cada fluxo deflacionado por (1+ipca)^(t/12). */
export function valorReal(fluxos: readonly number[], ipcaAa: number): number {
  return valorPresente(fluxos, anualParaMensal(ipcaAa));
}

function derivada(fluxos: readonly number[], r: number): number {
  let total = 0;
  for (let t = 1; t < fluxos.length; t++) total -= (t * fluxos[t]) / (1 + r) ** (t + 1);
  return total;
}

function newton(fluxos: readonly number[], tol: number): number | null {
  let r = IRR_CHUTE_INICIAL;
  for (let i = 0; i < IRR_MAX_ITERACOES; i++) {
    const f = valorPresente(fluxos, r);
    const d = derivada(fluxos, r);
    if (!Number.isFinite(f) || !Number.isFinite(d) || d === 0) return null;
    const next = r - f / d;
    if (!Number.isFinite(next) || next <= -0.999) return null;
    if (Math.abs(next - r) < 1e-15) return Math.abs(valorPresente(fluxos, next)) <= tol ? next : null;
    r = next;
  }
  return Math.abs(valorPresente(fluxos, r)) <= tol ? r : null;
}

function bissecao(fluxos: readonly number[], a: number, b: number): number {
  let lo = a;
  let hi = b;
  const sinalLo = Math.sign(valorPresente(fluxos, lo));
  for (let i = 0; i < BISSECAO_ITERACOES * 2; i++) {
    const mid = (lo + hi) / 2;
    const fm = valorPresente(fluxos, mid);
    if (fm === 0) return mid;
    if (Math.sign(fm) === sinalLo) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Todas as raízes (taxa mensal) do VP em [minAm, maxAm]: varre com `passo` e refina cada troca de sinal por bisseção. */
export function raizesTir(fluxos: readonly number[], minAm: number, maxAm: number, passo: number): number[] {
  const raizes: number[] = [];
  let anterior = minAm;
  let fAnterior = valorPresente(fluxos, anterior);
  if (fAnterior === 0) raizes.push(anterior);
  const n = Math.max(1, Math.ceil((maxAm - minAm) / passo));
  for (let i = 1; i <= n; i++) {
    const r = Math.min(maxAm, minAm + i * passo);
    const f = valorPresente(fluxos, r);
    if (Number.isFinite(f) && Number.isFinite(fAnterior)) {
      if (f === 0) raizes.push(r);
      else if (fAnterior !== 0 && Math.sign(f) !== Math.sign(fAnterior)) raizes.push(bissecao(fluxos, anterior, r));
    }
    anterior = r;
    fAnterior = f;
  }
  return raizes;
}

function trocasDeSinal(fluxos: readonly number[]): number {
  let trocas = 0;
  let ultimo = 0;
  for (const v of fluxos) {
    const s = Math.sign(v);
    if (s === 0) continue;
    if (ultimo !== 0 && s !== ultimo) trocas++;
    ultimo = s;
  }
  return trocas;
}

/** TIR mensal. Com mais de uma troca de sinal só devolve a raiz se for única na faixa plausível. Senão: Newton; se falhar, varre uma grade procurando troca de sinal e faz bisseção. Null se não há raiz. */
export function irr(fluxos: readonly number[]): number | null {
  const soma = fluxos.reduce((s, v) => s + Math.abs(v), 0);
  if (soma === 0) return null;
  if (!fluxos.some((v) => v > 0) || !fluxos.some((v) => v < 0)) return null;
  if (trocasDeSinal(fluxos) > 1) {
    const raizes = raizesTir(fluxos, anualParaMensal(TIR_FAIXA_MIN_AA), anualParaMensal(TIR_FAIXA_MAX_AA), TIR_PASSO_FINO_AM);
    return raizes.length === 1 ? raizes[0] : null;
  }
  const tol = IRR_TOLERANCIA_RELATIVA * soma;
  const viaNewton = newton(fluxos, tol);
  if (viaNewton !== null) return viaNewton;
  let anterior = IRR_GRADE_MIN;
  let fAnterior = valorPresente(fluxos, anterior);
  for (let r = IRR_GRADE_MIN + IRR_GRADE_PASSO; r <= IRR_GRADE_MAX; r += IRR_GRADE_PASSO) {
    const f = valorPresente(fluxos, r);
    if (Number.isFinite(f) && Number.isFinite(fAnterior) && Math.sign(f) !== Math.sign(fAnterior)) {
      return bissecao(fluxos, anterior, r);
    }
    anterior = r;
    fAnterior = f;
  }
  return null;
}

export function irrAnual(fluxos: readonly number[]): number | null {
  const m = irr(fluxos);
  return m === null ? null : mensalParaAnual(m);
}
