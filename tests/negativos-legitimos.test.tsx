// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);
import { compare } from '../src/domain/comparison';
import { defaultInput } from '../src/domain/defaults';
import { CostBreakdownTable } from '../src/presentation/components/CostBreakdownTable';

// Varredura Playwright (nov/2026): categorias negativas que NÃO são erro, e que a tabela agora explica.
const amortizacaoNegativa = () => {
  const d = defaultInput();
  d.comum.situacaoAtual = 'financiamento-em-andamento';
  Object.assign(d.financiamento, { parcelasPagas: 1, sistema: 'PRICE', entradaPct: 0.9, jurosAa: 0.12, prazoMeses: 420, amortExtraMensal: 0 });
  d.comum.custoOportunidadeAa = 0.14;
  return compare(d);
};
const devolucaoComFundoAfundado = () => {
  const d = defaultInput();
  d.comum.situacaoAtual = 'consorcio-em-andamento';
  d.consorcio.parcelasPagas = 180;
  d.consorcio.devolveFundoReserva = true;
  return compare(d);
};

describe('categorias negativas legítimas', () => {
  it('PRICE + TR em 420 meses: a correção supera a amortização e o saldo cresce (amortização negativa)', () => {
    const c = amortizacaoNegativa();
    const r1 = c.sim.fin.rows[0];
    expect(r1.correcao).toBeGreaterThan(r1.amortizacao);
    expect(r1.saldoFinal).toBeGreaterThan(r1.saldoInicial);
    const principal = c.categorias.find((l) => l.key === 'amortizacao')!.financiamento;
    expect(principal.nominal).toBeCloseTo(c.sim.saldoFinanciamentoHoje!, -2);
    expect(principal.vp).toBeLessThan(0);
    // o total continua sendo o caixa: a soma das categorias fecha com o resumo
    expect(c.categorias.reduce((s, l) => s + l.financiamento.vp, 0)).toBeCloseTo(c.financiamento.vp, 2);
  });

  it('consórcio em andamento: a devolução do fundo de reserva inclui o já pago (afundado), então o líquido fica negativo', () => {
    const c = devolucaoComFundoAfundado();
    const fr = c.categorias.find((l) => l.key === 'fundoReserva')!.consorcio;
    expect(fr.nominal).toBeLessThan(0);
    expect(c.categorias.reduce((s, l) => s + l.consorcio.nominal, 0)).toBeCloseTo(c.consorcio.totalNominal, 2);
  });

  it('a tabela explica cada negativo legítimo, e só quando ele aparece', () => {
    const { unmount } = render(<CostBreakdownTable linhas={amortizacaoNegativa().categorias} />);
    expect(screen.getByText(/amortização negativa/)).toBeTruthy();
    expect(screen.queryByText(/Fundo de reserva negativo/)).toBeNull();
    unmount();
    render(<CostBreakdownTable linhas={devolucaoComFundoAfundado().categorias} />);
    expect(screen.getByText(/Fundo de reserva negativo/)).toBeTruthy();
  });

  it('cenário padrão não mostra nota de negativo', () => {
    render(<CostBreakdownTable linhas={compare(defaultInput()).categorias} />);
    expect(screen.queryByText(/negativo:/)).toBeNull();
  });
});
