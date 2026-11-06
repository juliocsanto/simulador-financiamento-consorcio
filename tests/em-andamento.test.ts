import { describe, expect, it } from 'vitest';
import { simulateComparison } from '../src/application/useCases';
import { compare } from '../src/domain/comparison';
import { multaDeCancelamento, restituicaoDaCota, simulateConsortium } from '../src/domain/consortium';
import { defaultInput } from '../src/domain/defaults';
import { buildHiddenCosts } from '../src/domain/hiddenCosts';
import { completarInput, normalizeInput } from '../src/domain/normalize';
import { buildPayoffPlan } from '../src/domain/payoff';
import { anualParaMensal, valorPresente } from '../src/domain/rates';
import { fluxosConsorcio, fluxosFinanciamento, simulate, somar } from '../src/domain/simulation';
import type { ScenarioInput } from '../src/domain/types';

type Over = {
  comum?: Partial<ScenarioInput['comum']>;
  financiamento?: Partial<ScenarioInput['financiamento']>;
  consorcio?: Partial<ScenarioInput['consorcio']>;
};

function cenario(over: Over): ScenarioInput {
  const d = defaultInput();
  return {
    comum: { ...d.comum, ...over.comum },
    financiamento: { ...d.financiamento, ...over.financiamento },
    consorcio: { ...d.consorcio, ...over.consorcio },
  };
}

/** Caso do usuário: carta de R$ 1 milhão, redutor de 35%, 41 parcelas pagas. */
function casoA(over: Over = {}): ScenarioInput {
  return cenario({
    comum: { situacaoAtual: 'consorcio-em-andamento', ...over.comum },
    financiamento: over.financiamento,
    consorcio: { valorCarta: 1_000_000, redutorParcelaPct: 0.35, parcelasPagas: 41, mesContemplacao: 60, ...over.consorcio },
  });
}

function casoB(over: Over = {}): ScenarioInput {
  return cenario({
    comum: { situacaoAtual: 'financiamento-em-andamento', ...over.comum },
    financiamento: { parcelasPagas: 60, ...over.financiamento },
    consorcio: { mesContemplacao: 24, ...over.consorcio },
  });
}

const FULL = 1 + 0.19 + 0.005;
const fullInstallment = (carta: number, reajustes: number): number => (carta * FULL * 1.056 ** reajustes) / 200;

