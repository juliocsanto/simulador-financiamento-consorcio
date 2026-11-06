// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SavedScenario } from '../src/application/ports';
import { createServices } from '../src/composition';
import { compare } from '../src/domain/comparison';
import { defaultInput } from '../src/domain/defaults';
import { fmtBRLCents } from '../src/domain/format';
import { buildPayoffPlan, type PlanoQuitacao } from '../src/domain/payoff';
import type { ScenarioInput } from '../src/domain/types';
import type { Verdict } from '../src/domain/verdict';
import { InMemoryScenarioRepository } from '../src/infrastructure/InMemoryScenarioRepository';
import { PayoffPlan } from '../src/presentation/components/PayoffPlan';
import { SavedScenarios } from '../src/presentation/components/SavedScenarios';
import { ScheduleTables } from '../src/presentation/components/ScheduleTables';
import { SummaryTable } from '../src/presentation/components/SummaryTable';
import { VerdictCard } from '../src/presentation/components/VerdictCard';
import { installDomStubs } from './support/dom';

installDomStubs();

const base = defaultInput();
const comparacao = compare(base);

function cenario(over: {
  comum?: Partial<ScenarioInput['comum']>;
  financiamento?: Partial<ScenarioInput['financiamento']>;
  consorcio?: Partial<ScenarioInput['consorcio']>;
}): ScenarioInput {
  return {
    comum: { ...base.comum, ...over.comum },
    financiamento: { ...base.financiamento, ...over.financiamento },
    consorcio: { ...base.consorcio, ...over.consorcio },
  };
}

