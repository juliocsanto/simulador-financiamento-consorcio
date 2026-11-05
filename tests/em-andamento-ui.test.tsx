// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { createServices } from '../src/composition';
import { compare } from '../src/domain/comparison';
import { defaultInput } from '../src/domain/defaults';
import type { ScenarioInput } from '../src/domain/types';
import { InMemoryScenarioRepository } from '../src/infrastructure/InMemoryScenarioRepository';
import { InputForm } from '../src/presentation/components/InputForm';
import { ScheduleTables } from '../src/presentation/components/ScheduleTables';
import { SummaryTable } from '../src/presentation/components/SummaryTable';
import { VerdictCard } from '../src/presentation/components/VerdictCard';
import { installDomStubs } from './support/dom';

installDomStubs();

function Harness({ inicial }: { inicial?: ScenarioInput }) {
  const [input, setInput] = useState(inicial ?? defaultInput());
  return <InputForm input={input} onChange={setInput} onReset={() => setInput(defaultInput())} />;
}

const porId = (id: string): HTMLInputElement | HTMLSelectElement => document.getElementById(id) as HTMLInputElement | HTMLSelectElement;

function emAndamento(situacao: ScenarioInput['comum']['situacaoAtual']): ScenarioInput {
  const i = defaultInput();
  i.comum.situacaoAtual = situacao;
  i.consorcio.valorCarta = 1_000_000;
  i.consorcio.redutorParcelaPct = 0.35;
  i.consorcio.parcelasPagas = 41;
  i.consorcio.mesContemplacao = 60;
  i.financiamento.parcelasPagas = 60;
  return i;
}

describe('InputForm: contrato em andamento', () => {
  it('select de situação com as três opções, redutor sempre visível e parcelas pagas só na situação certa', () => {
    render(<Harness />);
    const select = porId('campo-situacaoAtual') as HTMLSelectElement;
    expect(select.value).toBe('nova-compra');
    expect([...select.options].map((o) => o.value)).toEqual(['nova-compra', 'consorcio-em-andamento', 'financiamento-em-andamento']);
    expect(porId('campo-redutorParcelaPct')).toBeTruthy();
    expect(porId('campo-parcelasPagasConsorcio')).toBeNull();
    expect(porId('campo-parcelasPagasFinanciamento')).toBeNull();

    fireEvent.change(select, { target: { value: 'consorcio-em-andamento' } });
    expect(porId('campo-parcelasPagasConsorcio')).toBeTruthy();
    expect(porId('campo-parcelasPagasFinanciamento')).toBeNull();

    fireEvent.change(select, { target: { value: 'financiamento-em-andamento' } });
    expect(porId('campo-parcelasPagasConsorcio')).toBeNull();
    expect(porId('campo-parcelasPagasFinanciamento')).toBeTruthy();
  });

  it('digitar redutor em % vira fração e parcelas pagas é inteiro; a dica da situação é exibida', () => {
    render(<Harness inicial={emAndamento('consorcio-em-andamento')} />);
    expect((porId('campo-redutorParcelaPct') as HTMLInputElement).value).toBe('35');
    expect((porId('campo-parcelasPagasConsorcio') as HTMLInputElement).value).toBe('41');
    fireEvent.change(porId('campo-redutorParcelaPct'), { target: { value: '20' } });
    expect((porId('campo-redutorParcelaPct') as HTMLInputElement).value).toBe('20');
    fireEvent.change(porId('campo-parcelasPagasConsorcio'), { target: { value: '50' } });
    expect((porId('campo-parcelasPagasConsorcio') as HTMLInputElement).value).toBe('50');
    expect(screen.getByText(/não são suportados/)).toBeTruthy();
  });
});