describe('redutor de parcela (art. 22.6), em qualquer situação', () => {
  it('antes da contemplação a parcela-base é (1 − r) da parcela cheia, também depois de um reajuste', () => {
    const r = simulateConsortium(simulate(casoA()).paramsCon);
    expect(r.rows[0].parcelaBase).toBeCloseTo(0.65 * fullInstallment(1_000_000, 0), 6);
    expect(r.rows[12].parcelaBase).toBeCloseTo(0.65 * fullInstallment(1_000_000, 1), 6);
    expect(r.rows[40].parcelaBase).toBeCloseTo(0.65 * fullInstallment(1_000_000, 3), 6);
  });

  it('vale também em nova compra e a diferença fica no saldo, que zera no último mês', () => {
    const sim = simulate(cenario({ consorcio: { redutorParcelaPct: 0.35, mesContemplacao: 30 } }));
    expect(sim.con.rows[0].parcelaBase).toBeCloseTo(0.65 * fullInstallment(600_000, 0), 6);
    const sem = simulate(cenario({ consorcio: { mesContemplacao: 30 } }));
    // com redutor o saldo logo após a parcela 1 é MAIOR: a diferença não paga continua devida
    expect(sim.con.rows[0].saldoDevedor).toBeGreaterThan(sem.con.rows[0].saldoDevedor);
    expect(sim.con.rows[sim.con.rows.length - 1].saldoDevedor).toBe(0);
    expect(sim.con.rows).toHaveLength(200);
  });

  it('depois da contemplação a parcela é recalculada sobre o saldo e sobe em relação à reduzida', () => {
    // imóvel do valor da carta: o crédito não sobra, então a diferença acumulada pesa no saldo
    const sim = simulate(casoA({ comum: { valorImovel: 1_000_000 } }));
    const k = sim.con.contemplacao.mes;
    const reduzidaK = sim.con.rows[k - 1].parcelaBase;
    const posK = sim.con.rows[k].parcelaBase;
    // o mês k+1 é de reajuste: compara com a parcela reduzida que valeria nele
    expect(posK).toBeGreaterThan(reduzidaK * 1.056);
    expect(sim.con.rows[sim.con.rows.length - 1].saldoDevedor).toBeCloseTo(0, 6);
    expect(sim.con.rows).toHaveLength(200);
    // modo parcela: SD/(prazo − k), com o saldo já reajustado no mês k+1
    expect(posK).toBeCloseTo((sim.con.contemplacao.saldoDepois * 1.056) / (200 - k), 6);
  });

  it('modo prazo com redutor: a parcela pós-contemplação é o máximo entre a cheia do mês k e SD/(prazo − k)', () => {
    const sim = simulate(casoA({ comum: { valorImovel: 1_000_000 }, consorcio: { modoPosLance: 'prazo' } }));
    const k = sim.con.contemplacao.mes;
    const cheiaK = (sim.con.contemplacao.creditoCorrigido * FULL) / 200;
    const sobreSaldo = sim.con.contemplacao.saldoDepois / (200 - k);
    const esperado = Math.max(cheiaK, sobreSaldo) * 1.056; // o mês k+1 reajusta
    expect(sim.con.rows[k].parcelaBase).toBeCloseTo(Math.min(esperado, sim.con.rows[k - 1].saldoDevedor * 1.056), 6);
    expect(sim.con.rows[k].parcelaBase).toBeGreaterThan(sim.con.rows[k - 1].parcelaBase);
    expect(sim.con.rows[sim.con.rows.length - 1].saldoDevedor).toBe(0);
  });

  it('contemplação na última parcela com redutor: o último mês quita o saldo inteiro', () => {
    const sim = simulate(cenario({ consorcio: { redutorParcelaPct: 0.35, mesContemplacao: 200 } }));
    const ultima = sim.con.rows[199];
    expect(ultima.saldoDevedor).toBe(0);
    expect(ultima.parcelaBase).toBeGreaterThan(sim.con.rows[198].parcelaBase * 1.5);
  });

  it('r = 0 e m = 0: nova compra idêntica ao comportamento anterior (sem campos de contrato em andamento)', () => {
    const padrao = compare(defaultInput());
    const explicito = compare(cenario({ comum: { situacaoAtual: 'nova-compra' }, consorcio: { redutorParcelaPct: 0, parcelasPagas: 0 } }));
    expect(explicito.financiamento).toEqual(padrao.financiamento);
    expect(explicito.consorcio).toEqual(padrao.consorcio);
    expect(explicito.verdict.vencedor).toBe(padrao.verdict.vencedor);
    expect(padrao.sim.jaPago).toEqual({ consorcio: 0, financiamento: 0 });
    expect(padrao.sim.restituicao).toBeUndefined();
    expect(padrao.sim.saldoFinanciamentoHoje).toBeUndefined();
    // parcelasPagas é ignorado fora da situação correspondente
    const ignorado = compare(cenario({ consorcio: { parcelasPagas: 30 }, financiamento: { parcelasPagas: 90 } }));
    expect(ignorado.consorcio).toEqual(padrao.consorcio);
    expect(ignorado.financiamento).toEqual(padrao.financiamento);
    expect(ignorado.sim.parcelasPagas).toBe(0);
  });
});