describe('SavedScenarios', () => {
  it('lista vazia, salva com nome, limpa o campo e mostra vencedor e ΔVP', async () => {
    const services = createServices(new InMemoryScenarioRepository());
    render(<SavedScenarios services={services} input={base} onLoad={() => undefined} />);
    expect(await screen.findByText('Nenhum cenário salvo ainda.')).toBeTruthy();

    const nome = screen.getByLabelText('Nome do cenário') as HTMLInputElement;
    fireEvent.change(nome, { target: { value: 'Base A' } });
    expect(nome.value).toBe('Base A');
    fireEvent.click(screen.getByTestId('save-scenario'));

    const lista = screen.getByTestId('saved-list');
    await waitFor(() => expect(within(lista).getByText('Base A')).toBeTruthy());
    expect(nome.value).toBe('');
    expect(screen.queryByText('Nenhum cenário salvo ainda.')).toBeNull();
    expect(lista.textContent).toContain(comparacao.verdict.vencedor === 'consorcio' ? 'Consórcio' : 'Financiamento');
    expect(lista.textContent).toContain('ΔVP');
  });

  it('sem nome usa "Cenário sem nome"', async () => {
    const services = createServices(new InMemoryScenarioRepository());
    render(<SavedScenarios services={services} input={base} onLoad={() => undefined} />);
    fireEvent.click(screen.getByTestId('save-scenario'));
    expect(await screen.findByText('Cenário sem nome')).toBeTruthy();
  });

  it('carregar devolve o input salvo (cópia) e excluir remove da lista', async () => {
    const repo = new InMemoryScenarioRepository();
    const services = createServices(repo);
    const alterado = cenario({ comum: { valorImovel: 910_000 } });
    await services.save('Caro', alterado);
    await services.save('Padrão', base);
    const onLoad = vi.fn();
    render(<SavedScenarios services={services} input={base} onLoad={onLoad} />);
    const caro = (await screen.findByText('Caro')).closest('li') as HTMLElement;

    fireEvent.click(within(caro).getByRole('button', { name: 'Carregar' }));
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    expect(onLoad.mock.calls[0][0].comum.valorImovel).toBe(910_000);

    fireEvent.click(within(caro).getByRole('button', { name: /Excluir|Apagar|Remover/ }));
    await waitFor(() => expect(screen.queryByText('Caro')).toBeNull());
    expect(screen.getByText('Padrão')).toBeTruthy();
    expect(await services.list()).toHaveLength(1);
  });

  it('carregar um id que sumiu não chama onLoad', async () => {
    const repo = new InMemoryScenarioRepository();
    const services = createServices(repo);
    const salvo = await services.save('Efêmero', base);
    const onLoad = vi.fn();
    render(<SavedScenarios services={services} input={base} onLoad={onLoad} />);
    const li = (await screen.findByText('Efêmero')).closest('li') as HTMLElement;
    await repo.delete(salvo.id);
    fireEvent.click(within(li).getByRole('button', { name: 'Carregar' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onLoad).not.toHaveBeenCalled();
  });

  it('falha ao ler mostra alerta; falha ao salvar mostra alerta; leitura bem-sucedida depois limpa o erro', async () => {
    const repo = new InMemoryScenarioRepository();
    const services = createServices(repo);
    const list = vi.spyOn(repo, 'list').mockRejectedValueOnce(new Error('idb'));
    render(<SavedScenarios services={services} input={base} onLoad={() => undefined} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível ler os cenários salvos');
    list.mockRestore();

    vi.spyOn(repo, 'save').mockRejectedValueOnce(new Error('quota'));
    fireEvent.click(screen.getByTestId('save-scenario'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Não foi possível salvar o cenário'));

    fireEvent.change(screen.getByLabelText('Nome do cenário'), { target: { value: 'Ok' } });
    fireEvent.click(screen.getByTestId('save-scenario'));
    await screen.findByText('Ok');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rótulo de empate técnico', async () => {
    const repo = new InMemoryScenarioRepository();
    const salvo: Omit<SavedScenario, 'id'> = {
      name: 'Empatado',
      createdAt: '2026-01-01T12:00:00.000Z',
      input: base,
      summary: { winner: 'empate', diffPV: 10 },
    };
    await repo.save(salvo);
    render(<SavedScenarios services={createServices(repo)} input={base} onLoad={() => undefined} />);
    const li = (await screen.findByText('Empatado')).closest('li') as HTMLElement;
    expect(li.textContent).toContain('Empate técnico');
  });
});

describe('ScheduleTables', () => {
  function abrir(): HTMLDetailsElement {
    const details = document.querySelector('details') as HTMLDetailsElement;
    act(() => {
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
    });
    return details;
  }

  it('começa fechado; ao abrir mostra o cronograma do financiamento com a 1ª página', () => {
    render(<ScheduleTables sim={comparacao.sim} />);
    expect(screen.queryByRole('tablist')).toBeNull();
    abrir();
    expect(screen.getByRole('tab', { name: 'Financiamento' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Saldo inicial')).toBeTruthy();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(36);
    expect(screen.getByText(`Página 1 de ${Math.ceil(comparacao.sim.fin.rows.length / 36)}`)).toBeTruthy();
  });

  it('paginação avança e volta e desabilita nos extremos', () => {
    render(<ScheduleTables sim={comparacao.sim} />);
    abrir();
    const anterior = screen.getByRole('button', { name: 'Anterior' }) as HTMLButtonElement;
    const proxima = screen.getByRole('button', { name: 'Próxima' }) as HTMLButtonElement;
    expect(anterior.disabled).toBe(true);
    fireEvent.click(proxima);
    expect(screen.getByText(/^Página 2 de/)).toBeTruthy();
    expect(document.querySelector('tbody th')?.textContent).toBe('37');
    expect(anterior.disabled).toBe(false);
    fireEvent.click(anterior);
    expect(screen.getByText(/^Página 1 de/)).toBeTruthy();
    const total = Math.ceil(comparacao.sim.fin.rows.length / 36);
    for (let i = 1; i < total; i++) fireEvent.click(proxima);
    expect(screen.getByText(`Página ${total} de ${total}`)).toBeTruthy();
    expect(proxima.disabled).toBe(true);
  });

  it('aba Consórcio mostra a tabela do consórcio, reinicia a página e marca a contemplação', () => {
    render(<ScheduleTables sim={comparacao.sim} />);
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Consórcio' }));
    expect(screen.getByRole('tab', { name: 'Consórcio' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Fundo comum')).toBeTruthy();
    expect(screen.getByText(/^Página 1 de/)).toBeTruthy();
    const mesC = comparacao.sim.con.contemplacao.mes;
    const linha = screen.getByText(`${mesC} (contemplação)`).closest('tr') as HTMLElement;
    expect(linha.className).toBe('destaque');
    expect(document.querySelectorAll('tr.destaque')).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: 'Financiamento' }));
    expect(screen.getByText('Correção TR')).toBeTruthy();
  });

  it('consórcio: "Valor a usar da carta" e "Total pago" ficam logo antes do Saldo devedor, com os valores da linha', () => {
    render(<ScheduleTables sim={comparacao.sim} />);
    abrir();
    fireEvent.click(screen.getByRole('tab', { name: 'Consórcio' }));
    const cabecalhos = [...document.querySelectorAll('thead th')].map((th) => th.textContent!.trim());
    const i = cabecalhos.indexOf('Saldo devedor');
    expect(cabecalhos.slice(i - 2, i + 1)).toEqual(['Valor a usar da carta', 'Total pago', 'Saldo devedor']);
    const r = comparacao.sim.con.rows[0];
    const celulas = [...document.querySelector('tbody tr')!.querySelectorAll('td')].map((td) => td.textContent);
    expect(celulas.slice(-3)).toEqual([fmtBRLCents(r.valorAUsar), fmtBRLCents(r.totalPago), fmtBRLCents(r.saldoDevedor)]);
  });

  it('consórcio, página 2: abre com o que vem do mês 36 e explica o reajuste do mês 37', () => {
    render(<ScheduleTables sim={comparacao.sim} />);
    abrir();
    fireEvent.click(screen.getByRole('tab', { name: 'Consórcio' }));
    expect(screen.queryByTestId('transporte-consorcio')).toBeNull();
    const cabecalhos = [...document.querySelectorAll('thead th')].map((th) => th.textContent!.trim());
    expect(cabecalhos).toContain('Reajuste do saldo');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    const [r36, r37] = [comparacao.sim.con.rows[35], comparacao.sim.con.rows[36]];
    const transporte = screen.getByTestId('transporte-consorcio').textContent!;
    expect(transporte).toContain('(mês 36)');
    expect(transporte).toContain(fmtBRLCents(r36.totalPago));
    expect(transporte).toContain(fmtBRLCents(r36.saldoDevedor));
    expect(transporte).toContain(fmtBRLCents(r37.reajusteSaldo));
    const primeira = document.querySelector('tbody tr')!;
    expect(primeira.querySelector('th')?.textContent).toBe('37 (reajuste)');
    const iReaj = cabecalhos.indexOf('Reajuste do saldo') - 1; // o th da linha não conta entre os td
    expect(primeira.querySelectorAll('td')[iReaj].textContent).toBe(fmtBRLCents(r37.reajusteSaldo));
  });

  it('consórcio sem reajuste: a página 2 traz o transporte, sem frase de reajuste nem marca no mês 37', () => {
    const d = defaultInput();
    d.consorcio.reajusteCartaAa = 0;
    render(<ScheduleTables sim={compare(d).sim} />);
    abrir();
    fireEvent.click(screen.getByRole('tab', { name: 'Consórcio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    const transporte = screen.getByTestId('transporte-consorcio').textContent!;
    expect(transporte).toContain('(mês 36)');
    expect(transporte).not.toContain('reajuste');
    expect(document.querySelector('tbody th')?.textContent).toBe('37');
  });

  it('fechar o details esconde as tabelas', () => {
    render(<ScheduleTables sim={comparacao.sim} />);
    const details = abrir();
    expect(screen.getByRole('tablist')).toBeTruthy();
    act(() => {
      details.open = false;
      details.dispatchEvent(new Event('toggle'));
    });
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('a página se ajusta quando a aba tem menos páginas (consórcio curto)', () => {
    const curto = compare(cenario({ consorcio: { prazoMeses: 30, mesContemplacao: 10 } }));
    render(<ScheduleTables sim={curto.sim} />);
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Consórcio' }));
    expect(screen.getByText('Página 1 de 1')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Próxima' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('PayoffPlan', () => {
  it('cenário padrão: regra do CET, tabela de estratégias, aviso de FGTS e quitações do consórcio', () => {
    const plano = buildPayoffPlan(comparacao.sim);
    render(<PayoffPlan plano={plano} />);
    expect(screen.getByText('Seguir as parcelas até o fim')).toBeTruthy();
    expect(screen.getByText(/Informe saldo ou aporte de FGTS/)).toBeTruthy();
    expect(screen.getByText(/Antecipar pode compensar|Regra da wiki: não antecipe/)).toBeTruthy();
    for (const q of plano.consorcio.quitacoes) expect(screen.getByText(`Ano ${q.anos} (mês ${q.mes})`)).toBeTruthy();
    expect(screen.getByText(/A taxa de administração não é descontada ao antecipar/)).toBeTruthy();
  });

  it('CET acima do custo de oportunidade: "Amortizar compensa"; com FGTS mostra o uso a cada 2 anos', () => {
    const c = compare(cenario({ comum: { custoOportunidadeAa: 0.02 }, financiamento: { fgtsSaldo: 30_000, fgtsAporteMensal: 300 } }));
    render(<PayoffPlan plano={buildPayoffPlan(c.sim)} />);
    expect(screen.getByText(/Amortizar compensa: o CET/)).toBeTruthy();
    expect(screen.getByText(/Usando o FGTS a cada 2 anos/)).toBeTruthy();
    expect(screen.queryByText(/Informe saldo ou aporte de FGTS/)).toBeNull();
  });

  it('CET abaixo do custo de oportunidade: alerta de que o fundo de quitação tende a vencer', () => {
    const c = compare(cenario({ comum: { custoOportunidadeAa: 0.3 } }));
    render(<PayoffPlan plano={buildPayoffPlan(c.sim)} />);
    expect(screen.getByText(/Atenção: o CET .* não supera o seu custo de oportunidade/)).toBeTruthy();
  });

  it('CET indisponível: mensagem própria', () => {
    const c = compare(cenario({ comum: { valorImovel: 10 }, consorcio: { valorCarta: 10 } }));
    render(<PayoffPlan plano={buildPayoffPlan(c.sim)} />);
    expect(screen.getByText('Não foi possível calcular o CET para aplicar a regra de decisão.')).toBeTruthy();
  });

  it('textos do consórcio: antecipar compensa, quitar custa a mais / poupa, sem quitações e fundo sem mês', () => {
    const plano: PlanoQuitacao = structuredClone(buildPayoffPlan(comparacao.sim));
    plano.consorcio.quitarCompensa = true;
    plano.consorcio.quitacoes = [
      { anos: 3, mes: 36, valorQuitacao: 1000, totalNominal: 2000, vp: 1500, economiaNominal: 10, economiaVP: 500, admPaga: 100 },
      { anos: 5, mes: 60, valorQuitacao: 1000, totalNominal: 2000, vp: 1500, economiaNominal: 10, economiaVP: -700, admPaga: 100 },
    ];
    plano.financiamento.estrategias[0].fundo = { mesQuitacao: null, vp: 1000, vantagemDoFundoVP: -50 };
    plano.financiamento.estrategias[1].fundo = { mesQuitacao: 40, vp: 1000, vantagemDoFundoVP: 50 };
    render(<PayoffPlan plano={plano} />);
    expect(screen.getByText(/Antecipar pode compensar/)).toBeTruthy();
    expect(screen.getByText(/quitar poupa R\$\s?500/)).toBeTruthy();
    expect(screen.getByText(/quitar custa R\$\s?700 a mais/)).toBeTruthy();
    expect(screen.getByText(/n\/d \/ .*amortizar R\$\s?50 mais barato/)).toBeTruthy();
    expect(screen.getByText(/40 \/ .*fundo R\$\s?50 mais barato/)).toBeTruthy();
    // baseline sem fundo
    expect(screen.getAllByText('n/a').length).toBeGreaterThan(0);

    const vazio: PlanoQuitacao = structuredClone(plano);
    vazio.consorcio.quitacoes = [];
    vazio.consorcio.quitarCompensa = null;
    const { container } = render(<PayoffPlan plano={vazio} />);
    expect(container.textContent).toContain('Nenhuma meta de quitação (3, 5, 7 ou 10 anos)');
  });
});

describe('SummaryTable', () => {
  it('marca "melhor" no menor valor de cada régua e mostra CET e custo efetivo', () => {
    render(<SummaryTable comparacao={comparacao} />);
    const linhaVp = screen.getByText(/Régua econômica/).closest('tr') as HTMLElement;
    const [f, c] = Array.from(linhaVp.querySelectorAll('td'));
    const menorEhConsorcio = comparacao.consorcio.vp < comparacao.financiamento.vp;
    expect(c.className.includes('melhor')).toBe(menorEhConsorcio);
    expect(f.className.includes('melhor')).toBe(!menorEhConsorcio);
    expect(screen.getByText(/Financiamento \(SAC\)/)).toBeTruthy();
    expect(screen.getByText(/entrada e custos/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`aluguel até o mês ${comparacao.sim.con.contemplacao.mes}`))).toBeTruthy();
  });

  it('CET indisponível mostra n/d no financiamento (nominal e real)', () => {
    const c = compare(cenario({ comum: { valorImovel: 10 }, consorcio: { valorCarta: 10 } }));
    render(<SummaryTable comparacao={c} />);
    const cet = screen.getByText(/CET \/ custo efetivo/).closest('tr') as HTMLElement;
    expect(cet.querySelectorAll('td')[0].textContent).toBe('n/d');
    const real = screen.getByText(/Custo efetivo real/).closest('tr') as HTMLElement;
    expect(real.querySelectorAll('td')[0].textContent).toBe('n/d');
    expect(real.querySelectorAll('td')[1].textContent).not.toBe('n/d');
  });

  it('custo efetivo do consórcio sem TIR ou fluxo misto vira texto explicativo', () => {
    const semRaiz = compare(cenario({ consorcio: { mesContemplacao: 60, taxaAdmPct: 0.3 } }));
    expect(semRaiz.sim.con.custoEfetivo.status).toBe('sem-raiz');
    const { unmount } = render(<SummaryTable comparacao={semRaiz} />);
    expect(screen.getAllByText('n/d (sem TIR)').length).toBe(2);
    unmount();
    const misto = compare(cenario({ consorcio: { mesContemplacao: 60, taxaAdmPct: 0.19 } }));
    expect(misto.sim.con.custoEfetivo.status).toBe('fluxo-misto');
    render(<SummaryTable comparacao={misto} />);
    expect(screen.getAllByText('n/d (fluxo misto)').length).toBe(2);
  });

  it('quando o financiamento é mais barato nas réguas, ele leva a marca "melhor"', () => {
    const c = compare(
      cenario({
        comum: { custoOportunidadeAa: 0.05 },
        financiamento: { jurosAa: 0.07, trAm: 0, prazoMeses: 240 },
        consorcio: { mesContemplacao: 150, taxaAdmPct: 0.25 },
      }),
    );
    render(<SummaryTable comparacao={c} />);
    const linhaVp = screen.getByText(/Régua econômica/).closest('tr') as HTMLElement;
    expect(linhaVp.querySelectorAll('td')[0].className).toContain('melhor');
    expect(linhaVp.querySelectorAll('td')[1].className).not.toContain('melhor');
  });
});

describe('VerdictCard', () => {
  const v0: Verdict = comparacao.verdict;

  it('vencedor, diferença absoluta, tags das razões e riscos', () => {
    render(<VerdictCard verdict={v0} />);
    expect(screen.getByTestId('verdict-winner').textContent).toBe(v0.vencedor === 'consorcio' ? 'Consórcio' : 'Financiamento');
    expect(screen.getByTestId('verdict').className).toContain(`verdict-${v0.vencedor}`);
    for (const r of v0.razoes) expect(screen.getByText(`${r.titulo}.`)).toBeTruthy();
    for (const r of v0.riscos) expect(screen.getByText(r)).toBeTruthy();
    expect(screen.getAllByText('Pró-consórcio').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pró-financiamento').length).toBeGreaterThan(0);
  });

  it('diferença negativa aparece em módulo; empate e financiamento têm título próprio; tag Neutro', () => {
    const v: Verdict = {
      ...v0,
      vencedor: 'empate',
      diffPV: -5000,
      diffPVPctImovel: -0.008,
      razoes: [{ titulo: 'Equivalência', texto: 'tanto faz', favorece: 'neutro' }],
    };
    render(<VerdictCard verdict={v} />);
    expect(screen.getByTestId('verdict-winner').textContent).toBe('Empate técnico');
    expect(screen.getByText('Neutro')).toBeTruthy();
    expect(screen.getByText(/R\$\s?5\.000/).textContent).not.toContain('-');
    expect(screen.getByText('0,8%', { exact: false })).toBeTruthy();
  });

  it.each([
    [{ situacao: 'equilibrio' as const, mes: 77 }, 'mês 77'],
    [{ situacao: 'sempre-vence' as const, mes: null }, 'o consórcio vence em qualquer mês'],
    [{ situacao: 'nunca-vence' as const, mes: null }, 'o consórcio não vence em nenhum mês'],
    [{ situacao: 'vence-tarde' as const, mes: 12 }, 'o consórcio só vence a partir do mês 12'],
  ])('mês de equilíbrio %j', (equilibrio, texto) => {
    render(<VerdictCard verdict={{ ...v0, vencedor: 'financiamento', sensibilidade: { ...v0.sensibilidade, equilibrio } }} />);
    expect(screen.getByText(texto)).toBeTruthy();
    expect(screen.getByTestId('verdict-winner').textContent).toBe('Financiamento');
  });
});
