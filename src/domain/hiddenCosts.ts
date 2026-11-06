import { AMORT_EXTRA_REFERENCIA, EMBUTIDO_TETO_TIPICO_PCT, LANCE_REFERENCIA_PCT } from './constants';
import { fmtBRL, fmtMeses, fmtPct, fmtX } from './format';
import { compararModosExtra } from './payoff';
import { textoSobraDeCredito } from './consortium';
import { somar, type Fluxos, type Simulation } from './simulation';
import { anualParaMensal, valorPresente } from './rates';
import type { Verdict } from './verdict';

export interface ItemOculto {
  id: string;
  lado: 'financiamento' | 'consorcio';
  titulo: string;
  /** frase com os números do cenário */
  texto: string;
  /** o número principal do item, quando existir (para testes e destaque) */
  valor: number | null;
}

const MES_ANO_1 = 12;
const MES_ANO_5 = 60;

/** Saldo do financiamento `mes` meses a partir de HOJE (financiamento em andamento: depois das parcelas já pagas). */
function saldoNoMes(sim: Simulation, mes: number): { mes: number; saldo: number } {
  const rows = sim.fin.rows.slice(sim.parcelasPagasFinanciamento);
  if (rows.length === 0) return { mes: 0, saldo: 0 };
  const r = rows[Math.min(mes, rows.length) - 1];
  return { mes: r.mes - sim.parcelasPagasFinanciamento, saldo: r.saldoFinal };
}

/** "o saldo caiu X%" ou, quando a TR corrige mais do que a parcela amortiza, "o saldo SUBIU X%". */
function variacaoDoSaldo(meses: number, pctAmortizado: number, saldo: number): string {
  const verbo = pctAmortizado >= 0 ? 'caiu' : 'subiu';
  return `após ${meses} meses o saldo ${verbo} ${fmtPct(Math.abs(pctAmortizado))} (${fmtBRL(saldo)})`;
}

