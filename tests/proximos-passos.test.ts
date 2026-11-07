import { describe, expect, it } from 'vitest';
import { simulateComparison } from '../src/application/useCases';
import { defaultInput } from '../src/domain/defaults';
import { anualParaMensal, valorPresente } from '../src/domain/rates';
import { fluxosConsorcio, fluxosFinanciamento, simulate } from '../src/domain/simulation';
import type { ScenarioInput } from '../src/domain/types';

/** Caso real (nov/2026): cota com 41 parcelas pagas, lance de 60% no mês 42, imóvel de R$ 920 mil. */
function caso(entradaPct: number, mod?: (i: ScenarioInput) => void): ScenarioInput {
  const i = defaultInput();
  i.comum.situacaoAtual = 'consorcio-em-andamento';
  i.comum.valorImovel = 920_000;
  i.consorcio.valorCarta = 1_000_000;
  i.consorcio.redutorParcelaPct = 0.35;
  i.consorcio.lancePct = 0.6;
  i.consorcio.parcelasPagas = 41;
  i.consorcio.mesContemplacao = 42;
  i.financiamento.entradaPct = entradaPct;
  mod?.(i);
  return i;
}

const diffDe = (i: ScenarioInput): number => {
  const sim = simulate(i);
  const t = anualParaMensal(sim.input.comum.custoOportunidadeAa);
  return valorPresente(fluxosFinanciamento(sim).total, t) - valorPresente(fluxosConsorcio(sim).total, t);
};

describe('próximos passos: consórcio em andamento e financiamento melhor', () => {
  it('só aparece quando há cota em andamento E o financiamento vence', () => {
    expect(simulateComparison(caso(0.2)).comparacao.verdict.vencedor).toBe('consorcio');
    expect(simulateComparison(caso(0.2)).proximosPassos).toBeNull();
    expect(simulateComparison(caso(0.5)).proximosPassos).toBeNull(); // empate
    expect(simulateComparison(defaultInput()).proximosPassos).toBeNull(); // nova compra
    const r = simulateComparison(caso(0.7));
    expect(r.comparacao.verdict.vencedor).toBe('financiamento');
    expect(r.proximosPassos).not.toBeNull();
  });

  it('a vantagem informada é a do veredito', () => {
    const r = simulateComparison(caso(0.7));
    expect(r.proximosPassos!.vantagemFinanciamentoVP).toBeCloseTo(-r.comparacao.verdict.diffPV, 6);
  });

  it('venda da cota: o piso é o valor presente da restituição do cancelamento', () => {
    const r = simulateComparison(caso(0.7));
    const sim = r.comparacao.sim;
    const rest = sim.restituicao!;
    const piso = rest.valor / (1 + anualParaMensal(sim.input.comum.custoOportunidadeAa)) ** rest.t;
    const venda = r.proximosPassos!.passos.find((p) => p.id === 'vender-cota')!;
    expect(venda.valor).toBeCloseTo(piso, 2);
    expect(Math.round(piso)).toBeGreaterThan(60_000);
    expect(Math.round(piso)).toBeLessThan(75_000);
    expect(venda.texto).toContain('286.769');
  });

  it('quitar cedo: o extra e o ganho batem com uma simulação independente', () => {
    const r = simulateComparison(caso(0.7));
    const q = r.proximosPassos!.passos.find((p) => p.id === 'quitar-cedo')!;
    expect(q.extraMensal).toBeGreaterThan(0);
    const diffCom = diffDe(caso(0.7, (i) => { i.financiamento.amortExtraMensal = q.extraMensal!; i.financiamento.modoAmortExtra = 'prazo'; }));
    expect(q.ganhoVP!).toBeCloseTo(r.comparacao.verdict.diffPV - diffCom, 0);
    expect(q.ganhoVP!).toBeGreaterThan(0);
  });

  it('entrada maior: o ganho bate com uma simulação independente', () => {
    const r = simulateComparison(caso(0.6, (i) => { i.comum.aluguelMensal = 5000; }));
    expect(r.comparacao.verdict.vencedor).toBe('financiamento');
    const e = r.proximosPassos!.passos.find((p) => p.id === 'entrada-maior')!;
    const diff70 = diffDe(caso(0.7, (i) => { i.comum.aluguelMensal = 5000; }));
    expect(e.ganhoVP!).toBeCloseTo(r.comparacao.verdict.diffPV - diff70, 0);
  });

  it('a ordem começa por aprovar o crédito antes de mexer na cota', () => {
    const ids = simulateComparison(caso(0.7)).proximosPassos!.passos.map((p) => p.id);
    expect(ids[0]).toBe('aprovar-credito');
    expect(ids.indexOf('vender-cota')).toBeLessThan(ids.indexOf('cancelar-cota'));
  });

  it('com o extra já informado, quitar cedo não pede extra menor do que o atual', () => {
    const r0 = simulateComparison(caso(0.7));
    const q0 = r0.proximosPassos!.passos.find((p) => p.id === 'quitar-cedo')!;
    const r = simulateComparison(caso(0.7, (i) => { i.financiamento.amortExtraMensal = q0.extraMensal! + 1000; }));
    const q = r.proximosPassos!.passos.find((p) => p.id === 'quitar-cedo');
    expect(q).toBeUndefined(); // o extra atual já quita antes de 5 anos
  });
});
