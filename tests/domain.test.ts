import { describe, expect, it } from 'vitest';
import { compare } from '../src/domain/comparison';
import { simulateConsortium, type ConsortiumCalcParams } from '../src/domain/consortium';
import { defaultInput } from '../src/domain/defaults';
import { simulateFinancing, type FinancingCalcParams } from '../src/domain/financing';
import { buildHiddenCosts } from '../src/domain/hiddenCosts';
import { buildPayoffPlan, extraNecessarioParaQuitar } from '../src/domain/payoff';
import { anualParaMensal, irr, irrAnual, mensalParaAnual, pmt, raizesTir } from '../src/domain/rates';
import { consortiumParams, fluxosConsorcio, fluxosFinanciamento, simulate } from '../src/domain/simulation';
import type { ScenarioInput } from '../src/domain/types';

const UM_PORCENTO_AM_EM_AA = 1.01 ** 12 - 1;

function finParams(over: Partial<FinancingCalcParams> = {}): FinancingCalcParams {
  return {
    principal: 100_000,
    valorImovel: 200_000,
    jurosAa: UM_PORCENTO_AM_EM_AA,
    trAm: 0,
    prazoMeses: 12,
    sistema: 'PRICE',
    mipAm: 0,
    dfiAm: 0,
    tarifaAdmMensal: 0,
    amortExtraMensal: 0,
    modoAmortExtra: 'prazo',
    ...over,
  };
}

function conParams(over: Partial<ConsortiumCalcParams> = {}): ConsortiumCalcParams {
  return {
    valorCarta: 100_000,
    prazoMeses: 100,
    taxaAdmPct: 0.2,
    fundoReservaPct: 0,
    seguroAm: 0,
    reajusteCartaAa: 0,
    mesContemplacao: 10,
    lancePct: 0,
    embutidoPct: 0,
    embutidoAbateSaldo: false,
    modoPosLance: 'parcela',
    tarifaAvaliacaoConsorcio: 0,
    devolveFundoReserva: false,
    valorImovel: 100_000,
    valorizacaoImovelAa: 0,
    itbiPct: 0,
    registroPct: 0,
    aluguelMensal: 0,
    reajusteAluguelAa: 0,
    ...over,
  };
}

describe('taxas', () => {
  it('converte anual para mensal e de volta', () => {
    expect(anualParaMensal(UM_PORCENTO_AM_EM_AA)).toBeCloseTo(0.01, 12);
    expect(mensalParaAnual(0.01)).toBeCloseTo(UM_PORCENTO_AM_EM_AA, 12);
  });
  it('pmt com taxa zero divide igualmente', () => {
    expect(pmt(1200, 0, 12)).toBe(100);
  });
  it('TIR de [-100, 110] mensal é 10%', () => {
    expect(irr([-100, 110])).toBeCloseTo(0.1, 9);
    expect(irrAnual([-100, 110])).toBeCloseTo(1.1 ** 12 - 1, 6);
  });
  it('TIR sem raiz devolve null', () => {
    expect(irr([100, 100])).toBeNull();
    expect(irr([-100, -50])).toBeNull();
    expect(irr([])).toBeNull();
  });
  it('TIR por bisseção quando Newton não converge (taxa negativa)', () => {
    const r = irr([-100, 90]);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(-0.1, 6);
  });
});

