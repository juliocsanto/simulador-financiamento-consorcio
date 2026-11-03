// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../src/domain/defaults';
import type { ScenarioInput } from '../src/domain/types';
import { InputForm } from '../src/presentation/components/InputForm';
import { installDomStubs } from './support/dom';

installDomStubs();

function Harness({ onChange, onReset, inicial }: { onChange?: (i: ScenarioInput) => void; onReset?: () => void; inicial?: ScenarioInput }) {
  const [input, setInput] = useState(inicial ?? defaultInput());
  return (
    <>
      <InputForm
        input={input}
        onChange={(n) => {
          setInput(n);
          onChange?.(n);
        }}
        onReset={() => {
          onReset?.();
          setInput(defaultInput());
        }}
      />
      <button type="button" onClick={() => setInput({ ...input, comum: { ...input.comum, valorImovel: 777_000, ipcaAa: 0.1 } })}>
        externo
      </button>
    </>
  );
}

const campo = (name: string): HTMLInputElement => document.querySelector(`[name="${name}"]`) as HTMLInputElement;

describe('InputForm', () => {
  it('mostra os valores padrão (percentuais em %, não em fração)', () => {
    render(<Harness />);
    expect(campo('valorImovel').value).toBe('600000');
    expect(campo('jurosAa').value).toBe('11.5');
    expect(campo('trAm').value).toBe('0.15');
    expect(campo('prazoMeses').value).toBe('360');
    expect(campo('prazoMesesConsorcio').value).toBe('200');
    expect((campo('sistema') as unknown as HTMLSelectElement).value).toBe('SAC');
    expect(campo('embutidoAbateSaldo').checked).toBe(false);
  });

  it('digitar em campo monetário propaga o número; pct vira fração', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(campo('valorImovel'), { target: { value: '850000' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ comum: expect.objectContaining({ valorImovel: 850_000 }) }));
    fireEvent.change(campo('jurosAa'), { target: { value: '9.5' } });
    const ultimo = onChange.mock.calls.at(-1)?.[0] as ScenarioInput;
    expect(ultimo.financiamento.jurosAa).toBeCloseTo(0.095, 10);
    expect(ultimo.comum.valorImovel).toBe(850_000);
    fireEvent.change(campo('prazoMesesConsorcio'), { target: { value: '180' } });
    expect((onChange.mock.calls.at(-1)?.[0] as ScenarioInput).consorcio.prazoMeses).toBe(180);
    expect((onChange.mock.calls.at(-1)?.[0] as ScenarioInput).financiamento.prazoMeses).toBe(360);
  });

  it('texto vazio não propaga (mantém o último número válido) e o campo mostra o vazio', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(campo('valorImovel'), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(campo('valorImovel').value).toBe('');
  });

  it('select de sistema e de modo propagam o texto escolhido', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(campo('sistema'), { target: { value: 'PRICE' } });
    expect((onChange.mock.calls.at(-1)?.[0] as ScenarioInput).financiamento.sistema).toBe('PRICE');
    expect((campo('sistema') as unknown as HTMLSelectElement).value).toBe('PRICE');
    fireEvent.change(campo('modoAmortExtra'), { target: { value: 'parcela' } });
    expect((onChange.mock.calls.at(-1)?.[0] as ScenarioInput).financiamento.modoAmortExtra).toBe('parcela');
    fireEvent.change(campo('modoPosLance'), { target: { value: 'prazo' } });
    expect((onChange.mock.calls.at(-1)?.[0] as ScenarioInput).consorcio.modoPosLance).toBe('prazo');
  });

  it('checkboxes propagam o booleano', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(campo('embutidoAbateSaldo'));
    expect((onChange.mock.calls.at(-1)?.[0] as ScenarioInput).consorcio.embutidoAbateSaldo).toBe(true);
    expect(campo('embutidoAbateSaldo').checked).toBe(true);
    fireEvent.click(campo('devolveFundoReserva'));
    expect((onChange.mock.calls.at(-1)?.[0] as ScenarioInput).consorcio.devolveFundoReserva).toBe(true);
  });

  it('mudança externa de valor (ex.: carregar cenário) atualiza o texto exibido', () => {
    render(<Harness />);
    fireEvent.change(campo('valorImovel'), { target: { value: '' } });
    fireEvent.click(screen.getByText('externo'));
    expect(campo('valorImovel').value).toBe('777000');
    expect(campo('ipcaAa').value).toBe('10');
  });

  it('o texto digitado não é sobrescrito quando equivale ao valor externo (ex.: "5.0" vs 5)', () => {
    render(<Harness />);
    fireEvent.change(campo('ipcaAa'), { target: { value: '5.0' } });
    expect(campo('ipcaAa').value).toBe('5.0');
  });

  it('o botão restaurar chama onReset e volta aos padrões', () => {
    const onReset = vi.fn();
    render(<Harness onReset={onReset} />);
    fireEvent.change(campo('valorImovel'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar valores padrão' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(campo('valorImovel').value).toBe('600000');
  });

  it('submeter o formulário não recarrega a página', () => {
    render(<Harness />);
    const form = screen.getByRole('form', { name: 'Parâmetros da simulação' });
    expect(fireEvent.submit(form)).toBe(false);
  });
});
