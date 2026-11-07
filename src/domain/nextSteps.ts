import { MESES_POR_ANO } from './constants';
import { fmtBRL, fmtMeses, fmtPct } from './format';
import { extraNecessarioParaQuitar } from './payoff';
import { anualParaMensal, valorPresente } from './rates';
import { fluxosConsorcio, fluxosFinanciamento, simulate, somar, type Simulation } from './simulation';
import type { ScenarioInput } from './types';
import { ENTRADA_ALTA_PCT, type Verdict } from './verdict';

/** Prazos-alvo testados para quitar o financiamento cedo. */
export const ANOS_QUITACAO_PROXIMOS_PASSOS = [5, 8] as const;
/** Passo de entrada testado (fração do imóvel). */
export const PASSO_ENTRADA_PCT = 0.1;

export type PassoId =
  | 'aprovar-credito'
  | 'nao-dar-lance'
  | 'vender-cota'
  | 'cancelar-cota'
  | 'quitar-cedo'
  | 'entrada-maior';

export interface Passo {
  id: PassoId;
  titulo: string;
  texto: string;
  /** quanto a vantagem do financiamento (VP) aumenta com o passo; null quando não é calculável */
  ganhoVP: number | null;
  /** vender-cota: preço mínimo que bate o cancelamento (VP da restituição) */
  valor?: number;
  /** quitar-cedo: amortização extra mensal */
  extraMensal?: number;
}

export interface ProximosPassos {
  /** quanto o financiamento é mais barato que seguir com a cota, em valor presente */
  vantagemFinanciamentoVP: number;
  passos: Passo[];
}

/** VP do financiamento menos VP do consórcio (mesma régua do veredito). */
function diffPV(input: ScenarioInput): number {
  const sim = simulate(input);
  const t = anualParaMensal(sim.input.comum.custoOportunidadeAa);
  return valorPresente(fluxosFinanciamento(sim).total, t) - valorPresente(fluxosConsorcio(sim).total, t);
}

function passosDaCota(sim: Simulation): Passo[] {
  const rest = sim.restituicao;
  if (!rest) return [];
  const piso = rest.valor / (1 + anualParaMensal(sim.input.comum.custoOportunidadeAa)) ** rest.t;
  const pagas = sim.parcelasPagasConsorcio;
  const fundoComum = somar(sim.con.rows.filter((r) => r.mes <= pagas).map((r) => r.fundoComum));
  return [
    {
      id: 'vender-cota',
      titulo: 'Tentar vender (transferir) a cota antes de cancelar',
      texto: `Cancelar devolve ${fmtBRL(rest.valor)} só daqui a ${fmtMeses(rest.t)}, com multa de ${fmtPct(rest.multaPct)}. Por chegar tão tarde, esse dinheiro vale ${fmtBRL(piso)} hoje. Qualquer venda à vista acima de ${fmtBRL(piso)} é melhor que cancelar, e cada real acima disso aumenta a vantagem do financiamento. Para negociar: você já pôs ${fmtBRL(fundoComum)} no fundo comum do grupo (sem contar taxa de administração e fundo de reserva). A transferência depende da anuência da administradora, costuma ter taxa, e cota não contemplada é vendida com desconto.`,
      ganhoVP: null,
      valor: piso,
    },
    {
      id: 'cancelar-cota',
      titulo: 'Sem comprador: cancelar a cota (é o que o veredito já supõe)',
      texto: `Peça a desistência por escrito. A restituição estimada é ${fmtBRL(rest.valor)} (${fmtPct(rest.pctAmortizado)} do bem pago ao fundo comum, menos multa de ${fmtPct(rest.multaPct)}), paga cerca de 60 dias depois da última assembleia do grupo (STJ Tema 312), ou antes se a cota for sorteada entre as excluídas. Peça à administradora o valor oficial e confira a multa no regulamento.`,
      ganhoVP: 0,
    },
  ];
}

