import { describe, expect, it } from 'vitest';
import { compare } from '../src/domain/comparison';
import { defaultInput } from '../src/domain/defaults';
import { fmtBRL, fmtBRLCents, fmtMeses, fmtNum, fmtPct, fmtX } from '../src/domain/format';
import { normalizeInput } from '../src/domain/normalize';
import { decidirVencedor, limiarEmpate } from '../src/domain/verdict';
import { simulateConsortium } from '../src/domain/consortium';
import { consortiumParams, simulate } from '../src/domain/simulation';
import { irr, irrAnual } from '../src/domain/rates';
import { buildPayoffPlan } from '../src/domain/payoff';
import { buildHiddenCosts } from '../src/domain/hiddenCosts';
import type { ScenarioInput } from '../src/domain/types';

function com(over: {
  comum?: Partial<ScenarioInput['comum']>;
  financiamento?: Partial<ScenarioInput['financiamento']>;
  consorcio?: Partial<ScenarioInput['consorcio']>;
}): ScenarioInput {
  const d = defaultInput();
  return {
    comum: { ...d.comum, ...over.comum },
    financiamento: { ...d.financiamento, ...over.financiamento },
    consorcio: { ...d.consorcio, ...over.consorcio },
  };
}

interface Cen { co: number; j: number; taxa: number; pc: number; mc: number; pr: number; alu: number; va: number }
const cen = (p: Cen): ScenarioInput =>
  com({
    comum: { custoOportunidadeAa: p.co, aluguelMensal: p.alu, valorizacaoImovelAa: p.va },
    financiamento: { jurosAa: p.j, prazoMeses: p.pr },
    consorcio: { taxaAdmPct: p.taxa, prazoMeses: p.pc, mesContemplacao: p.mc },
  });

describe('format', () => {
  it('trata NaN/Infinity como zero em moeda', () => {
    expect(fmtBRL(NaN)).toBe(fmtBRL(0));
    expect(fmtBRL(Infinity)).toBe(fmtBRL(0));
    expect(fmtBRLCents(NaN)).toBe(fmtBRLCents(0));
    expect(fmtBRLCents(1234.5)).toContain('1.234,50');
  });
  it('formata negativos e percentuais com 1 e 2 casas; null/undefined/NaN viram n/d', () => {
    expect(fmtBRL(-1500)).toContain('1.500');
    expect(fmtBRL(-1500)).toContain('-');
    expect(fmtPct(0.115)).toBe('11,5%');
    expect(fmtPct(0.11534, 2)).toBe('11,53%');
    expect(fmtPct(-0.02)).toBe('-2,0%');
    expect(fmtPct(null)).toBe('n/d');
    expect(fmtPct(undefined)).toBe('n/d');
    expect(fmtPct(NaN)).toBe('n/d');
    expect(fmtPct(Infinity)).toBe('n/d');
  });
  it('fmtNum, fmtX e fmtMeses (menos de 1 ano, ano exato, ano + resto)', () => {
    expect(fmtNum(1234.567)).toBe('1.234,57');
    expect(fmtX(2.34)).toBe('2,3x');
    expect(fmtMeses(7)).toBe('7 meses');
    expect(fmtMeses(24)).toBe('2 anos (24 meses)');
    expect(fmtMeses(30)).toBe('2a 6m (30 meses)');
  });
});

describe('normalizeInput', () => {
  it('protege contra valores inválidos', () => {
    const n = normalizeInput(
      com({
        comum: { valorImovel: 0 },
        financiamento: { prazoMeses: NaN, entradaPct: 5 },
        consorcio: { prazoMeses: NaN, mesContemplacao: NaN, lancePct: NaN, embutidoPct: 0.5 },
      }),
    );
    expect(n.comum.valorImovel).toBe(1);
    expect(n.financiamento.prazoMeses).toBe(1);
    expect(n.financiamento.entradaPct).toBe(0.99);
    expect(n.consorcio.prazoMeses).toBe(1);
    expect(n.consorcio.mesContemplacao).toBe(1);
    expect(n.consorcio.lancePct).toBe(0);
    expect(n.consorcio.embutidoPct).toBe(0);
  });
  it('arredonda prazos fracionários, limita contemplação ao prazo e embutido ao lance', () => {
    const n = normalizeInput(
      com({
        financiamento: { prazoMeses: 359.6, entradaPct: -1 },
        consorcio: { prazoMeses: 100.4, mesContemplacao: 500, lancePct: 2, embutidoPct: 0.5 },
      }),
    );
    expect(n.financiamento.prazoMeses).toBe(360);
    expect(n.financiamento.entradaPct).toBe(0);
    expect(n.consorcio.prazoMeses).toBe(100);
    expect(n.consorcio.mesContemplacao).toBe(100);
    expect(n.consorcio.lancePct).toBe(1);
    expect(n.consorcio.embutidoPct).toBe(0.5);
  });
});

