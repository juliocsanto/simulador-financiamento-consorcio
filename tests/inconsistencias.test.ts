import { describe, expect, it } from 'vitest';
import { compare } from '../src/domain/comparison';
import { defaultInput } from '../src/domain/defaults';
import { buildHiddenCosts } from '../src/domain/hiddenCosts';
import { textoSobraDeCredito } from '../src/domain/consortium';
import { ENTRADA_ALTA_PCT, ENTRADA_MINIMA_MERCADO_PCT } from '../src/domain/verdict';
import type { ScenarioInput } from '../src/domain/types';

const cenario = (ajuste: (d: ScenarioInput) => void): ReturnType<typeof compare> => {
  const d = defaultInput();
  ajuste(d);
  return compare(d);
};

describe('inconsistências encontradas na varredura Playwright (nov/2026)', () => {
  it('sobra de crédito não é contada duas vezes no CET: carta maior que o imóvel não fica "mais barata"', () => {
    const justa = cenario((d) => {
      d.consorcio.valorCarta = 600_000;
    });
    const folgada = cenario((d) => {
      d.consorcio.valorCarta = 900_000;
    });
    expect(folgada.sim.con.contemplacao.sobraCredito).toBeGreaterThan(0);
    // carta maior custa mais em VP; o CET tem de apontar na mesma direção (antes: 4,4% contra 9,3%)
    expect(folgada.consorcio.vp).toBeGreaterThan(justa.consorcio.vp);
    expect(folgada.sim.con.custoEfetivo.taxaAa as number).toBeGreaterThan(justa.sim.con.custoEfetivo.taxaAa as number);
  });

  it('fundo de reserva devolvido continua na tabela por categoria e o total em VP fecha com o resumo', () => {
    const c = cenario((d) => {
      d.consorcio.devolveFundoReserva = true;
    });
    const fr = c.categorias.find((l) => l.key === 'fundoReserva');
    expect(fr).toBeDefined();
    expect(Math.abs(fr!.consorcio.nominal)).toBeLessThan(0.01);
    expect(fr!.consorcio.vp).toBeGreaterThan(0);
    const somaVp = c.categorias.reduce((s, l) => s + l.consorcio.vp, 0);
    expect(somaVp).toBeCloseTo(c.consorcio.vp, 2);
    const somaVpFin = c.categorias.reduce((s, l) => s + l.financiamento.vp, 0);
    expect(somaVpFin).toBeCloseTo(c.financiamento.vp, 2);
  });

  it('item oculto "reduzir a parcela" informa quando termina, sem afirmar que mantém o prazo', () => {
    const c = compare(defaultInput());
    const item = buildHiddenCosts(c.sim, c.fluxosCon, c.verdict).find((i) => i.id === 'fin-prazo-vs-parcela');
    expect(item?.texto).toContain('reduzir a parcela termina em');
    expect(item?.texto).not.toContain('mantém');
  });

  it('embutido que abate o saldo não é chamado de "a rota mais cara" sem ressalva', () => {
    const abate = cenario((d) => {
      d.consorcio.lancePct = 0.3;
      d.consorcio.embutidoPct = 0.3;
      d.consorcio.embutidoAbateSaldo = true;
    });
    const caixa = cenario((d) => {
      d.consorcio.lancePct = 0.3;
    });
    expect(abate.consorcio.vp).toBeCloseTo(caixa.consorcio.vp, 0);
    const r = abate.verdict.riscos.find((x) => x.startsWith('Lance embutido'))!;
    expect(r).toContain('custando o mesmo que um lance em dinheiro');
    expect(r).toContain('confirme no regulamento');
    const naoAbate = cenario((d) => {
      d.consorcio.lancePct = 0.3;
      d.consorcio.embutidoPct = 0.3;
    }).verdict.riscos.find((x) => x.startsWith('Lance embutido'))!;
    expect(naoAbate).toMatch(/NÃO abate.*é a rota mais cara\.$/);
  });

  it.each([
    [0, /dificilmente é aprovada/],
    [ENTRADA_MINIMA_MERCADO_PCT - 0.01, /dificilmente é aprovada/],
    [ENTRADA_ALTA_PCT + 0.01, /compra à vista/],
    [1, /compra à vista/],
  ])('entrada de %s gera alerta de mercado', (entrada, re) => {
    const c = cenario((d) => {
      d.financiamento.entradaPct = entrada;
    });
    expect(c.verdict.riscos.filter((r) => r.startsWith('Entrada de'))).toHaveLength(1);
    expect(c.verdict.riscos.find((r) => r.startsWith('Entrada de'))).toMatch(re);
  });

  it.each([ENTRADA_MINIMA_MERCADO_PCT, 0.5, ENTRADA_ALTA_PCT])('entrada de %s não gera alerta', (entrada) => {
    const c = cenario((d) => {
      d.financiamento.entradaPct = entrada;
    });
    expect(c.verdict.riscos.some((r) => r.startsWith('Entrada de'))).toBe(false);
  });

  it('financiamento em andamento não alerta sobre a entrada (já foi paga)', () => {
    const c = cenario((d) => {
      d.comum.situacaoAtual = 'financiamento-em-andamento';
      d.financiamento.entradaPct = 0;
      d.financiamento.parcelasPagas = 12;
    });
    expect(c.verdict.riscos.some((r) => r.startsWith('Entrada de'))).toBe(false);
  });

  it('sobra de crédito maior que o saldo volta em dinheiro em vez de sumir (Lei 11.795, art. 31)', () => {
    const quaseQuitada = cenario((d) => {
      d.comum.situacaoAtual = 'consorcio-em-andamento';
      d.consorcio.parcelasPagas = 199;
    });
    const cp = quaseQuitada.sim.con.contemplacao;
    expect(cp.sobraCredito).toBeGreaterThan(0);
    expect(cp.sobraEmEspecie).toBeGreaterThan(0);
    expect(cp.sobraEmEspecie).toBeCloseTo(cp.sobraCredito - (cp.saldoAntes - cp.lanceCaixa), 2);
    expect(cp.saldoDepois).toBe(0);
    const linha = quaseQuitada.categorias.find((l) => l.key === 'sobraEmEspecie')!;
    expect(linha.consorcio.nominal).toBeCloseTo(-cp.sobraEmEspecie, 2);
    expect(quaseQuitada.categorias.reduce((s, l) => s + l.consorcio.vp, 0)).toBeCloseTo(quaseQuitada.consorcio.vp, 2);
    // ficar com a cota quase quitada (e receber a sobra) não pode perder de cancelar e financiar
    expect(quaseQuitada.verdict.vencedor).not.toBe('financiamento');
    const txt = buildHiddenCosts(quaseQuitada.sim, quaseQuitada.fluxosCon, quaseQuitada.verdict).map((i) => i.texto).join(' ');
    expect(txt).toContain('voltam em dinheiro');
  });

  it('texto da sobra: só abatimento, abatimento + espécie, só espécie', () => {
    const base = { sobraCredito: 100, sobraEmEspecie: 0 } as Parameters<typeof textoSobraDeCredito>[0];
    expect(textoSobraDeCredito(base)).toMatch(/que abatem o saldo do consórcio$/);
    expect(textoSobraDeCredito({ ...base, sobraEmEspecie: 40 })).toMatch(/abatem o saldo do consórcio e R\$\s?40 voltam em dinheiro/);
    expect(textoSobraDeCredito({ ...base, sobraEmEspecie: 100 })).not.toContain('abatem');
  });

  it('sem sobra, nada volta em espécie e a coluna fica fora da tabela', () => {
    const c = compare(defaultInput());
    expect(c.sim.con.contemplacao.sobraEmEspecie).toBe(0);
    expect(c.categorias.some((l) => l.key === 'sobraEmEspecie')).toBe(false);
  });

  it('desembolso líquido negativo nos 5 primeiros anos vira "entram no bolso", nunca "saem do bolso -R$"', () => {
    const c = cenario((d) => {
      d.comum.situacaoAtual = 'consorcio-em-andamento';
      d.consorcio.parcelasPagas = 150;
      d.consorcio.mesContemplacao = 160;
      d.consorcio.valorCarta = 1_000_000;
    });
    const r = c.verdict.razoes.find((x) => x.titulo.startsWith('Desembolso'))!;
    expect(r.texto).not.toMatch(/-R\$/);
    expect(r.texto).toMatch(/entram no bolso/);
    const padrao = compare(defaultInput()).verdict.razoes.find((x) => x.titulo.startsWith('Desembolso'))!;
    expect(padrao.texto).toMatch(/saem do bolso/);
    expect(padrao.texto).not.toMatch(/-R\$/);
  });
});