describe('financiamento', () => {
  it('PRICE: parcela de 8884,88 e amortizações somam o principal', () => {
    const r = simulateFinancing(finParams());
    expect(r.rows).toHaveLength(12);
    expect(r.rows[0].parcela).toBeCloseTo(8884.88, 2);
    expect(r.rows[11].parcela).toBeCloseTo(8884.88, 2);
    expect(r.totals.amortizacao).toBeCloseTo(100_000, 2);
  });

  it('SAC: primeira 11200, última 10100, juros totais 7800', () => {
    const r = simulateFinancing(finParams({ principal: 120_000, sistema: 'SAC' }));
    expect(r.rows[0].parcela).toBeCloseTo(11_200, 2);
    expect(r.rows[11].parcela).toBeCloseTo(10_100, 2);
    expect(r.totals.juros).toBeCloseTo(7_800, 2);
  });

  it.each(['prazo', 'parcela'] as const)('SAC com TR (%s): saldo final zero e prazo respeitado', (modo) => {
    const r = simulateFinancing(
      finParams({ principal: 100_000, sistema: 'SAC', trAm: 0.005, prazoMeses: 60, jurosAa: 0.1, modoAmortExtra: modo }),
    );
    expect(r.rows).toHaveLength(60);
    expect(r.rows[59].saldoFinal).toBe(0);
    expect(r.totals.correcao).toBeGreaterThan(0);
  });

  it('PRICE com TR zera o saldo no prazo e a parcela cresce com a TR', () => {
    const r = simulateFinancing(finParams({ trAm: 0.005, prazoMeses: 120, jurosAa: 0.1 }));
    expect(r.rows).toHaveLength(120);
    expect(r.rows[119].saldoFinal).toBe(0);
    expect(r.rows[1].parcela / r.rows[0].parcela).toBeCloseTo(1.005, 6);
  });

  it.each(['SAC', 'PRICE'] as const)('%s: extra no modo prazo encurta o cronograma', (sistema) => {
    const base = simulateFinancing(finParams({ sistema, prazoMeses: 120, principal: 200_000, jurosAa: 0.1 }));
    const extra = simulateFinancing(
      finParams({ sistema, prazoMeses: 120, principal: 200_000, jurosAa: 0.1, amortExtraMensal: 1_000 }),
    );
    expect(extra.rows.length).toBeLessThan(base.rows.length);
    expect(extra.totals.juros).toBeLessThan(base.totals.juros);
    expect(extra.rows[extra.rows.length - 1].saldoFinal).toBe(0);
  });

  it.each(['SAC', 'PRICE'] as const)('%s: extra no modo parcela mantém o prazo e reduz as parcelas', (sistema) => {
    const common = { sistema, prazoMeses: 120, principal: 200_000, jurosAa: 0.1 } as const;
    const base = simulateFinancing(finParams(common));
    // extra moderado: a soma harmônica dos abatimentos fica abaixo da última amortização, então o prazo se mantém
    const extra = simulateFinancing(finParams({ ...common, amortExtraMensal: 100, modoAmortExtra: 'parcela' }));
    expect(extra.rows).toHaveLength(base.rows.length);
    expect(extra.rows[60].parcela).toBeLessThan(base.rows[60].parcela);
    expect(extra.rows[119].parcela).toBeLessThan(base.rows[119].parcela);
  });

  it('seguros e tarifa entram no desembolso e o CET supera a taxa nominal', () => {
    const sim = simulate(defaultInput());
    const r = sim.fin.rows[0];
    expect(r.desembolso).toBeCloseTo(r.parcela + r.mip + r.dfi + r.tarifa + r.extra, 8);
    expect(sim.finCet as number).toBeGreaterThan(sim.input.financiamento.jurosAa);
  });

  it('amortização pontual (FGTS) reduz o prazo', () => {
    const base = simulateFinancing(finParams({ prazoMeses: 120, principal: 200_000, jurosAa: 0.1, sistema: 'SAC' }));
    const fgts = simulateFinancing(
      finParams({ prazoMeses: 120, principal: 200_000, jurosAa: 0.1, sistema: 'SAC', extrasPontuais: { 24: 30_000 } }),
    );
    expect(fgts.rows.length).toBeLessThan(base.rows.length);
  });
});