describe('TIR (rates.irr)', () => {
  it('sem fluxo, só positivos ou só negativos: null', () => {
    expect(irr([0, 0])).toBeNull();
    expect(irr([1, 2, 3])).toBeNull();
    expect(irr([-1, -2])).toBeNull();
    expect(irrAnual([1, 2])).toBeNull();
  });
  it('raiz simples: -100 hoje, 110 em 12 meses = 10% a.a.', () => {
    const fluxos = [-100, ...Array(11).fill(0), 110];
    expect(irrAnual(fluxos)).toBeCloseTo(0.1, 6);
  });
  it('raiz negativa (perde dinheiro) é encontrada', () => {
    expect(irr([-100, 50, 40])).toBeLessThan(0);
  });
  it('fluxos extremos: se há raiz, ela zera o VP; nunca lança', () => {
    const casos = [
      [-100, ...Array(60).fill(0), 1],
      [-1e6, ...Array(23).fill(0), 10],
      [-1, 1e12],
      [100, 0, 0, 0, 0, -1e6],
    ];
    for (const c of casos) {
      const r = irr(c);
      if (r !== null) {
        const vp = c.reduce((s, v, t) => s + v / (1 + r) ** t, 0);
        expect(Math.abs(vp)).toBeLessThan(1e-3 * c.reduce((s, v) => s + Math.abs(v), 0));
      }
    }
  });
  it('mais de uma troca de sinal: devolve null ou uma taxa finita', () => {
    for (const c of [[-100, 230, -132], [100, -300, 250, -80]]) {
      const r = irr(c);
      expect(r === null || Number.isFinite(r)).toBe(true);
    }
  });
});