describe('SummaryTable: blocos de contrato em andamento', () => {
  it('nova compra: nenhum dos três blocos aparece', () => {
    render(<SummaryTable comparacao={compare(defaultInput())} />);
    expect(screen.queryByTestId('ja-pago')).toBeNull();
    expect(screen.queryByTestId('restituicao')).toBeNull();
    expect(screen.queryByTestId('saldo-financiamento-hoje')).toBeNull();
  });

  it('consórcio em andamento: já pago e restituição (valor, multa e quando), sem saldo do financiamento', () => {
    const c = compare(emAndamento('consorcio-em-andamento'));
    render(<SummaryTable comparacao={c} />);
    const jaPago = screen.getByTestId('ja-pago');
    expect(jaPago.textContent).toContain('Já pago (custo afundado)');
    expect(jaPago.textContent).toContain('41 parcelas do consórcio');
    expect(jaPago.textContent).toContain(c.sim.jaPago.consorcio.toLocaleString('pt-BR', { maximumFractionDigits: 0 }));
    const rest = screen.getByTestId('restituicao');
    expect(rest.textContent).toContain('mês 161');
    expect(rest.textContent).toContain('multa de 10,0%');
    expect(screen.queryByTestId('saldo-financiamento-hoje')).toBeNull();
    expect(screen.getByTestId('redutor-parcela').textContent).toContain('Redutor de 35,0%');
    expect(screen.getByTestId('summary-table').textContent).toContain('de aluguel até o mês 19');
  });

  it('financiamento em andamento: saldo devedor de hoje e já pago; sem restituição nem redutor', () => {
    const i = emAndamento('financiamento-em-andamento');
    i.consorcio.redutorParcelaPct = 0;
    const c = compare(i);
    render(<SummaryTable comparacao={c} />);
    expect(screen.getByTestId('saldo-financiamento-hoje').textContent).toContain('após 60 parcelas');
    expect(screen.getByTestId('ja-pago').textContent).toContain('60 parcelas do financiamento');
    expect(screen.queryByTestId('restituicao')).toBeNull();
    expect(screen.queryByTestId('redutor-parcela')).toBeNull();
    expect(screen.getByTestId('summary-table').textContent).toContain('Você já mora no imóvel');
  });

  it('em andamento com 0 parcelas pagas: sem bloco "já pago", mas a restituição existe (zero)', () => {
    const i = emAndamento('consorcio-em-andamento');
    i.consorcio.parcelasPagas = 0;
    i.consorcio.redutorParcelaPct = 0;
    render(<SummaryTable comparacao={compare(i)} />);
    expect(screen.queryByTestId('ja-pago')).toBeNull();
    expect(screen.getByTestId('restituicao')).toBeTruthy();
  });

  it('redutor com contemplação na última parcela não mostra "depois da contemplação"', () => {
    const i = defaultInput();
    i.consorcio.redutorParcelaPct = 0.2;
    i.consorcio.mesContemplacao = 200;
    i.comum.situacaoAtual = 'nova-compra';
    render(<SummaryTable comparacao={compare(i)} />);
    expect(screen.getByTestId('redutor-parcela').textContent).not.toContain('depois da contemplação');
  });
});

describe('ScheduleTables: meses já pagos', () => {
  const abrir = (): void => {
    const details = document.querySelector('details') as HTMLDetailsElement;
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
  };

  it('consórcio em andamento: linhas ≤ m marcadas como já pago', () => {
    const c = compare(emAndamento('consorcio-em-andamento'));
    render(<ScheduleTables sim={c.sim} />);
    abrir();
    fireEvent.click(screen.getByRole('tab', { name: 'Consórcio' }));
    const linhas = [...document.querySelectorAll('tbody tr')];
    expect(linhas[0].className).toBe('pago');
    expect(linhas[0].querySelector('th')?.textContent).toBe('1 (já pago)');
    expect(linhas[35].className).toBe('pago');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    const pag2 = [...document.querySelectorAll('tbody tr')];
    expect(pag2[4].querySelector('th')?.textContent).toBe('41 (já pago)');
    expect(pag2[5].className).toBe('');
    expect(pag2[5].querySelector('th')?.textContent).toBe('42');
  });

  it('financiamento em andamento: linhas ≤ m marcadas na aba do financiamento', () => {
    const c = compare(emAndamento('financiamento-em-andamento'));
    render(<ScheduleTables sim={c.sim} />);
    abrir();
    const linhas = [...document.querySelectorAll('tbody tr')];
    expect(linhas[0].className).toBe('pago');
    expect(linhas[0].querySelector('th')?.textContent).toBe('1 (já pago)');
  });

  it('mês de contemplação continua destacado quando não é "já pago"', () => {
    const c = compare(emAndamento('consorcio-em-andamento'));
    render(<ScheduleTables sim={c.sim} />);
    abrir();
    fireEvent.click(screen.getByRole('tab', { name: 'Consórcio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    const destaque = document.querySelector('tbody tr.destaque');
    expect(destaque?.querySelector('th')?.textContent).toBe('60 (contemplação)');
  });
});

describe('VerdictCard e cenários salvos com contrato em andamento', () => {
  it('veredito de consórcio em andamento mostra a razão do custo afundado e o risco do cancelamento', () => {
    render(<VerdictCard verdict={compare(emAndamento('consorcio-em-andamento')).verdict} />);
    expect(screen.getByTestId('verdict-winner')).toBeTruthy();
    expect(document.querySelector('.razoes')?.textContent).toContain('igual nas duas escolhas');
    expect(document.querySelector('.riscos')?.textContent).toContain('cancelar a cota');
  });

  it('cenário salvo no formato antigo (sem os campos novos) carrega completo', async () => {
    const repo = new InMemoryScenarioRepository();
    const services = createServices(repo);
    const antigo = defaultInput() as unknown as { comum: Record<string, unknown>; consorcio: Record<string, unknown> };
    delete antigo.comum.situacaoAtual;
    delete antigo.consorcio.redutorParcelaPct;
    const salvo = await repo.save({
      name: 'antigo',
      createdAt: new Date().toISOString(),
      input: antigo as unknown as ScenarioInput,
      summary: { winner: 'consorcio', diffPV: 0 },
    });
    const carregado = await services.load(salvo.id);
    expect(carregado?.comum.situacaoAtual).toBe('nova-compra');
    expect(carregado?.consorcio.redutorParcelaPct).toBe(0);
  });
});
