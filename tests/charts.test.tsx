// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { cloneElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { compare } from '../src/domain/comparison';
import { defaultInput } from '../src/domain/defaults';
import { Charts, compacto, formatarValor, rotuloMes } from '../src/presentation/components/Charts';
import { installDomStubs } from './support/dom';

installDomStubs();

// jsdom não mede layout: o ResponsiveContainer recebe tamanho fixo para o gráfico desenhar de verdade.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement }) => cloneElement(children, { width: 800, height: 280 } as object),
  };
});

const serie = compare(defaultInput()).serie;

describe('Charts', () => {
  it('renderiza os dois gráficos com título, 2 linhas cada e legenda Financiamento/Consórcio', () => {
    const { container } = render(<Charts serie={serie} />);
    expect(screen.getByText('Desembolso mensal (R$ nominais)')).toBeTruthy();
    expect(screen.getByText('Valor presente acumulado (R$)')).toBeTruthy();
    expect(container.querySelectorAll('.recharts-wrapper').length).toBe(2);
    expect(container.querySelectorAll('.recharts-line-curve').length).toBe(4);
    const legenda = Array.from(container.querySelectorAll('.recharts-legend-item-text')).map((e) => e.textContent);
    expect(legenda).toEqual(['Financiamento', 'Consórcio', 'Financiamento', 'Consórcio']);
  });

  it('eixo Y usa formato compacto: unidades, mil e mi (com vírgula decimal)', () => {
    expect([0, 999.4, 1500, 25_000, -250_000, 1_000_000, 2_450_000].map(compacto)).toEqual(['0', '999', '2 mil', '25 mil', '-250 mil', '1,0 mi', '2,5 mi']);
  });

  it('tooltip rotula o mês e formata o valor em reais', () => {
    expect(rotuloMes(12)).toBe('Mês 12');
    expect(formatarValor(1234.5)).toMatch(/^R\$\s?1\.235$/);
  });
});