describe('fmtCustoLiquido (prosa sem "custa -R$")', () => {
  it('positivo e zero custam; negativo rende líquido', async () => {
    const { fmtCustoLiquido } = await import('../src/domain/format');
    expect(fmtCustoLiquido(1000)).toMatch(/^custa R\$\s?1\.000$/);
    expect(fmtCustoLiquido(0)).toMatch(/^custa R\$\s?0$/);
    expect(fmtCustoLiquido(-748286)).toMatch(/^rende R\$\s?748\.286 líquidos$/);
  });
});

describe('plano de quitação do consórcio não oferece quitar depois do fim real do contrato', () => {
  it('cota quitada pela sobra na contemplação não lista "Ano 3" com saldo zero', async () => {
    const { buildPayoffPlan } = await import('../src/domain/payoff');
    const c = cenario((d) => {
      d.comum.situacaoAtual = 'consorcio-em-andamento';
      d.consorcio.parcelasPagas = 150;
      d.consorcio.mesContemplacao = 160;
      d.consorcio.valorCarta = 1_000_000;
    });
    const fim = c.sim.con.rows[c.sim.con.rows.length - 1].mes;
    expect(fim).toBeLessThan(c.sim.paramsCon.prazoMeses);
    const plano = buildPayoffPlan(c.sim).consorcio;
    for (const q of plano.quitacoes) {
      expect(q.mes).toBeLessThan(fim);
      expect(q.valorQuitacao).toBeGreaterThan(0);
    }
  });
});

