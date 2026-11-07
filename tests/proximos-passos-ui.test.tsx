// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { simulateComparison } from '../src/application/useCases';
import { defaultInput } from '../src/domain/defaults';
import { NextSteps } from '../src/presentation/components/NextSteps';

function caso(entradaPct: number) {
  const i = defaultInput();
  i.comum.situacaoAtual = 'consorcio-em-andamento';
  i.comum.valorImovel = 920_000;
  i.consorcio.valorCarta = 1_000_000;
  i.consorcio.redutorParcelaPct = 0.35;
  i.consorcio.lancePct = 0.6;
  i.consorcio.parcelasPagas = 41;
  i.consorcio.mesContemplacao = 42;
  i.financiamento.entradaPct = entradaPct;
  return i;
}

describe('NextSteps', () => {
  it('mostra os passos na ordem com o piso de venda e o ganho de quitar cedo', () => {
    render(<NextSteps proximos={simulateComparison(caso(0.7)).proximosPassos} />);
    const itens = screen.getByTestId('proximos-passos').querySelectorAll('ol > li');
    expect(itens[0].getAttribute('data-testid')).toBe('passo-aprovar-credito');
    expect(screen.getByTestId('passo-vender-cota').textContent).toContain('67.374');
    expect(screen.getByTestId('passo-quitar-cedo').textContent).toMatch(/\+R\$\s?[\d.]+ em VP/);
  });

  it('não renderiza nada quando o consórcio vence', () => {
    const { container } = render(<NextSteps proximos={simulateComparison(caso(0.2)).proximosPassos} />);
    expect(container.innerHTML).toBe('');
  });
});
