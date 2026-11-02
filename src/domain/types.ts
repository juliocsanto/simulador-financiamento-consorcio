export type SistemaAmortizacao = 'SAC' | 'PRICE';
export type ModoAmortExtra = 'prazo' | 'parcela';
export type ModoPosLance = 'parcela' | 'prazo';

/** Todos os percentuais são frações (0,115 = 11,5%). */
export interface CommonInput {
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
}

export interface ScenarioInput {
  comum: CommonInput;
  financiamento: FinancingInput;
  consorcio: ConsortiumInput;
}

export type Opcao = 'financiamento' | 'consorcio';