describe('consórcio em andamento: t = 0 é hoje', () => {
  it('custo afundado: jaPago = soma das 41 parcelas e fica fora de nominal, VP e real', () => {
    const c = compare(casoA());
    const { sim } = c;
    const soma41 = sim.con.rows.slice(0, 41).reduce((s, r) => s + r.parcela, 0);
    expect(sim.jaPago.consorcio).toBeCloseTo(soma41, 6);
    expect(sim.jaPago.financiamento).toBe(0);
    expect(sim.parcelasPagas).toBe(41);
    const futuras = sim.con.rows.slice(41);
    const nominalFuturo = futuras.reduce((s, r) => s + r.desembolso, 0);
    expect(c.consorcio.totalNominal).toBeCloseTo(nominalFuturo, 4);
    // VP só dos fluxos futuros, com t = mes − 41 (aluguel de hoje em diante)
    const taxa = anualParaMensal(sim.input.comum.custoOportunidadeAa);
    const vpFuturo = futuras.reduce((s, r) => s + r.desembolso / (1 + taxa) ** (r.mes - 41), 0);
    expect(c.consorcio.vp).toBeCloseTo(vpFuturo, 4);
    const ipca = anualParaMensal(sim.input.comum.ipcaAa);
    const realFuturo = futuras.reduce((s, r) => s + r.desembolso / (1 + ipca) ** (r.mes - 41), 0);
    expect(c.consorcio.totalReal).toBeCloseTo(realFuturo, 4);
    expect(c.fluxosCon.total[0]).toBe(0);
    expect(sim.con.totals.desembolso).toBeCloseTo(nominalFuturo, 4);
  });

  it('aluguel e preço do imóvel contam a partir de hoje: t = mes − m', () => {
    const sim = simulate(casoA());
    const k = sim.con.contemplacao.mes;
    expect(k).toBe(60);
    expect(sim.con.rows[0].aluguel).toBe(0); // meses já pagos não têm aluguel na conta
    expect(sim.con.rows[40].aluguel).toBe(0);
    expect(sim.con.rows[41].aluguel).toBeCloseTo(2400, 6); // t = 1
    expect(sim.con.rows[k - 1].aluguel).toBeGreaterThan(0);
    expect(sim.con.rows[k].aluguel).toBe(0);
    const esperado = 600_000 * 1.062 ** ((k - 41) / 12);
    expect(sim.con.contemplacao.precoImovel).toBeCloseTo(esperado, 4);
    const fc = fluxosConsorcio(sim);
    expect(fc.porCategoria.aluguel[1]).toBeCloseTo(2400, 6);
    expect(somar(fc.porCategoria.aluguel)).toBeCloseTo(sim.con.totals.aluguel, 6);
  });

  it('contemplação pedida ≤ m é normalizada para m + 1', () => {
    for (const k of [10, 41, 1, -5]) {
      const sim = simulate(casoA({ consorcio: { mesContemplacao: k } }));
      expect(sim.input.consorcio.mesContemplacao).toBe(42);
      expect(sim.con.contemplacao.mes).toBe(42);
    }
    expect(normalizeInput(casoA({ consorcio: { mesContemplacao: 500 } })).consorcio.mesContemplacao).toBe(200);
    // parcelasPagas é limitado a prazo − 1
    expect(normalizeInput(casoA({ consorcio: { parcelasPagas: 999 } })).consorcio.parcelasPagas).toBe(199);
  });

  it('o motor também normaliza k quando chamado direto com contemplação ≤ m', () => {
    const sim = simulate(casoA());
    const r = simulateConsortium({ ...sim.paramsCon, mesContemplacao: 3 });
    expect(r.contemplacao.mes).toBe(42);
  });

  it('restituição: pctAmortizado, multa de 10% (≤ 50%) e t = prazo − m + 2', () => {
    const sim = simulate(casoA());
    const rest = sim.restituicao!;
    expect(rest.pctAmortizado).toBeCloseTo(41 * 0.65 * (1 / 200), 9);
    expect(rest.multaPct).toBe(0.1);
    expect(rest.t).toBe(200 - 41 + 2);
    expect(rest.creditoPrazo).toBeCloseTo(1_000_000 * 1.056 ** 16, 4);
    expect(rest.valor).toBeCloseTo(rest.pctAmortizado * rest.creditoPrazo * 0.9, 4);
    // entra como entrada de caixa na opção financiamento, em t = 161
    const ff = fluxosFinanciamento(sim);
    expect(ff.porCategoria.restituicao[161]).toBeCloseTo(-rest.valor, 6);
    expect(sim.horizonte).toBeGreaterThanOrEqual(161);
    // a opção financiamento é uma nova compra hoje: entrada e custos em t = 0
    expect(ff.total[0]).toBeCloseTo(sim.custosIniciais.total, 6);
    expect(ff.total[0]).toBeGreaterThan(0);
  });

  it('faixas de multa: 10% até 50%, 5% até 80%, 0% acima', () => {
    expect(multaDeCancelamento(0.5)).toBe(0.1);
    expect(multaDeCancelamento(0.5001)).toBe(0.05);
    expect(multaDeCancelamento(0.8)).toBe(0.05);
    expect(multaDeCancelamento(0.81)).toBe(0);
    const pct = (m: number) => simulate(casoA({ consorcio: { redutorParcelaPct: 0, parcelasPagas: m } })).restituicao!;
    expect(pct(60).multaPct).toBe(0.1); // 30%
    const meio = pct(120); // 60%
    expect(meio.pctAmortizado).toBeCloseTo(0.6, 9);
    expect(meio.multaPct).toBe(0.05);
    expect(meio.valor).toBeCloseTo(0.6 * meio.creditoPrazo * 0.95, 4);
    const alto = pct(170); // 85%
    expect(alto.pctAmortizado).toBeCloseTo(0.85, 9);
    expect(alto.multaPct).toBe(0);
    expect(alto.valor).toBeCloseTo(0.85 * alto.creditoPrazo, 4);
    expect(alto.t).toBe(200 - 170 + 2);
  });

  it('restituicaoDaCota sem parcelas pagas (m ausente): nada a devolver', () => {
    const sim = simulate(defaultInput());
    const { parcelasPagas: _ignorado, ...semM } = sim.paramsCon;
    void _ignorado;
    const rest = restituicaoDaCota(sim.con.rows, semM);
    expect(rest.pctAmortizado).toBe(0);
    expect(rest.valor).toBe(0);
    expect(rest.t).toBe(202);
  });

  it('a varredura de equilíbrio nunca aponta um mês ≤ m e concorda com o veredito', () => {
    const casos: Array<[number, number]> = [
      [60, 0.114],
      [150, 0.08],
      [100, 0.2],
    ];
    for (const [k, co] of casos) {
      const input = casoA({ comum: { custoOportunidadeAa: co }, consorcio: { mesContemplacao: k } });
      const { verdict } = compare(input);
      const eq = verdict.sensibilidade.equilibrio;
      if (eq.mes !== null) expect(eq.mes).toBeGreaterThan(42);
      if (verdict.vencedor === 'consorcio') expect(eq.situacao).not.toBe('nunca-vence');
      if (eq.situacao === 'equilibrio' && eq.mes !== null) {
        // o consórcio vence com contemplação antes do equilíbrio e deixa de vencer nele (mesma função de fluxos)
        const antes = compare(casoA({ comum: { custoOportunidadeAa: co }, consorcio: { mesContemplacao: eq.mes - 1 } }));
        const nele = compare(casoA({ comum: { custoOportunidadeAa: co }, consorcio: { mesContemplacao: eq.mes } }));
        expect(antes.verdict.vencedor).toBe('consorcio');
        expect(nele.verdict.vencedor).not.toBe('consorcio');
      }
    }
  });

  it('veredito traz a razão do custo afundado, a do redutor e o risco do cancelamento', () => {
    const { verdict } = compare(casoA());
    const afundado = verdict.razoes.find((r) => r.titulo === 'Já pago (custo afundado)')!;
    expect(afundado.texto).toContain('não entra na comparação porque é igual nas duas escolhas');
    expect(afundado.texto).toContain('41 parcelas');
    expect(verdict.razoes.some((r) => r.titulo === 'Redutor de parcela')).toBe(true);
    const risco = verdict.riscos.find((r) => r.includes('cancelar a cota'))!;
    expect(risco).toContain('multa de 10,0%');
    expect(risco).toContain('mês 161');
    expect(risco).toContain('Vender ou transferir a cota');
    // aluguel é contado a partir de hoje
    expect(verdict.razoes.find((r) => r.titulo === 'Aluguel durante a espera')!.texto).toContain('até o mês 19');
  });

  it('redutor com contemplação na última parcela: razão explica que a última parcela quita o saldo', () => {
    const { verdict } = compare(cenario({ consorcio: { redutorParcelaPct: 0.2, mesContemplacao: 200 } }));
    expect(verdict.razoes.find((r) => r.titulo === 'Redutor de parcela')!.texto).toContain('quita todo o saldo');
  });

  it('plano de quitação: anos contam a partir de hoje e nunca antes de m + 1', () => {
    const sim = simulate(casoA());
    const plano = buildPayoffPlan(sim).consorcio;
    expect(plano.quitacoes.length).toBeGreaterThan(0);
    for (const q of plano.quitacoes) {
      expect(q.mes).toBe(41 + q.anos * 12);
      expect(q.mes).toBeGreaterThan(41);
      expect(q.mes).toBeGreaterThan(sim.con.contemplacao.mes);
    }
    // o baseline é o da opção (sem as parcelas já pagas)
    expect(plano.baselineNominal).toBeCloseTo(somar(fluxosConsorcio(sim).total), 4);
    expect(plano.baselineAdm).toBeCloseTo(sim.con.totals.adm, 6);
  });

  it('hiddenCosts não conta o que já foi pago e usa a restituição na desistência', () => {
    const c = compare(casoA());
    const itens = buildHiddenCosts(c.sim, c.fluxosCon, c.verdict);
    const parcela = itens.find((i) => i.id === 'con-parcela-cresce')!;
    expect(parcela.valor).toBeGreaterThan(0);
    const desist = itens.find((i) => i.id === 'con-desistencia')!;
    expect(desist.texto).toContain('Se desistisse hoje');
    expect(desist.valor).toBeCloseTo(c.sim.restituicao!.valor, 6);
    expect(itens.find((i) => i.id === 'con-sem-data')!.texto).toContain(`no mês ${c.sim.con.contemplacao.mes} do grupo (daqui a ${c.sim.con.contemplacao.mes - c.sim.parcelasPagasConsorcio}`);
    expect(itens.find((i) => i.id === 'con-adm-integral')!.texto).toContain('daqui para frente');
    expect(itens.some((i) => i.id === 'fin-custos-entrada')).toBe(true);
  });

  it('o caso de uso completo roda em modo A', () => {
    const rel = simulateComparison(casoA());
    expect(rel.comparacao.sim.situacao).toBe('consorcio-em-andamento');
    expect(rel.quitacao.consorcio.quitacoes.length).toBeGreaterThan(0);
  });
});

