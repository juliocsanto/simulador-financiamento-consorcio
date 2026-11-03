// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServices, type Services } from '../src/composition';
import { defaultInput } from '../src/domain/defaults';
import { InMemoryScenarioRepository } from '../src/infrastructure/InMemoryScenarioRepository';
import { App } from '../src/presentation/App';
import { useDebounced } from '../src/presentation/hooks/useDebounced';
import { installDomStubs } from './support/dom';

installDomStubs();

const campo = (name: string): HTMLInputElement => document.querySelector(`[name="${name}"]`) as HTMLInputElement;
const vencedor = (): string => screen.getByTestId('verdict-winner').textContent ?? '';
const resumo = (): string => within(screen.getByTestId('verdict')).getByText(/custa .* a menos|Empate técnico/).textContent ?? '';

afterEach(() => vi.useRealTimers());

describe('App (interativo)', () => {
  it('mudar um campo recalcula o veredito depois do debounce e sinaliza aria-busy enquanto espera', async () => {
    render(<App services={createServices(new InMemoryScenarioRepository())} />);
    const main = document.querySelector('main') as HTMLElement;
    expect(main.getAttribute('aria-busy')).toBe('false');
    const antes = resumo();

    fireEvent.change(campo('valorImovel'), { target: { value: '1200000' } });
    fireEvent.change(campo('valorCarta'), { target: { value: '1200000' } });
    expect(main.getAttribute('aria-busy')).toBe('true');
    await waitFor(() => expect(main.getAttribute('aria-busy')).toBe('false'), { timeout: 2000 });

    expect(resumo()).not.toBe(antes);
  });

  it('trocar SAC por PRICE muda o cabeçalho da tabela resumo', async () => {
    render(<App services={createServices(new InMemoryScenarioRepository())} />);
    expect(screen.getByText('Financiamento (SAC)')).toBeTruthy();
    fireEvent.change(campo('sistema'), { target: { value: 'PRICE' } });
    await screen.findByText('Financiamento (PRICE)', undefined, { timeout: 2000 });
  });

  it('salvar, alterar e carregar o cenário restaura o formulário', async () => {
    render(<App services={createServices(new InMemoryScenarioRepository())} />);
    fireEvent.change(screen.getByLabelText('Nome do cenário'), { target: { value: 'Original' } });
    fireEvent.click(screen.getByTestId('save-scenario'));
    const li = (await screen.findByText('Original')).closest('li') as HTMLElement;

    fireEvent.change(campo('valorImovel'), { target: { value: '999000' } });
    expect(campo('valorImovel').value).toBe('999000');

    fireEvent.click(within(li).getByRole('button', { name: 'Carregar' }));
    await waitFor(() => expect(campo('valorImovel').value).toBe('600000'));
  });

  it('restaurar valores padrão desfaz as edições', () => {
    render(<App services={createServices(new InMemoryScenarioRepository())} />);
    fireEvent.change(campo('jurosAa'), { target: { value: '14' } });
    expect(campo('jurosAa').value).toBe('14');
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar valores padrão' }));
    expect(campo('jurosAa').value).toBe('11.5');
  });

  it('erro na simulação (Error) mostra alerta com a mensagem e esconde os resultados', async () => {
    const reais = createServices(new InMemoryScenarioRepository());
    let chamadas = 0;
    const services: Services = {
      ...reais,
      simulate: (i) => {
        if (++chamadas > 1) throw new Error('Taxa inválida: boom');
        return reais.simulate(i);
      },
    };
    render(<App services={services} />);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(campo('valorImovel'), { target: { value: '700000' } });
    const alerta = await screen.findByRole('alert', undefined, { timeout: 2000 });
    expect(alerta.textContent).toContain('Não foi possível simular');
    expect(alerta.textContent).toContain('Taxa inválida: boom');
    expect(screen.queryByTestId('verdict')).toBeNull();
  });

  it('erro que não é Error cai na mensagem genérica', async () => {
    const reais = createServices(new InMemoryScenarioRepository());
    let chamadas = 0;
    const services: Services = {
      ...reais,
      simulate: (i) => {
        if (++chamadas > 1) throw 'texto solto';
        return reais.simulate(i);
      },
    };
    render(<App services={services} />);
    fireEvent.change(campo('valorImovel'), { target: { value: '700000' } });
    const alerta = await screen.findByRole('alert', undefined, { timeout: 2000 });
    expect(alerta.textContent).toContain('Erro desconhecido na simulação');
  });

  it('entradas absurdas (prazo 0, imóvel 0) não derrubam a tela: o normalize protege', async () => {
    render(<App services={createServices(new InMemoryScenarioRepository())} />);
    fireEvent.change(campo('prazoMeses'), { target: { value: '0' } });
    fireEvent.change(campo('valorImovel'), { target: { value: '0' } });
    await waitFor(() => expect(document.querySelector('main')?.getAttribute('aria-busy')).toBe('false'), { timeout: 2000 });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(vencedor()).toMatch(/Financiamento|Consórcio|Empate técnico/);
  });

  it('input padrão da SPEC (contemplação no mês 24): o consórcio aparece como vencedor', () => {
    expect(defaultInput().consorcio.mesContemplacao).toBe(24);
    render(<App services={createServices(new InMemoryScenarioRepository())} />);
    expect(vencedor()).toBe('Consórcio');
  });
});

describe('useDebounced', () => {
  it('valor inicial é imediato; mudanças só valem depois do atraso; mudanças seguidas reiniciam o relógio', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 300), { initialProps: { v: 'a' } });
    expect(result.current).toBe('a');
    rerender({ v: 'b' });
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');
    rerender({ v: 'c' });
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe('c');
  });

  it('usa 300 ms por padrão e limpa o timer ao desmontar', () => {
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(({ v }) => useDebounced(v), { initialProps: { v: 1 } });
    rerender({ v: 2 });
    act(() => void vi.advanceTimersByTime(299));
    expect(result.current).toBe(1);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(2);
    rerender({ v: 3 });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
