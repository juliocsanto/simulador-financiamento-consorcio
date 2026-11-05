import {
  ALERTA_JUROS_ALTOS_AA,
  EMPATE_TECNICO_PCT_IMOVEL,
  JANELA_FRONT_LOADING_MESES,
  SENSIBILIDADE_CO_PP,
} from './constants';
import { simulateConsortium } from './consortium';
import { fmtBRL, fmtMeses, fmtPct } from './format';
import { anualParaMensal, valorPresente } from './rates';
import {
  serieTotalConsorcio,
  serieTotalFinanciamento,
  somar,
  type Fluxos,
  type OpcaoResumo,
  type Simulation,
} from './simulation';

export type Vencedor = 'financiamento' | 'consorcio' | 'empate';

export interface Razao {
  titulo: string;
  texto: string;
  favorece: 'financiamento' | 'consorcio' | 'neutro';
}

export interface PontoEquilibrio {
  situacao: 'sempre-vence' | 'equilibrio' | 'nunca-vence' | 'vence-tarde';
  /**
   * 'equilibrio': primeiro mês de contemplação em que o consórcio deixa de vencer.
   * 'vence-tarde': perde no mês 1 e só vence a partir deste mês (VP não monotônico em k).
   */
  mes: number | null;
}

export interface CenarioSensibilidade {
  custoOportunidadeAa: number;
  vencedor: Vencedor;
  diffPV: number;
}

export interface Sensibilidade {
  equilibrio: PontoEquilibrio;
  coMais: CenarioSensibilidade;
  coMenos: CenarioSensibilidade;
}

export interface Verdict {
  vencedor: Vencedor;
  /** VP do financiamento menos VP do consórcio. Positivo: o consórcio é mais barato. */
  diffPV: number;
  diffPVPctImovel: number;
  vencedorIngenuo: Vencedor;
  resumo: string;
  razoes: Razao[];
  riscos: string[];
  sensibilidade: Sensibilidade;
}

export const limiarEmpate = (valorImovel: number): number => EMPATE_TECNICO_PCT_IMOVEL * valorImovel;

export function decidirVencedor(diff: number, valorImovel: number): Vencedor {
  if (Math.abs(diff) < limiarEmpate(valorImovel)) return 'empate';
  return diff > 0 ? 'consorcio' : 'financiamento';
}

const nomeOpcao = (v: Vencedor): string =>
  v === 'financiamento' ? 'o financiamento' : v === 'consorcio' ? 'o consórcio' : 'nenhum dos dois (empate técnico)';

function vpDe(serie: readonly number[], coAa: number): number {
  return valorPresente(serie, anualParaMensal(coAa));
}

function calcularEquilibrio(sim: Simulation, vpFin: number): PontoEquilibrio {
  const limiar = limiarEmpate(sim.input.comum.valorImovel);
  const co = sim.input.comum.custoOportunidadeAa;
  const prazo = sim.input.consorcio.prazoMeses;
  // Cota em andamento: a contemplação só pode ocorrer depois das parcelas já pagas.
  const primeiro = sim.parcelasPagasConsorcio + 1;
  const venceEm = (k: number): boolean => {
    // mesma função de fluxos da comparação principal: a varredura nunca contradiz o veredito
    const con = simulateConsortium({ ...sim.paramsCon, mesContemplacao: k, ignorarCustoEfetivo: true });
    return vpFin - vpDe(serieTotalConsorcio(sim, con), co) > limiar;
  };
  for (let k = primeiro; k <= prazo; k++) {
    if (venceEm(k)) continue;
    if (k > primeiro) return { situacao: 'equilibrio', mes: k };
    // Perde no primeiro mês possível. O VP não é monotônico em k, então "nunca vence" só vale se nenhum k vencer.
    for (let j = primeiro + 1; j <= prazo; j++) {
      if (venceEm(j)) return { situacao: 'vence-tarde', mes: j };
    }
    return { situacao: 'nunca-vence', mes: null };
  }
  return { situacao: 'sempre-vence', mes: null };
}

function cenarioCo(sim: Simulation, coAa: number): CenarioSensibilidade {
  const diff = vpDe(serieTotalFinanciamento(sim), coAa) - vpDe(serieTotalConsorcio(sim), coAa);
  return { custoOportunidadeAa: coAa, vencedor: decidirVencedor(diff, sim.input.comum.valorImovel), diffPV: diff };
}