function itensFinanciamento(sim: Simulation): ItemOculto[] {
  const { fin, input } = sim;
  const emAndamento = sim.situacao === 'financiamento-em-andamento';
  // financiamento em andamento: tudo a partir do saldo de hoje; o já pago não é contado de novo
  const principal = sim.paramsFinHoje.principal;
  const paramsFin = sim.paramsFinHoje;
  const totais = sim.finTotals;
  const mesesRestantes = fin.rows.length - sim.parcelasPagasFinanciamento;
  if (emAndamento && (mesesRestantes <= 0 || principal <= 0)) {
    // contrato já quitado com os parâmetros informados: não há saldo, juros nem seguro daqui para frente
    return [
      {
        id: 'fin-quitado',
        lado: 'financiamento',
        titulo: 'Financiamento já quitado',
        texto: `Com os parâmetros informados o financiamento terminou no mês ${fin.rows.length}: não há saldo devedor, juros nem seguros daqui para frente. Confira o prazo e o saldo no extrato do banco.`,
        valor: 0,
      },
    ];
  }
  const f = input.financiamento;
  const co = input.comum.custoOportunidadeAa;
  const a12 = saldoNoMes(sim, MES_ANO_1);
  const a60 = saldoNoMes(sim, MES_ANO_5);
  const pct12 = 1 - a12.saldo / principal;
  const pct60 = 1 - a60.saldo / principal;
  const seguros = totais.mip + totais.dfi + totais.tarifa;
  const cetPp = sim.finCet === null ? null : (sim.finCet - f.jurosAa) * 100;
  const ini = sim.custosIniciais;
  const foraDoFinanciamento = ini.itbiRegistro + ini.avaliacao + ini.cadastro;
  const extraRef = f.amortExtraMensal > 0 ? f.amortExtraMensal : AMORT_EXTRA_REFERENCIA;
  const modos = compararModosExtra(paramsFin, extraRef, co);
  const melhorModo = modos.vpPrazo <= modos.vpParcela ? 'reduzir o prazo' : 'reduzir a parcela';

  const itens: ItemOculto[] = [
    {
      id: 'fin-saldo-nao-cai',
      lado: 'financiamento',
      titulo: 'O saldo devedor demora a cair',
      texto:
        `No ${f.sistema}, partindo de ${fmtBRL(principal)}${emAndamento ? ' (saldo devedor de hoje)' : ''}, ${variacaoDoSaldo(a12.mes, pct12, a12.saldo)} e ` +
        `${variacaoDoSaldo(a60.mes, pct60, a60.saldo)}. ` +
        (pct12 < 0 || pct60 < 0
          ? 'Você paga em dia e ainda deve mais do que pegou: a TR corrige o saldo todo mês por mais do que a parcela amortiza, porque no começo a parcela é quase só juros.'
          : 'Na PRICE o saldo cai ainda mais devagar no início, porque a parcela é quase só juros.'),
      valor: pct12,
    },
    {
      id: 'fin-tr',
      lado: 'financiamento',
      titulo: 'A TR corrige o saldo todo mês',
      texto: `Com TR de ${fmtPct(f.trAm, 2)} ao mês, ${fmtBRL(totais.correcao)} são somados ao saldo devedor ${emAndamento ? 'daqui para frente' : 'ao longo do contrato'}, além dos juros.`,
      valor: totais.correcao,
    },
    {
      id: 'fin-juros-total',
      lado: 'financiamento',
      titulo: 'Juros totais do contrato',
      texto: `Em ${fmtMeses(mesesRestantes)} você paga ${fmtBRL(totais.juros)} de juros sobre ${fmtBRL(principal)} ${emAndamento ? 'de saldo devedor' : 'financiados'}: ${fmtX(totais.juros / principal)} o valor ${emAndamento ? 'que falta pagar' : 'emprestado'} (total pago ao banco: ${fmtBRL(totais.desembolso)}).`,
      valor: totais.juros / principal,
    },
    {
      id: 'fin-seguros',
      lado: 'financiamento',
      titulo: 'Seguros e tarifa mensal',
      texto: `MIP, DFI e tarifa de administração somam ${fmtBRL(seguros)} no contrato. A taxa do MIP sobe com a idade (cobrada por faixa etária), então o valor real tende a ser maior que o simulado.`,
      valor: seguros,
    },
    {
      id: 'fin-cet',
      lado: 'financiamento',
      titulo: 'O CET é maior que a taxa anunciada',
      texto:
        cetPp === null
          ? 'Não foi possível calcular o CET.'
          : `Taxa anunciada ${fmtPct(f.jurosAa)} a.a. contra CET ${fmtPct(sim.finCet)} a.a.: ${cetPp.toFixed(2).replace('.', ',')} p.p. a mais por causa de seguros, tarifas e TR.`,
      valor: cetPp,
    },
    {
      id: 'fin-custos-entrada',
      lado: 'financiamento',
      titulo: 'Custos de entrada fora do financiamento',
      texto: `ITBI, registro, avaliação e cadastro somam ${fmtBRL(foraDoFinanciamento)} (${fmtPct(foraDoFinanciamento / input.comum.valorImovel)} do imóvel), pagos à vista além da entrada de ${fmtBRL(ini.entrada)}.`,
      valor: foraDoFinanciamento,
    },
    {
      id: 'fin-prazo-vs-parcela',
      lado: 'financiamento',
      titulo: 'Reduzir prazo ou reduzir parcela',
      texto: `Com ${fmtBRL(extraRef)} extras por mês: reduzir o prazo leva a ${fmtMeses(modos.mesesPrazo)} e VP de ${fmtBRL(modos.vpPrazo)}; reduzir a parcela termina em ${fmtMeses(modos.mesesParcela)} e VP de ${fmtBRL(modos.vpParcela)}. Neste cenário, ${melhorModo} sai mais barato.`,
      valor: modos.vpParcela - modos.vpPrazo,
    },
    {
      id: 'fin-portabilidade',
      lado: 'financiamento',
      titulo: 'Portabilidade e seguradora são direitos seus',
      texto: 'Você pode levar o financiamento para outro banco com taxa menor (portabilidade) e escolher a seguradora do MIP/DFI. O banco não pode obrigar uma seguradora específica.',
      valor: null,
    },
  ];
  // financiamento em andamento: entrada, ITBI, avaliação e cadastro já foram pagos (custo afundado)
  return itens.filter((item) => !(emAndamento && item.id === 'fin-custos-entrada'));
}

