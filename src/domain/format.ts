const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const brlCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const num1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtBRL = (v: number): string => brl.format(Number.isFinite(v) ? v : 0);
export const fmtBRLCents = (v: number): string => brlCents.format(Number.isFinite(v) ? v : 0);

/** Fração para texto: 0,115 vira "11,5%". Null vira "n/d". */
export const fmtPct = (frac: number | null | undefined, casas: 1 | 2 = 1): string => {
  if (frac === null || frac === undefined || !Number.isFinite(frac)) return 'n/d';
  return `${(casas === 1 ? num1 : num2).format(frac * 100)}%`;
};
/** Custo para prosa: positivo vira "custa R$ X"; negativo (entra mais do que sai) vira "rende R$ X líquidos". */
export const fmtCustoLiquido = (v: number): string => (v < 0 ? `rende ${fmtBRL(-v)} líquidos` : `custa ${fmtBRL(v)}`);
export const fmtNum =(v: number): string => num2.format(v);
export const fmtX = (v: number): string => `${num1.format(v)}x`;
export const fmtMeses = (m: number): string => {
  const anos = Math.floor(m / 12);
  const resto = m % 12;
  if (anos === 0) return `${m} meses`;
  return resto === 0 ? `${anos} anos (${m} meses)` : `${anos}a ${resto}m (${m} meses)`;
};