describe('financiamento em andamento', () => {
  it('opção financiamento = continuar pagando: sem entrada, ITBI nem aluguel, parcelas m+1..prazo em t = mes − m', () => {
    const c = compare(casoB());
    const { sim } = c;
    expect(sim.custosIniciais.total).toBe(0);
    expect(c.fluxosFin.total[0]).toBe(0);
    expect(c.fluxosFin.porCategoria.itbiRegistro[0]).toBe(0);
    expect(somar(c.fluxosFin.porCategoria.aluguel)).toBe(0);
    expect(sim.parcelasPagasFinanciamento).toBe(60);
    const futuras = sim.fin.rows.slice(60);
    expect(c.fluxosFin.total[1]).toBeCloseTo(futuras[0].desembolso, 6);
    expect(c.financiamento.totalNominal).toBeCloseTo(
      futuras.reduce((s, r) => s + r.desembolso, 0),
      4,
    );
    expect(sim.finTotals.juros).toBeCloseTo(
      futuras.reduce((s, r) => s + r.juros, 0),
      6,
    );
    expect(sim.jaPago.financiamento).toBeCloseTo(
      sim.fin.rows.slice(0, 60).reduce((s, r) => s + r.desembolso, 0),
      6,
    );
    expect(sim.jaPago.consorcio).toBe(0);
    expect(sim.saldoFinanciamentoHoje).toBeCloseTo(sim.fin.rows[59].saldoFinal, 6);
    expect(sim.paramsFinHoje.principal).toBeCloseTo(sim.saldoFinanciamentoHoje!, 6);
    expect(sim.paramsFinHoje.prazoMeses).toBe(300);
  });

  it('opção consórcio: paga o financiamento até k e o crédito quita o saldo após a parcela m + k (sobra abate o consórcio)', () => {
    const c = compare(casoB());
    const { sim } = c;
    const k = sim.con.contemplacao.mes;
    expect(k).toBe(24);
    const alvo = sim.fin.rows[60 + k - 1].saldoFinal;
    expect(sim.con.contemplacao.destino).toBe('financiamento');
    expect(sim.con.contemplacao.precoImovel).toBeCloseTo(alvo, 6);
    // sem ITBI, registro nem aluguel; a tarifa de avaliação do consórcio continua
    expect(somar(c.fluxosCon.porCategoria.itbiRegistro)).toBe(0);
    expect(somar(c.fluxosCon.porCategoria.aluguel)).toBe(0);
    expect(c.fluxosCon.porCategoria.tarifas[k]).toBeCloseTo(2000 + sim.fin.rows[60 + k - 1].tarifa, 6);
    // financiamento pago na espera entra nas categorias do financiamento, t = 1..k
    const espera = sim.fin.rows.slice(60, 60 + k);
    expect(somar(c.fluxosCon.porCategoria.juros)).toBeCloseTo(
      espera.reduce((s, r) => s + r.juros, 0),
      6,
    );
    expect(c.fluxosCon.porCategoria.juros[k + 1]).toBe(0);
    // crédito cobre: sobra reduz o saldo do consórcio
    const cp = sim.con.contemplacao;
    expect(cp.complemento).toBe(0);
    expect(cp.sobraCredito).toBeCloseTo(cp.creditoDisponivel - alvo, 6);
    expect(cp.saldoDepois).toBeCloseTo(cp.saldoAntes - cp.sobraCredito, 6);
    // a razão e os riscos não falam de aluguel
    const { verdict } = c;
    expect(verdict.razoes.some((r) => r.titulo === 'Aluguel durante a espera')).toBe(false);
    expect(verdict.razoes.some((r) => r.titulo === 'Financiamento pago em paralelo')).toBe(true);
    expect(verdict.riscos.find((r) => r.includes('Quitar o financiamento'))).toContain('sobram');
    expect(verdict.razoes.find((r) => r.titulo === 'Já pago (custo afundado)')!.texto).toContain('60 parcelas do financiamento');
  });

  it('crédito menor que o saldo: o complemento sai do bolso', () => {
    const c = compare(casoB({ consorcio: { valorCarta: 150_000 } }));
    const cp = c.sim.con.contemplacao;
    expect(cp.creditoDisponivel).toBeLessThan(cp.precoImovel);
    expect(cp.complemento).toBeCloseTo(cp.precoImovel - cp.creditoDisponivel, 6);
    expect(c.fluxosCon.porCategoria.complemento[cp.mes]).toBeCloseTo(cp.complemento, 6);
    expect(c.verdict.riscos.find((r) => r.includes('Quitar o financiamento'))).toContain('NÃO cobre');
    const itens = buildHiddenCosts(c.sim, c.fluxosCon, c.verdict);
    expect(itens.find((i) => i.id === 'con-complemento')!.texto).toContain('para quitar');
  });

  it('financiamento já quitado antes de m: saldo zero, sem quebrar', () => {
    const c = compare(casoB({ financiamento: { amortExtraMensal: 200_000, parcelasPagas: 100, prazoMeses: 360 } }));
    expect(c.sim.saldoFinanciamentoHoje).toBe(0);
    expect(c.sim.con.contemplacao.precoImovel).toBe(0);
    expect(c.financiamento.totalNominal).toBe(0);
    expect(Number.isFinite(c.verdict.diffPV)).toBe(true);
  });

  it('hiddenCosts e plano de quitação partem do saldo de hoje', () => {
    const c = compare(casoB());
    const itens = buildHiddenCosts(c.sim, c.fluxosCon, c.verdict);
    expect(itens.some((i) => i.id === 'fin-custos-entrada')).toBe(false);
    const saldo = itens.find((i) => i.id === 'fin-saldo-nao-cai')!;
    expect(saldo.texto).toContain('saldo devedor de hoje');
    const sem = itens.find((i) => i.id === 'con-sem-data')!;
    expect(sem.texto).toContain('não há aluguel');
    expect(itens.find((i) => i.id === 'con-complemento')!.texto).toContain('saldo devedor do financiamento');
    expect(itens.find((i) => i.id === 'fin-juros-total')!.valor).toBeCloseTo(c.sim.finTotals.juros / c.sim.saldoFinanciamentoHoje!, 6);
    const plano = buildPayoffPlan(c.sim).financiamento;
    expect(plano.baseline.meses).toBe(300);
    expect(plano.baseline.parcelaInicialTotal).toBeCloseTo(c.sim.fin.rows[60].desembolso, 0);
    // metas em anos a partir de hoje (só as menores que o prazo restante de 25 anos)
    expect(plano.estrategias.map((e) => e.anosAlvo)).toEqual([5, 7, 10, 15]);
    for (const e of plano.estrategias) expect(e.meses).toBeLessThanOrEqual(e.anosAlvo! * 12);
  });

  it('a varredura de equilíbrio em B usa os mesmos fluxos e começa em k = 1', () => {
    for (const k of [6, 60]) {
      const c = compare(casoB({ consorcio: { mesContemplacao: k } }));
      const eq = c.verdict.sensibilidade.equilibrio;
      if (c.verdict.vencedor === 'consorcio') expect(eq.situacao).not.toBe('nunca-vence');
      if (eq.situacao === 'equilibrio' && eq.mes !== null) {
        expect(compare(casoB({ consorcio: { mesContemplacao: eq.mes - 1 } })).verdict.vencedor).toBe('consorcio');
        expect(compare(casoB({ consorcio: { mesContemplacao: eq.mes } })).verdict.vencedor).not.toBe('consorcio');
      }
    }
    const nunca = compare(casoB({ consorcio: { taxaAdmPct: 1, mesContemplacao: 24 } }));
    expect(nunca.verdict.sensibilidade.equilibrio.situacao).toBe('nunca-vence');
    expect(nunca.verdict.riscos.some((r) => r.includes('Mesmo com contemplação já no mês 1'))).toBe(true);
  });
});