function razaoCet(sim: Simulation): Razao {
  const co = sim.input.comum.custoOportunidadeAa;
  const cet = sim.finCet;
  const ce = sim.con.custoEfetivo;
  if (ce.status !== 'ok' || ce.taxaAa === null) {
    return {
      titulo: 'Custo do dinheiro',
      texto: `CET do financiamento ${fmtPct(cet)} a.a.; o custo efetivo do consórcio não é comparável. ${ce.motivo} O veredito se apoia no valor presente (seu dinheiro rende ${fmtPct(co)} a.a.).`,
      favorece: 'neutro',
    };
  }
  const efetivo = ce.taxaAa;
  const base = `CET do financiamento ${fmtPct(cet)} a.a. vs custo efetivo do consórcio ${fmtPct(efetivo)} a.a. (seu dinheiro rende ${fmtPct(co)} a.a.).`;
  if (cet === null) return { titulo: 'Custo do dinheiro', texto: base, favorece: 'neutro' };
  const dif = (cet - efetivo) * 100;
  if (Math.abs(dif) < 0.05) return { titulo: 'Custo do dinheiro', texto: `${base} Praticamente iguais.`, favorece: 'neutro' };
  const favorece = cet > efetivo ? 'consorcio' : 'financiamento';
  return {
    titulo: 'Custo do dinheiro',
    texto: `${base} O crédito mais barato é o ${favorece === 'consorcio' ? 'consórcio' : 'financiamento'}, por ${Math.abs(dif).toFixed(1).replace('.', ',')} p.p.`,
    favorece,
  };
}

/** Financiamento em andamento: até a contemplação o usuário paga o financiamento E o consórcio. */
function razaoFinanciamentoEmParalelo(sim: Simulation): Razao {
  const pagas = sim.parcelasPagasFinanciamento;
  const espera = sim.fin.rows.slice(pagas, pagas + sim.con.contemplacao.mes);
  const taxa = anualParaMensal(sim.input.comum.custoOportunidadeAa);
  const nominal = espera.reduce((s, r) => s + r.desembolso, 0);
  const vp = espera.reduce((s, r, i) => s + r.desembolso / (1 + taxa) ** (i + 1), 0);
  return {
    titulo: 'Financiamento pago em paralelo',
    texto: `Se aderir ao consórcio você continua pagando o financiamento até a contemplação (mês ${sim.con.contemplacao.mes}): ${fmtBRL(nominal)} nominais, ${fmtBRL(vp)} em valor presente, além das parcelas do consórcio. Você já mora no imóvel: não há aluguel nas duas opções.`,
    favorece: 'financiamento',
  };
}

/** Em contrato em andamento: o já pago é igual nas duas escolhas e fica fora da conta. */
function razaoCustoAfundado(sim: Simulation): Razao | null {
  if (sim.situacao === 'nova-compra' || sim.parcelasPagas === 0) return null;
  const ehConsorcio = sim.situacao === 'consorcio-em-andamento';
  const valor = ehConsorcio ? sim.jaPago.consorcio : sim.jaPago.financiamento;
  return {
    titulo: 'Já pago (custo afundado)',
    texto: `Você já pagou ${fmtBRL(valor)} em ${sim.parcelasPagas} parcelas do ${ehConsorcio ? 'consórcio' : 'financiamento'}. Esse valor não entra na comparação porque é igual nas duas escolhas: a decisão vale só para o que ainda está por vir.`,
    favorece: 'neutro',
  };
}

/** Redutor de parcela: a parcela de antes da contemplação é menor e sobe depois. */
function razaoRedutor(sim: Simulation): Razao | null {
  const r = sim.input.consorcio.redutorParcelaPct;
  if (r <= 0) return null;
  const k = sim.con.contemplacao.mes;
  const antes = sim.con.rows[Math.min(sim.parcelasPagasConsorcio, sim.con.rows.length - 1)];
  const depois = sim.con.rows[k] as (typeof sim.con.rows)[number] | undefined;
  const textoDepois = depois
    ? `Depois da contemplação ela passa a ${fmtBRL(depois.parcela)}`
    : 'A contemplação ocorre na última parcela, que quita todo o saldo';
  return {
    titulo: 'Redutor de parcela',
    texto: `Com redutor de ${fmtPct(r)}, a parcela antes da contemplação é ${fmtBRL(antes.parcela)}. ${textoDepois}: a diferença que você não pagou ficou no saldo devedor e continua sendo reajustada.`,
    favorece: 'neutro',
  };
}