describe('financiamento em andamento com mais parcelas pagas do que o contrato real tem', () => {
  const quitadoPelaExtra = (): ReturnType<typeof compare> =>
    cenario((d) => {
      d.comum.situacaoAtual = 'financiamento-em-andamento';
      d.financiamento.parcelasPagas = 200;
      d.financiamento.sistema = 'PRICE';
      d.financiamento.entradaPct = 0.9;
      d.financiamento.jurosAa = 0.08;
      d.financiamento.prazoMeses = 420;
      d.financiamento.amortExtraMensal = 500;
    });

  it('limita as parcelas pagas ao fim real (contrato já quitado: saldo zero) e avisa', () => {
    const c = quitadoPelaExtra();
    const fim = c.sim.fin.rows.length;
    expect(fim).toBeLessThan(200);
    expect(c.sim.parcelasPagasFinanciamento).toBe(fim);
    expect(c.sim.saldoFinanciamentoHoje).toBe(0);
    expect(c.verdict.riscos.join(' ')).toMatch(/termina no mês \d+/);
  });

  it('nenhum texto com NaN e nenhuma duração negativa', () => {
    const c = quitadoPelaExtra();
    const textos = [...c.verdict.riscos, ...c.verdict.razoes.map((r) => r.texto), ...buildHiddenCosts(c.sim, c.fluxosCon, c.verdict).flatMap((x) => Object.values(x).filter((v) => typeof v === 'string'))];
    for (const t of textos) expect(t).not.toMatch(/NaN|Infinity/);
    expect(c.sim.fin.rows.length - c.sim.parcelasPagasFinanciamento).toBeGreaterThanOrEqual(0);
  });
});

describe('régua ingênua com total nominal negativo', () => {
  it('nunca escreve "-R$" na razão "As duas réguas discordam"', () => {
    for (const pagas of [150, 170, 190, 199]) {
      const c = cenario((d) => {
        d.comum.situacaoAtual = 'consorcio-em-andamento';
        d.consorcio.parcelasPagas = pagas;
        d.consorcio.valorCarta = 1_000_000;
      });
      for (const r of c.verdict.razoes) expect(r.texto).not.toMatch(/-\s?R\$/);
    }
  });
});