function passoQuitarCedo(input: ScenarioInput, sim: Simulation, diffAtual: number): Passo[] {
  const co = sim.input.comum.custoOportunidadeAa;
  const cet = sim.finCet;
  if (cet !== null && cet <= co) {
    return [
      {
        id: 'quitar-cedo',
        titulo: 'Não antecipar o financiamento',
        texto: `O custo total do financiamento (${fmtPct(cet)} a.a.) não supera o rendimento do seu dinheiro (${fmtPct(co)} a.a.): sobra mais mantendo o dinheiro investido do que adiantando parcelas.`,
        ganhoVP: null,
      },
    ];
  }
  const atual = input.financiamento.amortExtraMensal;
  const opcoes = ANOS_QUITACAO_PROXIMOS_PASSOS.filter((a) => a * MESES_POR_ANO < sim.fin.rows.length)
    .map((anos) => ({ anos, extra: extraNecessarioParaQuitar(sim.paramsFinHoje, anos) }))
    .filter((o) => o.extra > atual)
    .map((o) => {
      const novo = structuredClone(input);
      novo.financiamento.amortExtraMensal = o.extra;
      novo.financiamento.modoAmortExtra = 'prazo';
      return { ...o, ganho: diffAtual - diffPV(novo) };
    });
  if (opcoes.length === 0) return [];
  const melhor = opcoes.reduce((a, b) => (b.ganho > a.ganho ? b : a));
  const outras = opcoes
    .filter((o) => o !== melhor)
    .map((o) => `Em ${o.anos} anos: ${fmtBRL(o.extra)} a mais por mês, ganho de ${fmtBRL(o.ganho)}.`)
    .join(' ');
  const custo = cet === null ? 'mais' : `${fmtPct(cet)} a.a.`;
  return [
    {
      id: 'quitar-cedo',
      titulo: `Quitar o financiamento em ${melhor.anos} anos, abatendo todo mês`,
      texto: `O financiamento custa ${custo} e o seu dinheiro rende ${fmtPct(co)} a.a.: cada mês devendo custa mais do que rende. Pagando ${fmtBRL(melhor.extra)} a mais por mês (campo "amortização extra", modo "reduzir prazo"), o contrato acaba em ${melhor.anos} anos e a vantagem do financiamento cresce ${fmtBRL(melhor.ganho)} em valor presente. ${outras} Abata a dívida todo mês em vez de juntar num fundo separado para quitar no fim: o fundo rende menos do que a dívida custa.`.replace(/\s+/g, ' ').trim(),
      ganhoVP: melhor.ganho,
      extraMensal: melhor.extra,
    },
  ];
}

function passoEntrada(input: ScenarioInput, diffAtual: number): Passo[] {
  const e = input.financiamento.entradaPct;
  const nova = Math.min(e + PASSO_ENTRADA_PCT, ENTRADA_ALTA_PCT);
  if (nova <= e + 1e-9) return [];
  const novo = structuredClone(input);
  novo.financiamento.entradaPct = nova;
  const ganho = diffAtual - diffPV(novo);
  const aMais = (nova - e) * input.comum.valorImovel;
  const efeito =
    ganho > 0
      ? `a vantagem do financiamento cresce ${fmtBRL(ganho)} em valor presente, porque você pega menos dinheiro caro emprestado`
      : `a vantagem do financiamento cai ${fmtBRL(-ganho)} em valor presente: aqui não compensa tirar mais dinheiro do investimento`;
  return [
    {
      id: 'entrada-maior',
      titulo: ganho > 0 ? `Dar ${fmtPct(nova)} de entrada, se couber no caixa` : 'Não aumentar a entrada',
      texto: `Subindo a entrada de ${fmtPct(e)} para ${fmtPct(nova)} (${fmtBRL(aMais)} a mais hoje), ${efeito}. Mantenha a reserva de emergência fora dessa conta.`,
      ganhoVP: ganho,
    },
  ];
}

/**
 * Consórcio em andamento e financiamento mais barato: o que fazer agora, na ordem, com o ganho de
 * cada passo medido pela mesma régua do veredito (valor presente ao custo de oportunidade).
 */
export function buildProximosPassos(input: ScenarioInput, sim: Simulation, verdict: Verdict): ProximosPassos | null {
  if (sim.situacao !== 'consorcio-em-andamento' || verdict.vencedor !== 'financiamento') return null;
  const diffAtual = verdict.diffPV;
  const cp = sim.con.contemplacao;
  const lance: Passo[] =
    cp.lanceCaixa > 0
      ? [
          {
            id: 'nao-dar-lance',
            titulo: 'Não dar o lance',
            texto: `O lance tiraria ${fmtBRL(cp.lanceCaixa)} do seu bolso no mês ${cp.mes} do contrato, e é esse dinheiro saindo cedo que mais pesa contra o consórcio. Depois de contemplada, a cota já não pode ser simplesmente cancelada com restituição.`,
            ganhoVP: null,
          },
        ]
      : [];
  const passos: Passo[] = [
    {
      id: 'aprovar-credito',
      titulo: 'Aprovar o financiamento antes de mexer na cota',
      texto:
        'Só peça a venda ou o cancelamento da cota depois do crédito aprovado e do imóvel avaliado pelo banco. Se o financiamento não sair, a cota continua sendo o seu caminho.',
      ganhoVP: null,
    },
    ...lance,
    ...passosDaCota(sim),
    ...passoQuitarCedo(input, sim, diffAtual),
    ...passoEntrada(input, diffAtual),
  ];
  return { vantagemFinanciamentoVP: -diffAtual, passos };
}