describe('veredito: ramos', () => {
  it('decidirVencedor respeita o limiar de empate técnico de 1% do imóvel', () => {
    const limiar = limiarEmpate(600_000);
    expect(limiar).toBe(6_000);
    expect(decidirVencedor(limiar - 1, 600_000)).toBe('empate');
    expect(decidirVencedor(-(limiar - 1), 600_000)).toBe('empate');
    expect(decidirVencedor(limiar, 600_000)).toBe('consorcio');
    expect(decidirVencedor(-limiar, 600_000)).toBe('financiamento');
  });

  it('financiamento vence com juros baixos e contemplação tardia; razões trazem aluguel pró-financiamento', () => {
    const c = compare(
      com({
        comum: { custoOportunidadeAa: 0.05 },
        financiamento: { jurosAa: 0.07, trAm: 0, prazoMeses: 240 },
        consorcio: { mesContemplacao: 150, taxaAdmPct: 0.25 },
      }),
    );
    expect(c.verdict.vencedor).toBe('financiamento');
    expect(c.verdict.diffPV).toBeLessThan(0);
    expect(c.verdict.resumo).toMatch(/^O financiamento custa/);
    const aluguel = c.verdict.razoes.find((r) => r.titulo === 'Aluguel durante a espera');
    expect(aluguel?.favorece).toBe('financiamento');
  });

  it('empate técnico gera resumo de empate', () => {
    const c = compare(cen({ co: 0.06, j: 0.05, taxa: 0.05, pc: 60, mc: 12, pr: 240, alu: 0, va: 0.062 }));
    expect(c.verdict.vencedor).toBe('empate');
    expect(c.verdict.resumo).toMatch(/^Empate técnico/);
    expect(Math.abs(c.verdict.diffPV)).toBeLessThan(limiarEmpate(600_000));
  });

  it.each([
    ['financiamento', 'consorcio', { co: 0.114, j: 0.05, taxa: 0.19, pc: 120, mc: 100, pr: 360, alu: 0, va: 0.062 }, 'financiamento'],
    ['consorcio', 'financiamento', { co: 0.2, j: 0.05, taxa: 0.1, pc: 200, mc: 1, pr: 240, alu: 0, va: 0.12 }, 'consorcio'],
    ['consorcio', 'empate', { co: 0.06, j: 0.08, taxa: 0.19, pc: 200, mc: 6, pr: 240, alu: 2400, va: 0 }, 'consorcio'],
    ['empate', 'financiamento', { co: 0.2, j: 0.115, taxa: 0.19, pc: 120, mc: 24, pr: 120, alu: 2400, va: 0.12 }, 'neutro'],
  ] as const)('régua econômica (%s) discorda da ingênua (%s): razão extra favorece %s', (venc, ing, params, favorece) => {
    const c = compare(cen(params));
    expect(c.verdict.vencedor).toBe(venc);
    expect(c.verdict.vencedorIngenuo).toBe(ing);
    const r = c.verdict.razoes.find((x) => x.titulo === 'As duas réguas discordam');
    expect(r?.favorece).toBe(favorece);
    expect(r?.texto).toContain('mas ao descontar pelo custo de oportunidade');
  });

  it('quando as réguas concordam não há razão extra', () => {
    const c = compare(com({}));
    expect(c.verdict.vencedor).toBe(c.verdict.vencedorIngenuo);
    expect(c.verdict.razoes.some((r) => r.titulo === 'As duas réguas discordam')).toBe(false);
  });

  it('riscos: juros altos e embutido aparecem quando aplicáveis', () => {
    const c = compare(com({ financiamento: { jurosAa: 0.14 }, consorcio: { lancePct: 0.3, embutidoPct: 0.15, embutidoAbateSaldo: true } }));
    expect(c.verdict.riscos.some((r) => r.startsWith('Juros altos'))).toBe(true);
    expect(c.verdict.riscos.find((r) => r.startsWith('Lance embutido'))).toContain(' abate ');
    const c2 = compare(com({ consorcio: { lancePct: 0.3, embutidoPct: 0.15, embutidoAbateSaldo: false } }));
    expect(c2.verdict.riscos.find((r) => r.startsWith('Lance embutido'))).toContain('NÃO abate');
    const c3 = compare(com({ comum: { custoOportunidadeAa: 0.13 }, financiamento: { jurosAa: 0.08 } }));
    expect(c3.verdict.riscos.some((r) => r.startsWith('Juros altos'))).toBe(true);
  });

  it.each([
    ['sempre-vence', { co: 0.02, j: 0.15, taxa: 0.1, pc: 60, mc: 60, pr: 240, alu: 0, va: 0.12 }, /qualquer mês de contemplação/, /último mês do grupo/],
    ['equilibrio', { co: 0.2, j: 0.115, taxa: 0.19, pc: 120, mc: 100, pr: 360, alu: 2400, va: 0.062 }, /deixa de compensar \(empata ou perde\)/, /chegar ao mês \d+ ou depois/],
    ['nunca-vence', { co: 0.2, j: 0.08, taxa: 0.3, pc: 120, mc: 24, pr: 240, alu: 2400, va: 0.12 }, /contemplação já no mês 1/, /nem com contemplação imediata/],
  ] as const)('ponto de equilíbrio %s: riscos e item oculto dizem o mesmo', (sit, params, reRisco, reOculto) => {
    const c = compare(cen(params));
    const eq = c.verdict.sensibilidade.equilibrio;
    expect(eq.situacao).toBe(sit);
    expect(eq.mes === null).toBe(sit !== 'equilibrio');
    expect(c.verdict.riscos.join(' | ')).toMatch(reRisco);
    if (eq.mes !== null) expect(c.verdict.riscos.join(' | ')).toContain(`mês ${eq.mes}`);
    expect(buildHiddenCosts(c.sim, c.fluxosCon, c.verdict).find((i) => i.id === 'con-sem-data')?.texto).toMatch(reOculto);
  });
});