describe('itens ocultos do consórcio não se contradizem (print do usuário, nov/2026)', () => {
  const ocultos = (c: ReturnType<typeof compare>) => buildHiddenCosts(c.sim, c.fluxosCon, c.verdict);
  const parcelaItem = (c: ReturnType<typeof compare>) => ocultos(c).find((i) => i.id === 'con-parcela-cresce')!;

  const cenariosVarridos: Array<[string, (d: ScenarioInput) => void]> = [
    ['padrão', () => {}],
    ['lance 30% reduzindo a parcela', (d) => { d.consorcio.lancePct = 0.3; }],
    ['lance 58% reduzindo a parcela (print)', (d) => { d.consorcio.lancePct = 0.58; d.consorcio.valorCarta = 1_000_000; d.comum.valorImovel = 750_000; }],
    ['lance 30% reduzindo o prazo', (d) => { d.consorcio.lancePct = 0.3; d.consorcio.modoPosLance = 'prazo'; }],
    ['sem reajuste', (d) => { d.consorcio.reajusteCartaAa = 0; }],
    ['redutor 30%', (d) => { d.consorcio.redutorParcelaPct = 0.3; }],
    ['embutido', (d) => { d.consorcio.lancePct = 0.3; d.consorcio.embutidoPct = 0.2; }],
    ['cota quitada na contemplação', (d) => { d.comum.situacaoAtual = 'consorcio-em-andamento'; d.consorcio.parcelasPagas = 41; d.consorcio.mesContemplacao = 42; d.consorcio.valorCarta = 1_000_000; d.consorcio.lancePct = 0.58; }],
    ['financiamento em andamento', (d) => { d.comum.situacaoAtual = 'financiamento-em-andamento'; d.financiamento.parcelasPagas = 24; }],
    // achado da varredura: sobe com o reajuste, cai na contemplação e termina acima do início
    ['reajuste antes, lance reduzindo a parcela no mês 60', (d) => { d.consorcio.valorCarta = 700_000; d.consorcio.prazoMeses = 200; d.consorcio.mesContemplacao = 60; d.consorcio.lancePct = 0.3; d.consorcio.embutidoPct = 0.25; }],
  ];

  it('queda no meio do grupo não sai com título "cresce" mesmo terminando acima do início', () => {
    const c = cenario((d) => { d.consorcio.valorCarta = 700_000; d.consorcio.prazoMeses = 200; d.consorcio.mesContemplacao = 60; d.consorcio.lancePct = 0.3; d.consorcio.embutidoPct = 0.25; });
    const { titulo, texto } = parcelaItem(c);
    expect(texto).toMatch(/ cai de /);
    expect(titulo).toBe('A parcela sobe e desce ao longo do grupo');
  });

  it.each(cenariosVarridos)('%s: o título da parcela bate com os números', (_nome, ajuste) => {
    const c = cenario(ajuste);
    const futuras = c.sim.con.rows.slice(c.sim.parcelasPagasConsorcio).map((r) => r.parcela);
    const primeira = futuras[0];
    const passos = futuras.slice(1).map((x, i) => x / futuras[i]);
    const subiu = Math.max(...futuras) > primeira * 1.005 || passos.some((x) => x > 1.005);
    const caiu = Math.min(...futuras) < primeira * 0.995 || passos.some((x) => x < 0.995);
    const { titulo, texto, valor } = parcelaItem(c);
    if (/ cai de /.test(texto)) expect(titulo).not.toMatch(/cresce|estável/);
    if (/ sobe de /.test(texto)) expect(titulo).not.toMatch(/ cai |estável/);
    if (/cresce/.test(titulo)) expect(subiu && !caiu).toBe(true);
    if (/ cai /.test(titulo)) expect(caiu && !subiu).toBe(true);
    if (/sobe e desce/.test(titulo)) expect(subiu && caiu).toBe(true);
    if (/estável/.test(titulo)) expect(subiu || caiu).toBe(false);
    expect(texto).not.toMatch(/reajuste anual de 0,0%/);
    expect(texto).not.toMatch(/NaN|Infinity/);
    expect(valor).toBeGreaterThan(0);
  });

  it('lance que reduz a parcela: não diz "cresce" e explica a queda na contemplação', () => {
    const c = cenario((d) => {
      d.consorcio.lancePct = 0.58;
      d.consorcio.valorCarta = 1_000_000;
      d.comum.valorImovel = 750_000;
      d.consorcio.reajusteCartaAa = 0;
    });
    const { titulo, texto } = parcelaItem(c);
    expect(titulo).not.toMatch(/cresce/);
    expect(texto).toMatch(/cai de R\$\s?[\d.]+ para R\$\s?[\d.]+ porque o lance abate o saldo e você escolheu reduzir a parcela/);
  });

  it('sem reajuste: parcela estável, sem atribuir crescimento a um reajuste de 0%', () => {
    const { titulo, texto } = parcelaItem(cenario((d) => { d.consorcio.reajusteCartaAa = 0; }));
    expect(titulo).toBe('A parcela fica estável neste cenário');
    expect(texto).toContain('Sem reajuste da carta');
  });

  it('o salto pelo reajuste anual logo após a contemplação não é atribuído à contemplação', () => {
    expect(parcelaItem(compare(defaultInput())).texto).not.toMatch(/depois da contemplação/);
  });

  it('em andamento: o mês da contemplação é o mesmo (do contrato) em todos os itens', () => {
    const c = cenario((d) => {
      d.comum.situacaoAtual = 'consorcio-em-andamento';
      d.consorcio.parcelasPagas = 41;
      d.consorcio.mesContemplacao = 45;
    });
    const mes = c.sim.con.contemplacao.mes;
    const itens = ocultos(c);
    expect(itens.find((i) => i.id === 'con-sem-data')!.texto).toContain(`no mês ${mes} do grupo (daqui a 4 meses)`);
    expect(itens.find((i) => i.id === 'con-complemento')!.texto).toContain(`(mês ${mes})`);
    for (const t of itens.map((i) => i.texto)) {
      for (const achado of t.matchAll(/contemplação (?:no |\()?mês (\d+)/g)) expect(Number(achado[1])).toBe(mes);
    }
  });

  it('embutido que abate o saldo não tem título "não abate o saldo"', () => {
    const c = cenario((d) => {
      d.consorcio.lancePct = 0.3;
      d.consorcio.embutidoPct = 0.2;
      d.consorcio.embutidoAbateSaldo = true;
    });
    const item = ocultos(c).find((i) => i.id === 'con-embutido')!;
    expect(item.titulo).not.toMatch(/não abate/);
    expect(item.texto).toContain('a dívida cai junto');
  });

  it('tarifa de avaliação com cara de preço do imóvel gera alerta e ressalva; tarifa normal não', async () => {
    const { tarifaImplausivel } = await import('../src/domain/constants');
    expect(tarifaImplausivel(2000, 600_000)).toBe(false);
    expect(tarifaImplausivel(920_000, 750_000)).toBe(true);
    expect(tarifaImplausivel(1000, 0)).toBe(false);
    const absurda = cenario((d) => {
      d.consorcio.tarifaAvaliacaoConsorcio = 920_000;
      d.financiamento.tarifaAvaliacao = 700_000;
    });
    const riscos = absurda.verdict.riscos.filter((r) => r.startsWith('Tarifa de avaliação'));
    expect(riscos).toHaveLength(2);
    expect(riscos[1]).toMatch(/consórcio de R\$\s?920\.000.*parece que o valor do imóvel foi digitado/);
    expect(ocultos(absurda).find((i) => i.id === 'con-exigencias')!.texto).toContain('parece ser o preço do imóvel');
    const normal = compare(defaultInput());
    expect(normal.verdict.riscos.some((r) => r.startsWith('Tarifa de avaliação'))).toBe(false);
    expect(ocultos(normal).find((i) => i.id === 'con-exigencias')!.texto).not.toContain('parece');
  });

  it('desistência: o percentual é do bem, não "do bem pago"', () => {
    const c = cenario((d) => {
      d.comum.situacaoAtual = 'consorcio-em-andamento';
      d.consorcio.parcelasPagas = 41;
      d.consorcio.mesContemplacao = 45;
    });
    const t = ocultos(c).find((i) => i.id === 'con-desistencia')!.texto;
    expect(t).toMatch(/voltaria só o que você pagou ao fundo comum \([\d,]+% do bem\)/);
    expect(t).not.toContain('do bem pago');
  });
});