describe('consórcio', () => {
  it('sem reajuste nem lance: parcela 1200 em todos os meses e adm total 20000', () => {
    const r = simulateConsortium(conParams());
    expect(r.rows).toHaveLength(100);
    for (const row of r.rows) expect(row.parcela).toBeCloseTo(1_200, 6);
    expect(r.totals.adm).toBeCloseTo(20_000, 6);
    expect(r.totals.fundoComum).toBeCloseTo(100_000, 6);
    expect(r.rows[99].saldoDevedor).toBe(0);
  });

  it('lance incide sobre a base crédito+adm+FR (40% de 602500 = 241000)', () => {
    const r = simulateConsortium(
      conParams({ valorCarta: 500_000, fundoReservaPct: 0.005, lancePct: 0.4, valorImovel: 700_000 }),
    );
    expect(r.base0).toBeCloseTo(602_500, 6);
    expect(r.contemplacao.base).toBeCloseTo(602_500, 6);
    expect(r.contemplacao.lance).toBeCloseTo(241_000, 6);
    expect(r.contemplacao.lanceCaixa).toBeCloseTo(241_000, 6);
  });

  it('embutido sem abate reduz o saldo só pela parte em dinheiro; com abate reduz pelo lance todo', () => {
    const base = conParams({
      valorCarta: 500_000,
      fundoReservaPct: 0.005,
      lancePct: 0.4,
      embutidoPct: 0.1,
      valorImovel: 700_000,
    });
    const sem = simulateConsortium({ ...base, embutidoAbateSaldo: false }).contemplacao;
    expect(sem.embutido).toBeCloseTo(60_250, 6);
    expect(sem.lanceCaixa).toBeCloseTo(180_750, 6);
    expect(sem.saldoAntes - sem.saldoDepois).toBeCloseTo(180_750, 6);
    expect(sem.creditoDisponivel).toBeCloseTo(500_000 - 60_250, 6);
    const com = simulateConsortium({ ...base, embutidoAbateSaldo: true }).contemplacao;
    expect(com.saldoAntes - com.saldoDepois).toBeCloseTo(241_000, 6);
  });

  it('reajuste de 10% a.a.: parcela do mês 13 = parcela do mês 12 x 1,10', () => {
    const r = simulateConsortium(conParams({ reajusteCartaAa: 0.1, mesContemplacao: 50 }));
    expect(r.rows[12].parcela).toBeCloseTo(r.rows[11].parcela * 1.1, 2);
    expect(r.rows[13].parcela).toBeCloseTo(r.rows[12].parcela, 2);
  });

  it('aluguel só até a contemplação, com reajuste anual', () => {
    const r = simulateConsortium(conParams({ aluguelMensal: 1_000, reajusteAluguelAa: 0.1, mesContemplacao: 14 }));
    expect(r.rows[0].aluguel).toBe(1_000);
    expect(r.rows[12].aluguel).toBeCloseTo(1_100, 6);
    expect(r.rows[14].aluguel).toBe(0);
  });

  it('complemento quando o imóvel valoriza mais que a carta; sobra abate o saldo', () => {
    const cara = simulateConsortium(conParams({ valorImovel: 120_000 })).contemplacao;
    expect(cara.complemento).toBeCloseTo(20_000, 6);
    const barata = simulateConsortium(conParams({ valorImovel: 90_000 })).contemplacao;
    expect(barata.complemento).toBe(0);
    expect(barata.sobraCredito).toBeCloseTo(10_000, 6);
    expect(barata.saldoAntes - barata.saldoDepois).toBeCloseTo(10_000, 6);
  });

  it('modo prazo após o lance mantém a parcela e encerra antes do prazo', () => {
    const r = simulateConsortium(conParams({ lancePct: 0.3, modoPosLance: 'prazo', mesContemplacao: 10 }));
    expect(r.rows.length).toBeLessThan(100);
    expect(r.rows[r.rows.length - 1].saldoDevedor).toBe(0);
    expect(r.rows[20].parcelaBase).toBeCloseTo(r.rows[9].parcelaBase, 6);
  });

  it('devolução do fundo de reserva entra como entrada no fim', () => {
    const r = simulateConsortium(conParams({ fundoReservaPct: 0.02, devolveFundoReserva: true }));
    expect(r.totals.devolucaoFundoReserva).toBeCloseTo(r.totals.fundoReserva, 6);
  });

  it('custo efetivo existe e quitação antecipada encerra o cronograma', () => {
    const base = conParams({ reajusteCartaAa: 0.05 });
    const ce = simulateConsortium(base).custoEfetivo;
    expect(ce.status).toBe('ok');
    expect(ce.taxaAa).toBeGreaterThan(0);
    const q = simulateConsortium({ ...base, quitacaoAntecipadaMes: 40 });
    expect(q.rows).toHaveLength(40);
    expect(q.rows[39].saldoDevedor).toBe(0);
    expect(q.totals.quitacao).toBeGreaterThan(0);
  });
});

function cenario(muda: (i: ScenarioInput) => void): ScenarioInput {
  const i = defaultInput();
  muda(i);
  return i;
}