describe('itens ocultos: ramos', () => {
  it('sem lance/embutido usa referências de 30%; com lance usa o valor informado', () => {
    const sem = compare(com({}));
    const itens = buildHiddenCosts(sem.sim, sem.fluxosCon, sem.verdict);
    expect(itens.find((i) => i.id === 'con-embutido')?.texto).toMatch(/Sem embutido neste cenário.*30,0%/);
    expect(itens.find((i) => i.id === 'con-lance-base')?.texto).toContain('(referência)');

    const c1 = compare(com({ consorcio: { lancePct: 0.2, embutidoPct: 0.1, embutidoAbateSaldo: true } }));
    const itens2 = buildHiddenCosts(c1.sim, c1.fluxosCon, c1.verdict);
    expect(itens2.find((i) => i.id === 'con-embutido')?.texto).toContain('a dívida cai junto');
    expect(itens2.find((i) => i.id === 'con-lance-base')?.texto).not.toContain('(referência)');
    const c2 = compare(com({ consorcio: { lancePct: 0.2, embutidoPct: 0.1, embutidoAbateSaldo: false } }));
    expect(buildHiddenCosts(c2.sim, c2.fluxosCon, c2.verdict).find((i) => i.id === 'con-embutido')?.texto).toContain('continua pagando');
  });

  it('crédito sobra ou falta: texto de complemento muda', () => {
    const falta = compare(com({ consorcio: { valorCarta: 300_000, reajusteCartaAa: 0 }, comum: { valorizacaoImovelAa: 0.1 } }));
    expect(falta.sim.con.contemplacao.complemento).toBeGreaterThan(0);
    expect(buildHiddenCosts(falta.sim, falta.fluxosCon, falta.verdict).find((i) => i.id === 'con-complemento')?.texto).toContain('do próprio bolso');
    const sobra = compare(com({ consorcio: { valorCarta: 900_000 } }));
    expect(buildHiddenCosts(sobra.sim, sobra.fluxosCon, sobra.verdict).find((i) => i.id === 'con-complemento')?.texto).toContain('sobram');
  });

  it('devolução do fundo de reserva muda o texto', () => {
    const a = compare(com({ consorcio: { devolveFundoReserva: true } }));
    expect(buildHiddenCosts(a.sim, a.fluxosCon, a.verdict).find((i) => i.id === 'con-fundo-reserva')?.texto).toContain('é devolvido');
  });
});

describe('plano de quitação: ramos', () => {
  it('com FGTS há plano de FGTS; sem FGTS é null', () => {
    const sem = buildPayoffPlan(compare(com({})).sim);
    expect(sem.financiamento.fgts).toBeNull();
    const fgts = buildPayoffPlan(compare(com({ financiamento: { fgtsSaldo: 30_000, fgtsAporteMensal: 300 } })).sim);
    expect(fgts.financiamento.fgts).not.toBeNull();
    expect(fgts.financiamento.fgts?.mesesReduzidos).toBeGreaterThan(0);
  });
  it('regra de decisão acompanha CET x custo de oportunidade', () => {
    const p = buildPayoffPlan(compare(com({ comum: { custoOportunidadeAa: 0.3 } })).sim);
    expect(p.financiamento.amortizarCompensa).toBe(false);
    const q = buildPayoffPlan(compare(com({ comum: { custoOportunidadeAa: 0.02 } })).sim);
    expect(q.financiamento.amortizarCompensa).toBe(true);
  });
});