function razoes(
  sim: Simulation,
  fluxosFin: Fluxos,
  fluxosCon: Fluxos,
  resFin: OpcaoResumo,
  resCon: OpcaoResumo,
  vencedor: Vencedor,
  vencedorIngenuo: Vencedor,
): Razao[] {
  const co = sim.input.comum.custoOportunidadeAa;
  const lista: Razao[] = [razaoCet(sim)];

  if (sim.situacao === 'financiamento-em-andamento') {
    lista.push(razaoFinanciamentoEmParalelo(sim));
  } else {
    const aluguelNominal = somar(fluxosCon.porCategoria.aluguel);
    const aluguelVP = vpDe(fluxosCon.porCategoria.aluguel, co);
    lista.push({
      titulo: 'Aluguel durante a espera',
      texto: `No consórcio você paga aluguel até o mês ${sim.con.contemplacao.mes - sim.parcelasPagasConsorcio}${sim.parcelasPagasConsorcio > 0 ? ' (contando a partir de hoje)' : ''}: ${fmtBRL(aluguelNominal)} nominais, ${fmtBRL(aluguelVP)} em valor presente. No financiamento você já mora no imóvel.`,
      favorece: aluguelVP > 0 ? 'financiamento' : 'neutro',
    });
  }

  const admTotal = sim.con.totals.adm;
  const daquiCon = sim.situacao === 'consorcio-em-andamento' ? ' daqui para frente' : '';
  const daquiFin = sim.situacao === 'financiamento-em-andamento' ? ' daqui para frente' : '';
  lista.push({
    titulo: 'Taxa de administração',
    texto: `O consórcio cobra${daquiCon} ${fmtBRL(admTotal)} de taxa de administração (${fmtPct(sim.input.consorcio.taxaAdmPct)} da carta, corrigidos pelo reajuste), paga mesmo se você quitar antes.`,
    favorece: 'financiamento',
  });

  const jurosTotal = sim.finTotals.juros;
  lista.push({
    titulo: 'Juros do financiamento',
    texto: `O financiamento paga${daquiFin} ${fmtBRL(jurosTotal)} de juros (mais ${fmtBRL(sim.finTotals.correcao)} de correção pela TR) em ${fmtMeses(sim.fin.rows.length - sim.parcelasPagasFinanciamento)}.`,
    favorece: 'consorcio',
  });

  const janela = JANELA_FRONT_LOADING_MESES;
  const frontFin = somar(fluxosFin.total.slice(0, janela + 1));
  const frontCon = somar(fluxosCon.total.slice(0, janela + 1));
  lista.push({
    titulo: 'Desembolso nos primeiros 5 anos',
    texto: `Nos primeiros ${janela} meses saem do bolso ${fmtBRL(frontFin)} no financiamento e ${fmtBRL(frontCon)} no consórcio. Dinheiro desembolsado cedo deixa de render ${fmtPct(co)} a.a.`,
    favorece: frontFin > frontCon ? 'consorcio' : frontFin < frontCon ? 'financiamento' : 'neutro',
  });

  if (vencedor !== vencedorIngenuo) {
    lista.push({
      titulo: 'As duas réguas discordam',
      texto: `Pela soma nominal (régua ingênua) ${nomeOpcao(vencedorIngenuo)} parece melhor (${fmtBRL(resFin.totalNominal)} contra ${fmtBRL(resCon.totalNominal)}), mas ao descontar pelo custo de oportunidade ${nomeOpcao(vencedor)} vence: o tempo do dinheiro muda a conta.`,
      favorece: vencedor === 'empate' ? 'neutro' : vencedor,
    });
  }
  const afundado = razaoCustoAfundado(sim);
  if (afundado) lista.push(afundado);
  const redutor = razaoRedutor(sim);
  if (redutor) lista.push(redutor);
  return lista;
}

function riscosDeContratoEmAndamento(sim: Simulation): string[] {
  const rest = sim.restituicao;
  if (rest) {
    return [
      `Financiar significa cancelar a cota: a restituição estimada é ${fmtBRL(rest.valor)} (${fmtPct(rest.pctAmortizado)} do bem já pago ao fundo comum, menos multa de ${fmtPct(rest.multaPct)}), recebida só no mês ${rest.t} a partir de hoje, cerca de 60 dias depois da última assembleia do grupo (STJ Tema 312). Taxa de administração e fundo de reserva já pagos não voltam. Vender ou transferir a cota é uma alternativa que esta simulação não modela.`,
    ];
  }
  if (sim.situacao === 'financiamento-em-andamento') {
    const cp = sim.con.contemplacao;
    const cobertura =
      cp.complemento > 0
        ? `O crédito disponível (${fmtBRL(cp.creditoDisponivel)}) NÃO cobre o saldo devedor do financiamento (${fmtBRL(cp.precoImovel)}): faltam ${fmtBRL(cp.complemento)} do próprio bolso.`
        : `O crédito disponível (${fmtBRL(cp.creditoDisponivel)}) cobre o saldo devedor do financiamento (${fmtBRL(cp.precoImovel)}) e sobram ${fmtBRL(cp.sobraCredito)}, que abatem o saldo do consórcio.`;
    return [
      `Quitar o financiamento com o consórcio, na contemplação (mês ${cp.mes}): ${cobertura} A administradora precisa aceitar a quitação de financiamento próprio e exigirá garantia.`,
    ];
  }
  return [];
}

