import type { ScenarioInput } from './types';

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

const ENTRADA_MAX_PCT = 0.99;

/** Protege os cálculos contra entradas inválidas (divisão por zero, prazos fracionários). */
export function normalizeInput(input: ScenarioInput): ScenarioInput {
  const f = input.financiamento;
  const c = input.consorcio;
  const prazoFin = Math.max(1, Math.round(Number.isFinite(f.prazoMeses) ? f.prazoMeses : 1));
  const prazoCon = Math.max(1, Math.round(Number.isFinite(c.prazoMeses) ? c.prazoMeses : 1));
  const lance = clamp(c.lancePct, 0, 1);
  return {
    comum: { ...input.comum, valorImovel: Math.max(1, input.comum.valorImovel || 1) },
    financiamento: { ...f, prazoMeses: prazoFin, entradaPct: clamp(f.entradaPct, 0, ENTRADA_MAX_PCT) },
    consorcio: {
      ...c,
      prazoMeses: prazoCon,
      mesContemplacao: Math.round(clamp(c.mesContemplacao, 1, prazoCon)),
      lancePct: lance,
      embutidoPct: clamp(c.embutidoPct, 0, lance),
    },
  };
}