describe('veredito', () => {
  it('CET do financiamento muito acima do custo de oportunidade e contemplação no mês 1: consórcio vence', () => {
    const c = compare(
      cenario((i) => {
        i.financiamento.jurosAa = 0.25;
        i.comum.custoOportunidadeAa = 0.08;
        i.consorcio.mesContemplacao = 1;
      }),
    );
    expect(c.sim.finCet as number).toBeGreaterThan(0.25);
    expect(c.verdict.vencedor).toBe('consorcio');
    expect(c.verdict.diffPV).toBeGreaterThan(0);
  });

  it('contemplação no último mês e aluguel alto: financiamento vence', () => {
    const c = compare(
      cenario((i) => {
        i.consorcio.mesContemplacao = i.consorcio.prazoMeses;
        i.comum.aluguelMensal = 6_000;
        i.financiamento.jurosAa = 0.09;
      }),
    );
    expect(c.verdict.vencedor).toBe('financiamento');
    expect(c.verdict.diffPV).toBeLessThan(0);
  });

  it('razões trazem números e há riscos e sensibilidade', () => {
    const v = compare(defaultInput()).verdict;
    expect(v.razoes.length).toBeGreaterThanOrEqual(5);
    for (const r of v.razoes) expect(r.texto).toMatch(/\d/);
    expect(v.riscos.length).toBeGreaterThan(2);
    expect(v.sensibilidade.coMais.custoOportunidadeAa).toBeCloseTo(0.144, 6);
  });
});

describe('invariantes de totais', () => {
  it('soma das categorias bate com o desembolso mês a mês nas duas opções', () => {
    const sim = simulate(defaultInput());
    const ff = fluxosFinanciamento(sim);
    const fc = fluxosConsorcio(sim);
    const totalFin = sim.custosIniciais.total + sim.fin.totals.desembolso;
    expect(ff.total.reduce((s, v) => s + v, 0)).toBeCloseTo(totalFin, 4);
    expect(fc.total.reduce((s, v) => s + v, 0)).toBeCloseTo(sim.con.totals.desembolso, 4);
  });

  it('com lance e quitação a soma das categorias continua batendo', () => {
    const i = cenario((x) => {
      x.consorcio.lancePct = 0.3;
      x.consorcio.embutidoPct = 0.1;
      x.consorcio.devolveFundoReserva = true;
    });
    const sim = simulate(i);
    expect(fluxosConsorcio(sim).total.reduce((s, v) => s + v, 0)).toBeCloseTo(sim.con.totals.desembolso, 4);
  });
});

describe('plano de quitação', () => {
  it('extra necessário para quitar o SAC em 5 anos termina o cronograma em 60 meses (+-1)', () => {
    const sim = simulate(cenario((i) => (i.financiamento.sistema = 'SAC')));
    const extra = extraNecessarioParaQuitar(sim.paramsFin, 5);
    expect(extra).toBeGreaterThan(0);
    const r = simulateFinancing({ ...sim.paramsFin, amortExtraMensal: extra, modoAmortExtra: 'prazo' });
    expect(Math.abs(r.rows.length - 60)).toBeLessThanOrEqual(1);
  });

  it('estratégias só para metas menores que o prazo e com juros economizados positivos', () => {
    const sim = simulate(defaultInput());
    const plano = buildPayoffPlan(sim);
    expect(plano.financiamento.estrategias.map((e) => e.anosAlvo)).toEqual([5, 7, 10, 15]);
    for (const e of plano.financiamento.estrategias) {
      expect(e.jurosEconomizados).toBeGreaterThan(0);
      expect(e.meses).toBeLessThanOrEqual((e.anosAlvo as number) * 12);
      expect(e.fundo).not.toBeNull();
    }
  });

  it('regra da wiki: amortizar só compensa se CET > custo de oportunidade', () => {
    const alto = buildPayoffPlan(simulate(cenario((i) => (i.comum.custoOportunidadeAa = 0.3))));
    expect(alto.financiamento.amortizarCompensa).toBe(false);
    const baixo = buildPayoffPlan(simulate(cenario((i) => (i.comum.custoOportunidadeAa = 0.05))));
    expect(baixo.financiamento.amortizarCompensa).toBe(true);
  });

  it('quitação antecipada do consórcio: taxa de adm não é descontada', () => {
    const sim = simulate(defaultInput());
    const plano = buildPayoffPlan(sim).consorcio;
    expect(plano.quitacoes.map((q) => q.anos)).toEqual([3, 5, 7, 10]);
    for (const q of plano.quitacoes) {
      expect(q.economiaNominal).toBeGreaterThan(0);
      expect(q.admPaga).toBeLessThanOrEqual(plano.baselineAdm + 1e-6);
      expect(q.admPaga).toBeGreaterThan(plano.baselineAdm * 0.5);
    }
  });

  it('FGTS opcional gera estratégia só quando informado', () => {
    expect(buildPayoffPlan(simulate(defaultInput())).financiamento.fgts).toBeNull();
    const fgts = buildPayoffPlan(
      simulate(
        cenario((i) => {
          i.financiamento.fgtsSaldo = 20_000;
          i.financiamento.fgtsAporteMensal = 500;
        }),
      ),
    ).financiamento.fgts;
    expect(fgts).not.toBeNull();
    expect(fgts?.mesesReduzidos).toBeGreaterThan(0);
  });
});