function riscos(sim: Simulation, sens: Sensibilidade): string[] {
  const out: string[] = [];
  const eq = sens.equilibrio;
  if (eq.situacao === 'equilibrio' && eq.mes !== null) {
    out.push(
      `Mês de equilíbrio: se a contemplação demorar até o mês ${eq.mes} ou mais, o consórcio deixa de compensar. Você assumiu o mês ${sim.con.contemplacao.mes}.`,
    );
  } else if (eq.situacao === 'vence-tarde' && eq.mes !== null) {
    out.push(
      `Com contemplação cedo o consórcio não vence; ele só passa a vencer a partir do mês ${eq.mes}. Você assumiu o mês ${sim.con.contemplacao.mes}.`,
    );
  } else if (eq.situacao === 'sempre-vence') {
    out.push('O consórcio vence em qualquer mês de contemplação possível neste cenário (o prazo total do grupo é o limite).');
  } else {
    const primeiro = sim.parcelasPagasConsorcio + 1;
    out.push(`Mesmo com contemplação já no mês ${primeiro}${primeiro > 1 ? ' do contrato (o primeiro possível)' : ''} o consórcio não vence neste cenário.`);
  }
  out.push(...riscosDeContratoEmAndamento(sim));
  const pp = SENSIBILIDADE_CO_PP * 100;
  out.push(
    `Com custo de oportunidade ${fmtPct(sens.coMais.custoOportunidadeAa)} (+${pp} p.p.) o resultado é: ${nomeOpcao(sens.coMais.vencedor)}; com ${fmtPct(sens.coMenos.custoOportunidadeAa)} (-${pp} p.p.): ${nomeOpcao(sens.coMenos.vencedor)}.`,
  );
  if (sim.input.financiamento.jurosAa >= ALERTA_JUROS_ALTOS_AA || sim.input.comum.custoOportunidadeAa >= ALERTA_JUROS_ALTOS_AA) {
    out.push(
      `Juros altos (financiamento ${fmtPct(sim.input.financiamento.jurosAa)}, custo de oportunidade ${fmtPct(sim.input.comum.custoOportunidadeAa)}): o resultado fica muito sensível ao tempo e à taxa.`,
    );
  }
  if (sim.input.consorcio.embutidoPct > 0) {
    out.push(
      `Lance embutido (${fmtPct(sim.input.consorcio.embutidoPct)} da base) reduz o crédito em ${fmtBRL(sim.con.contemplacao.embutido)} e, pela regra configurada, ${sim.input.consorcio.embutidoAbateSaldo ? 'abate' : 'NÃO abate'} o saldo devedor: é a rota mais cara.`,
    );
  }
  out.push('Consórcio não garante a data de contemplação: sorteio e lance dependem do grupo e dos concorrentes.');
  return out;
}

function montarResumo(vencedor: Vencedor, diff: number, valorImovel: number): string {
  const abs = fmtBRL(Math.abs(diff));
  const pct = fmtPct(Math.abs(diff) / valorImovel);
  if (vencedor === 'empate') {
    return `Empate técnico: a diferença em valor presente é de apenas ${abs} (${pct} do imóvel), dentro da margem de ${fmtPct(EMPATE_TECNICO_PCT_IMOVEL)}.`;
  }
  return `${vencedor === 'consorcio' ? 'O consórcio' : 'O financiamento'} custa ${abs} a menos em valor presente (${pct} do valor do imóvel).`;
}

export function buildVerdict(
  sim: Simulation,
  fluxosFin: Fluxos,
  fluxosCon: Fluxos,
  resFin: OpcaoResumo,
  resCon: OpcaoResumo,
): Verdict {
  const valorImovel = sim.input.comum.valorImovel;
  const co = sim.input.comum.custoOportunidadeAa;
  const diffPV = resFin.vp - resCon.vp;
  const vencedor = decidirVencedor(diffPV, valorImovel);
  const vencedorIngenuo = decidirVencedor(resFin.totalNominal - resCon.totalNominal, valorImovel);
  const sensibilidade: Sensibilidade = {
    equilibrio: calcularEquilibrio(sim, resFin.vp),
    coMais: cenarioCo(sim, co + SENSIBILIDADE_CO_PP),
    coMenos: cenarioCo(sim, Math.max(0, co - SENSIBILIDADE_CO_PP)),
  };
  return {
    vencedor,
    diffPV,
    diffPVPctImovel: diffPV / valorImovel,
    vencedorIngenuo,
    resumo: montarResumo(vencedor, diffPV, valorImovel),
    razoes: razoes(sim, fluxosFin, fluxosCon, resFin, resCon, vencedor, vencedorIngenuo),
    riscos: riscos(sim, sensibilidade),
    sensibilidade,
  };
}