function itensConsorcio(sim: Simulation, fluxosCon: Fluxos, verdict: Verdict): ItemOculto[] {
  const { con, input } = sim;
  const c = input.consorcio;
  const co = input.comum.custoOportunidadeAa;
  const taxa = anualParaMensal(co);
  const m = sim.parcelasPagasConsorcio;
  const emAndamentoFin = sim.situacao === 'financiamento-em-andamento';
  const primeira = con.rows[m];
  const ultima = con.rows[con.rows.length - 1];
  const fator = ultima.parcela / primeira.parcela;
  const cp = con.contemplacao;
  const aluguelNominal = somar(fluxosCon.porCategoria.aluguel);
  const aluguelVP = valorPresente(fluxosCon.porCategoria.aluguel, taxa);
  const eq = verdict.sensibilidade.equilibrio;
  const textoEq =
    eq.situacao === 'equilibrio' && eq.mes !== null
      ? `Se a contemplação chegar ao mês ${eq.mes} ou depois, o consórcio deixa de vencer (empata ou perde).`
      : eq.situacao === 'vence-tarde' && eq.mes !== null
        ? `Neste cenário o consórcio perde com contemplação cedo e só passa a vencer a partir do mês ${eq.mes}.`
      : eq.situacao === 'sempre-vence'
        ? 'Neste cenário o consórcio vence mesmo com contemplação no último mês do grupo.'
        : 'Neste cenário o consórcio não vence nem com contemplação imediata.';
  const lanceRef = c.lancePct > 0 ? c.lancePct : LANCE_REFERENCIA_PCT;
  const difBase = lanceRef * (cp.base - cp.creditoCorrigido);
  const embRef = c.embutidoPct > 0 ? c.embutidoPct : EMBUTIDO_TETO_TIPICO_PCT;
  const embutidoValor = c.embutidoPct > 0 ? cp.embutido : embRef * cp.base;
  const ateContemplacao = con.rows.filter((r) => r.mes > m && r.mes <= cp.mes);
  const fundoComumPago = ateContemplacao.reduce((s, r) => s + r.fundoComum, 0);
  const totalPagoAteAgora = ateContemplacao.reduce((s, r) => s + r.parcela, 0);

  return [
    {
      id: 'con-parcela-cresce',
      lado: 'consorcio',
      titulo: 'A parcela cresce com o reajuste',
      texto: `A parcela começa em ${fmtBRL(primeira.parcela)} e termina em ${fmtBRL(ultima.parcela)}: ${fmtX(fator)} a inicial, porque o reajuste anual de ${fmtPct(c.reajusteCartaAa)} incide sobre o saldo devedor.`,
      valor: fator,
    },
    {
      id: 'con-adm-integral',
      lado: 'consorcio',
      titulo: 'Taxa de administração paga integralmente',
      texto: `Você paga${m > 0 ? ' daqui para frente' : ''} ${fmtBRL(con.totals.adm)} de taxa de administração. Ela não é descontada se você quitar antes: antecipar economiza só os reajustes futuros.`,
      valor: con.totals.adm,
    },
    {
      id: 'con-fundo-reserva',
      lado: 'consorcio',
      titulo: 'Fundo de reserva só volta no fim do grupo',
      texto: `Você paga${m > 0 ? ' daqui para frente' : ''} ${fmtBRL(con.totals.fundoReserva)} de fundo de reserva; ${c.devolveFundoReserva ? 'neste cenário ele é devolvido no encerramento (e só se sobrar)' : 'neste cenário conservador ele não é devolvido'}, e nunca antes do fim do grupo.`,
      valor: con.totals.fundoReserva,
    },
    {
      id: 'con-sem-data',
      lado: 'consorcio',
      titulo: 'Contemplação não tem data',
      texto: emAndamentoFin
        ? `Você já mora no imóvel, então não há aluguel. Até a contemplação (mês ${cp.mes}) você paga o financiamento e o consórcio ao mesmo tempo. ${textoEq}`
        : `Até a contemplação no mês ${cp.mes - m}${m > 0 ? ' (contando a partir de hoje)' : ''} você paga aluguel: ${fmtBRL(aluguelNominal)} nominais (${fmtBRL(aluguelVP)} em valor presente). ${textoEq}`,
      valor: aluguelVP,
    },
    {
      id: 'con-embutido',
      lado: 'consorcio',
      titulo: 'Lance embutido não abate o saldo',
      texto:
        c.embutidoPct > 0
          ? `Seu embutido tira ${fmtBRL(cp.embutido)} do crédito e, pela regra configurada, ${c.embutidoAbateSaldo ? 'abate' : 'não abate'} o saldo devedor: ${c.embutidoAbateSaldo ? 'a dívida cai junto' : `você continua pagando ${fmtBRL(cp.embutido)} de um crédito que não recebeu`}.`
          : `Sem embutido neste cenário. Com um embutido de ${fmtPct(embRef)} da base (teto típico), você perderia ${fmtBRL(embutidoValor)} de crédito e continuaria pagando por ele.`,
      valor: embutidoValor,
    },
    {
      id: 'con-complemento',
      lado: 'consorcio',
      titulo: 'O crédito pode não comprar o imóvel',
      texto: emAndamentoFin
        ? `Na contemplação (mês ${cp.mes}) o saldo devedor do financiamento é ${fmtBRL(cp.precoImovel)} e o crédito disponível é ${fmtBRL(cp.creditoDisponivel)}: ${cp.complemento > 0 ? `você completa ${fmtBRL(cp.complemento)} do próprio bolso para quitar` : textoSobraDeCredito(cp)}. A carta é reajustada ${fmtPct(c.reajusteCartaAa)} a.a.`
        : `Na contemplação (mês ${cp.mes}) o imóvel custa ${fmtBRL(cp.precoImovel)} e o crédito disponível é ${fmtBRL(cp.creditoDisponivel)}: ${cp.complemento > 0 ? `você completa ${fmtBRL(cp.complemento)} do próprio bolso` : textoSobraDeCredito(cp)}. O imóvel valoriza ${fmtPct(input.comum.valorizacaoImovelAa)} a.a. e a carta é reajustada ${fmtPct(c.reajusteCartaAa)} a.a.`,
      valor: cp.complemento,
    },
    {
      id: 'con-lance-base',
      lado: 'consorcio',
      titulo: 'O lance incide sobre a base, não sobre a carta',
      texto: `Base = crédito + taxa de adm + fundo de reserva = ${fmtBRL(cp.base)} (carta corrigida: ${fmtBRL(cp.creditoCorrigido)}). Um lance de ${fmtPct(lanceRef)}${c.lancePct > 0 ? '' : ' (referência)'} custa ${fmtBRL(difBase)} a mais do que se incidisse sobre a carta.`,
      valor: difBase,
    },
    {
      id: 'con-desistencia',
      lado: 'consorcio',
      titulo: 'Desistência devolve só o fundo comum, no fim do grupo',
      texto: sim.restituicao
        ? `Se desistisse hoje, só ${fmtPct(sim.restituicao.pctAmortizado)} do bem pago ao fundo comum voltaria, menos multa de ${fmtPct(sim.restituicao.multaPct)}: ${fmtBRL(sim.restituicao.valor)}, recebidos no mês ${sim.restituicao.t} a partir de hoje (STJ Tema 312). Risco de liquidez.`
        : `Se desistisse na contemplação (mês ${cp.mes}), dos ${fmtBRL(totalPagoAteAgora)} pagos em parcelas só o fundo comum (${fmtBRL(fundoComumPago)}) voltaria, ao término do grupo (STJ Tema 312). Risco de liquidez.`,
      valor: sim.restituicao ? sim.restituicao.valor : fundoComumPago,
    },
    {
      id: 'con-exigencias',
      lado: 'consorcio',
      titulo: 'Exigências na contemplação',
      texto: `Ao ser contemplado você precisa de garantia (o próprio imóvel), análise de renda e avaliação do bem. A avaliação custa ${fmtBRL(c.tarifaAvaliacaoConsorcio)} aqui e a análise pode recusar o imóvel ou o crédito.`,
      valor: c.tarifaAvaliacaoConsorcio,
    },
    {
      id: 'con-golpe',
      lado: 'consorcio',
      titulo: 'Cuidado com a "carta contemplada"',
      texto: 'O Banco Central não autoriza contemplação fora de sorteio ou lance. Quem vende "carta contemplada" com ágio pode estar aplicando golpe ou repassando risco de cota. Confira a administradora no site do BC.',
      valor: null,
    },
  ];
}

export function buildHiddenCosts(sim: Simulation, fluxosCon: Fluxos, verdict: Verdict): ItemOculto[] {
  return [...itensFinanciamento(sim), ...itensConsorcio(sim, fluxosCon, verdict)];
}