describe('modo A: ramos adicionais da varredura', () => {
  it('"nunca vence" a partir de m + 1 diz o primeiro mês possível do contrato', () => {
    const nunca = compare(casoA({ comum: { custoOportunidadeAa: 0.01 }, consorcio: { taxaAdmPct: 0.5 } }));
    const eq = nunca.verdict.sensibilidade.equilibrio;
    expect(eq.situacao === 'nunca-vence' || eq.situacao === 'vence-tarde').toBe(true);
    if (eq.situacao === 'nunca-vence') expect(nunca.verdict.riscos.some((r) => r.includes('mês 42 do contrato'))).toBe(true);
    if (eq.situacao === 'vence-tarde') expect(eq.mes).toBeGreaterThan(42);
  });
});

describe('normalização de cenários antigos', () => {
  it('completa os campos novos que faltam em objetos salvos antes desta versão', () => {
    const antigo = defaultInput() as unknown as {
      comum: Record<string, unknown>;
      financiamento: Record<string, unknown>;
      consorcio: Record<string, unknown>;
    };
    delete antigo.comum.situacaoAtual;
    delete antigo.financiamento.parcelasPagas;
    delete antigo.consorcio.parcelasPagas;
    delete antigo.consorcio.redutorParcelaPct;
    const completo = completarInput(antigo as unknown as ScenarioInput);
    expect(completo.comum.situacaoAtual).toBe('nova-compra');
    expect(completo.financiamento.parcelasPagas).toBe(0);
    expect(completo.consorcio.parcelasPagas).toBe(0);
    expect(completo.consorcio.redutorParcelaPct).toBe(0);
    const norm = normalizeInput(antigo as unknown as ScenarioInput);
    expect(norm.comum.situacaoAtual).toBe('nova-compra');
    expect(norm.consorcio.redutorParcelaPct).toBe(0);
    // simular um cenário antigo funciona e dá o mesmo resultado do padrão
    expect(compare(antigo as unknown as ScenarioInput).consorcio).toEqual(compare(defaultInput()).consorcio);
  });

  it('situação inválida cai em nova compra; redutor e parcelas são limitados', () => {
    const ruim = cenario({ comum: { situacaoAtual: 'qualquer' as never }, consorcio: { redutorParcelaPct: 5, parcelasPagas: Number.NaN } });
    const n = normalizeInput(ruim);
    expect(n.comum.situacaoAtual).toBe('nova-compra');
    expect(n.consorcio.redutorParcelaPct).toBe(0.99);
    expect(n.consorcio.parcelasPagas).toBe(0);
    expect(normalizeInput(cenario({ consorcio: { redutorParcelaPct: -1 } })).consorcio.redutorParcelaPct).toBe(0);
    expect(normalizeInput(cenario({ financiamento: { parcelasPagas: 9999 } })).financiamento.parcelasPagas).toBe(359);
  });
});

describe('integração: VP das opções bate com a série e o veredito', () => {
  it('em A o VP do consórcio e o diffPV vêm dos mesmos fluxos que o veredito usa', () => {
    const c = compare(casoA());
    const taxa = anualParaMensal(c.sim.input.comum.custoOportunidadeAa);
    expect(valorPresente(c.fluxosCon.total, taxa)).toBeCloseTo(c.consorcio.vp, 6);
    expect(c.verdict.diffPV).toBeCloseTo(c.financiamento.vp - c.consorcio.vp, 6);
  });
});