describe('o que não te contam', () => {
  it('traz 8 itens do financiamento e 10 do consórcio, cada um com número', () => {
    const c = compare(defaultInput());
    const itens = buildHiddenCosts(c.sim, c.fluxosCon, c.verdict);
    expect(itens.filter((i) => i.lado === 'financiamento')).toHaveLength(8);
    expect(itens.filter((i) => i.lado === 'consorcio')).toHaveLength(10);
    const comNumero = itens.filter((i) => i.id !== 'fin-portabilidade' && i.id !== 'con-golpe');
    for (const i of comNumero) expect(i.texto).toMatch(/\d/);
  });
});

describe('TIR e custo efetivo do consórcio', () => {
  it('fluxo de empréstimo convencional: irr ≈ 1% a.m.', () => {
    const parcela = pmt(1000, 0.01, 12);
    const fluxo = [1000, ...Array<number>(12).fill(-parcela)];
    expect(irr(fluxo)).toBeCloseTo(0.01, 6);
  });

  it('fluxo com 2 raízes: irr devolve null e raizesTir acha as duas', () => {
    // (1 - x)(1 - 2x) com x = 1/(1+r): raízes em r = 0 e r = 1 (mensal)... usa 10%/20% a.m.
    // f(x) = -a + b x - c x^2 com raízes x1=1/1.1, x2=1/1.2
    const x1 = 1 / 1.1;
    const x2 = 1 / 1.2;
    const fluxo = [-x1 * x2, x1 + x2, -1];
    const raizes = raizesTir(fluxo, -0.5, 1, 0.0002);
    expect(raizes).toHaveLength(2);
    expect(raizes[0]).toBeCloseTo(0.1, 5);
    expect(raizes[1]).toBeCloseTo(0.2, 5);
    expect(irr(fluxo)).toBeNull();
  });

  const comK = (k: number) => simulateConsortium(consortiumParams(defaultInput(), { mesContemplacao: k })).custoEfetivo;

  it('k=24: ok, taxa entre 9,0% e 9,7%', () => {
    const ce = comK(24);
    expect(ce.status).toBe('ok');
    expect(ce.taxaAa).toBeGreaterThan(0.09);
    expect(ce.taxaAa).toBeLessThan(0.097);
  });

  it('k=60 e k=150: fluxo misto, sem taxa', () => {
    for (const k of [60, 150]) {
      const ce = comK(k);
      expect(ce.status).toBe('fluxo-misto');
      expect(ce.taxaAa).toBeNull();
      expect(ce.motivo.length).toBeGreaterThan(0);
    }
  });

  it('k=100: sem raiz; k=199: não é custo de crédito', () => {
    expect(comK(100).status).toBe('sem-raiz');
    expect(comK(199).status).not.toBe('ok');
    expect(comK(199).taxaAa).toBeNull();
  });

  it('veredito com k=150 não afirma custo do dinheiro negativo', () => {
    const i = defaultInput();
    i.consorcio.mesContemplacao = 150;
    const v = compare(i).verdict;
    const razao = v.razoes.find((r) => r.titulo === 'Custo do dinheiro');
    expect(razao?.favorece).toBe('neutro');
    expect(razao?.texto).not.toMatch(/-\d+,\d+%/);
  });
});