describe('ramos defensivos e de borda', () => {
  it('consórcio com prazo 0 (fora do que o normalize deixa passar) lança erro claro', () => {
    const params = consortiumParams(simulate(defaultInput()).input, { prazoMeses: 0 });
    expect(() => simulateConsortium(params)).toThrow('Contemplação não ocorreu dentro do prazo do consórcio');
  });

  it('TIR com raiz fora da grade (-100 hoje, quase nada depois) devolve null; raiz enorme é achada', () => {
    expect(irr([-100, 1e-9])).toBeNull();
    expect(irr([-1e-9, 100])).toBeGreaterThan(1e9);
  });

  it('imóvel minúsculo: CET do financiamento indisponível; razão do CET e item oculto dizem isso; regra de amortização fica null', () => {
    const c = compare(com({ comum: { valorImovel: 10 }, consorcio: { valorCarta: 10 } }));
    expect(c.sim.finCet).toBeNull();
    expect(c.sim.con.custoEfetivo.status).toBe('ok');
    const razao = c.verdict.razoes.find((r) => r.titulo === 'Custo do dinheiro');
    expect(razao?.favorece).toBe('neutro');
    expect(razao?.texto).toContain('CET do financiamento n/d');
    expect(buildHiddenCosts(c.sim, c.fluxosCon, c.verdict).find((i) => i.id === 'fin-cet')?.texto).toBe('Não foi possível calcular o CET.');
    expect(buildPayoffPlan(c.sim).financiamento.amortizarCompensa).toBeNull();
  });

  it('custo do dinheiro: consórcio mais caro, mais barato e praticamente igual ao CET', () => {
    const base = com({ consorcio: { lancePct: 0.3, mesContemplacao: 24 } });
    const caro = compare({ ...base, consorcio: { ...base.consorcio, taxaAdmPct: 0.3 } });
    expect(caro.verdict.razoes[0].favorece).toBe('financiamento');
    expect(caro.verdict.razoes[0].texto).toContain('O crédito mais barato é o financiamento');
    const barato = compare({ ...base, consorcio: { ...base.consorcio, taxaAdmPct: 0.05 } });
    expect(barato.verdict.razoes[0].favorece).toBe('consorcio');
    expect(barato.verdict.razoes[0].texto).toContain('O crédito mais barato é o consórcio');

    // bisseção em taxaAdm até o custo efetivo do consórcio ficar a menos de 0,05 p.p. do CET
    const cet = simulate(base).finCet as number;
    let lo = 0.19;
    let hi = 0.3;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const ce = simulate({ ...base, consorcio: { ...base.consorcio, taxaAdmPct: mid } }).con.custoEfetivo.taxaAa as number;
      if (ce < cet) lo = mid;
      else hi = mid;
    }
    const igual = compare({ ...base, consorcio: { ...base.consorcio, taxaAdmPct: (lo + hi) / 2 } });
    expect(igual.verdict.razoes[0].favorece).toBe('neutro');
    expect(igual.verdict.razoes[0].texto).toContain('Praticamente iguais');
  });
});

describe('ponto de equilíbrio coerente com o veredito (regressão 03/11/2026)', () => {
  // VP não monotônico em k (achado por varredura de 432 cenários): perder no mês 1 não implica perder no mês do usuário.
  const naoMonotono = { co: 0.114, j: 0.08, taxa: 0.3, pc: 120, mc: 24, pr: 360, alu: 0, va: 0 } as const;

  it('quando o consórcio perde no mês 1 mas vence depois, não afirma "nunca vence"', () => {
    const c = compare(cen(naoMonotono));
    const eq = c.verdict.sensibilidade.equilibrio;
    expect(c.verdict.vencedor).toBe('consorcio');
    expect(eq.situacao).toBe('vence-tarde');
    expect(eq.mes).not.toBeNull();
    expect(eq.mes!).toBeGreaterThan(1);
    expect(eq.mes!).toBeLessThanOrEqual(24);
    const riscos = c.verdict.riscos.join(' | ');
    expect(riscos).not.toMatch(/não vence neste cenário/);
    expect(riscos).toContain(`a partir do mês ${eq.mes}`);
    const oculto = buildHiddenCosts(c.sim, c.fluxosCon, c.verdict).find((i) => i.id === 'con-sem-data')?.texto;
    expect(oculto).not.toMatch(/não vence nem com contemplação imediata/);
    expect(oculto).toContain(`mês ${eq.mes}`);
  });

  it('invariante: veredito consórcio nunca convive com situação nunca-vence', () => {
    for (const mc of [1, 24, 60, 100, 119]) {
      for (const co of [0.02, 0.06, 0.114, 0.2]) {
        const c = compare(cen({ ...naoMonotono, mc, co }));
        if (c.verdict.vencedor === 'consorcio') {
          expect(c.verdict.sensibilidade.equilibrio.situacao).not.toBe('nunca-vence');
        }
      }
    }
  });
});
