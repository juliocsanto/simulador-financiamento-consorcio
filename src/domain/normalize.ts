import { defaultInput } from './defaults';
import type { ScenarioInput, SituacaoAtual } from './types';

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;

const ENTRADA_MAX_PCT = 0.99;
const REDUTOR_MAX_PCT = 0.99;
const SITUACOES: readonly SituacaoAtual[] = ['nova-compra', 'consorcio-em-andamento', 'financiamento-em-andamento'];

const numeroOu = (v: unknown, padrao: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);

/**
 * Cenários salvos antes dos campos de "contrato em andamento" não os têm: completa com os padrões
 * (sem alterar nenhum valor já existente).
 */
export function completarInput(input: ScenarioInput): ScenarioInput {
  const d = defaultInput();
  const situacao = (input.comum as Partial<ScenarioInput['comum']>).situacaoAtual;
  return {
    comum: { ...input.comum, situacaoAtual: SITUACOES.includes(situacao as SituacaoAtual) ? (situacao as SituacaoAtual) : d.comum.situacaoAtual },
    financiamento: {
      ...input.financiamento,
      parcelasPagas: numeroOu((input.financiamento as Partial<ScenarioInput['financiamento']>).parcelasPagas, d.financiamento.parcelasPagas),
    },
    consorcio: {
      ...input.consorcio,
      redutorParcelaPct: numeroOu((input.consorcio as Partial<ScenarioInput['consorcio']>).redutorParcelaPct, d.consorcio.redutorParcelaPct),
      parcelasPagas: numeroOu((input.consorcio as Partial<ScenarioInput['consorcio']>).parcelasPagas, d.consorcio.parcelasPagas),
    },
  };
}

/** Protege os cálculos contra entradas inválidas (divisão por zero, prazos fracionários). */
export function normalizeInput(raw: ScenarioInput): ScenarioInput {
  const input = completarInput(raw);
  const f = input.financiamento;
  const c = input.consorcio;
  const prazoFin = Math.max(1, Math.round(Number.isFinite(f.prazoMeses) ? f.prazoMeses : 1));
  const prazoCon = Math.max(1, Math.round(Number.isFinite(c.prazoMeses) ? c.prazoMeses : 1));
  const lance = clamp(c.lancePct, 0, 1);
  const pagasCon = Math.round(clamp(c.parcelasPagas, 0, prazoCon - 1));
  const pagasFin = Math.round(clamp(f.parcelasPagas, 0, prazoFin - 1));
  // Cota em andamento ainda não foi contemplada: a contemplação só pode ocorrer depois das parcelas já pagas.
  const primeiroMesContemplacao = input.comum.situacaoAtual === 'consorcio-em-andamento' ? pagasCon + 1 : 1;
  return {
    comum: { ...input.comum, valorImovel: Math.max(1, input.comum.valorImovel || 1) },
    financiamento: {
      ...f,
      prazoMeses: prazoFin,
      entradaPct: clamp(f.entradaPct, 0, ENTRADA_MAX_PCT),
      parcelasPagas: pagasFin,
    },
    consorcio: {
      ...c,
      prazoMeses: prazoCon,
      mesContemplacao: Math.round(clamp(c.mesContemplacao, primeiroMesContemplacao, prazoCon)),
      lancePct: lance,
      embutidoPct: clamp(c.embutidoPct, 0, lance),
      redutorParcelaPct: clamp(c.redutorParcelaPct, 0, REDUTOR_MAX_PCT),
      parcelasPagas: pagasCon,
    },
  };
}
