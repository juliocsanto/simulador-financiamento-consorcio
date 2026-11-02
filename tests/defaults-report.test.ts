import { it } from 'vitest';
import { simulateComparison } from '../src/application/useCases';
import { defaultInput } from '../src/domain/defaults';

it('imprime o resultado com os padrões da SPEC', () => {
  const r = simulateComparison(defaultInput());
  const { comparacao: c } = r;
  const eq = c.verdict.sensibilidade.equilibrio;
  const linhas = {
    vencedor: c.verdict.vencedor,
    diffPV: Math.round(c.verdict.diffPV),
    vpFinanciamento: Math.round(c.financiamento.vp),
    vpConsorcio: Math.round(c.consorcio.vp),
    nominalFin: Math.round(c.financiamento.totalNominal),
    nominalCon: Math.round(c.consorcio.totalNominal),
    cetFinanciamento: c.sim.finCet,
    custoEfetivoConsorcio: c.sim.con.custoEfetivo,
    equilibrio: eq,
    mesesFinanciamento: c.sim.fin.rows.length,
    mesesConsorcio: c.sim.con.rows.length,
    vencedorIngenuo: c.verdict.vencedorIngenuo,
    coMais: c.verdict.sensibilidade.coMais.vencedor,
    coMenos: c.verdict.sensibilidade.coMenos.vencedor,
  };
  console.log('RESULTADO_PADRAO', JSON.stringify(linhas, null, 2));
});
