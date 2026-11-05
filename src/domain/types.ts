export type SistemaAmortizacao = 'SAC' | 'PRICE';
export type ModoAmortExtra = 'prazo' | 'parcela';
export type ModoPosLance = 'parcela' | 'prazo';
/** Onde o usuário está hoje: decide o que é custo afundado (já pago) e o que ainda se pode escolher. */
export type SituacaoAtual = 'nova-compra' | 'consorcio-em-andamento' | 'financiamento-em-andamento';

/** Todos os percentuais são frações (0,115 = 11,5%). */
export interface CommonInput {
  situacaoAtual: SituacaoAtual;
  valorImovel: number;
  valorizacaoImovelAa: number;
  ipcaAa: number;
  /** rendimento líquido de IR do dinheiro do usuário */
  custoOportunidadeAa: number;
  itbiPct: number;
  registroPct: number;
  aluguelMensal: number;
  reajusteAluguelAa: number;
}

export interface FinancingInput {
  sistema: SistemaAmortizacao;
  entradaPct: number;
  jurosAa: number;
  trAm: number;
  prazoMeses: number;
  mipAm: number;
  dfiAm: number;
  tarifaAdmMensal: number;
  tarifaAvaliacao: number;
  tarifaCadastro: number;
  amortExtraMensal: number;
  modoAmortExtra: ModoAmortExtra;
  fgtsSaldo: number;
  fgtsAporteMensal: number;
  /** parcelas já pagas do contrato (só vale em 'financiamento-em-andamento') */
  parcelasPagas: number;
}

export interface ConsortiumInput {
  valorCarta: number;
  prazoMeses: number;
  taxaAdmPct: number;
  fundoReservaPct: number;
  seguroAm: number;
  reajusteCartaAa: number;
  mesContemplacao: number;
  lancePct: number;
  embutidoPct: number;
  embutidoAbateSaldo: boolean;
  modoPosLance: ModoPosLance;
  tarifaAvaliacaoConsorcio: number;
  devolveFundoReserva: boolean;
  /** redutor de parcela (art. 22.6 Porto): fração do valor da parcela cheia que NÃO é paga antes da contemplação */
  redutorParcelaPct: number;
  /** parcelas já pagas da cota não contemplada (só vale em 'consorcio-em-andamento') */
  parcelasPagas: number;
}

export interface ScenarioInput {
  comum: CommonInput;
  financiamento: FinancingInput;
  consorcio: ConsortiumInput;
}

export type Opcao = 'financiamento' | 'consorcio';
