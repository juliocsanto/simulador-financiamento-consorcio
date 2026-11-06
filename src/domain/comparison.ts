import { anualParaMensal, valorPresente } from './rates';
import {
  CATEGORIAS,
  fluxosConsorcio,
  fluxosFinanciamento,
  resumirFluxos,
  simulate,
  somar,
  type CategoriaKey,
  type Fluxos,
  type OpcaoResumo,
  type Simulation,
} from './simulation';
import type { ScenarioInput } from './types';
import { buildVerdict, type Verdict } from './verdict';

export interface LinhaCusto {
  key: CategoriaKey;
  label: string;
  financiamento: { nominal: number; vp: number };
  consorcio: { nominal: number; vp: number };
}

export interface PontoSerie {
  mes: number;
  financiamento: number;
  consorcio: number;
  vpAcumuladoFinanciamento: number;
  vpAcumuladoConsorcio: number;
}

export interface Comparison {
  sim: Simulation;
  fluxosFin: Fluxos;
  fluxosCon: Fluxos;
  financiamento: OpcaoResumo;
  consorcio: OpcaoResumo;
  categorias: LinhaCusto[];
  serie: PontoSerie[];
  verdict: Verdict;
}

function linhasDeCusto(sim: Simulation, ff: Fluxos, fc: Fluxos): LinhaCusto[] {
  const taxa = anualParaMensal(sim.input.comum.custoOportunidadeAa);
  return CATEGORIAS.map(({ key, label }) => ({
    key,
    label,
    financiamento: { nominal: somar(ff.porCategoria[key]), vp: valorPresente(ff.porCategoria[key], taxa) },
    consorcio: { nominal: somar(fc.porCategoria[key]), vp: valorPresente(fc.porCategoria[key], taxa) },
  })).filter(
    (l) =>
      [l.financiamento.nominal, l.financiamento.vp, l.consorcio.nominal, l.consorcio.vp].some((v) => Math.abs(v) > 0.005),
  );
}

function serieMensal(sim: Simulation, ff: Fluxos, fc: Fluxos): PontoSerie[] {
  const taxa = anualParaMensal(sim.input.comum.custoOportunidadeAa);
  const out: PontoSerie[] = [];
  let acumF = 0;
  let acumC = 0;
  for (let t = 0; t <= sim.horizonte; t++) {
    const desconto = (1 + taxa) ** -t;
    acumF += ff.total[t] * desconto;
    acumC += fc.total[t] * desconto;
    out.push({
      mes: t,
      financiamento: ff.total[t],
      consorcio: fc.total[t],
      vpAcumuladoFinanciamento: acumF,
      vpAcumuladoConsorcio: acumC,
    });
  }
  return out;
}

/** Compara as duas opções: totais nas duas réguas, custos por categoria, séries e veredito. */
export function compare(input: ScenarioInput): Comparison {
  const sim = simulate(input);
  const fluxosFin = fluxosFinanciamento(sim);
  const fluxosCon = fluxosConsorcio(sim);
  const { custoOportunidadeAa, ipcaAa } = sim.input.comum;
  const financiamento = resumirFluxos(fluxosFin.total, custoOportunidadeAa, ipcaAa);
  const consorcio = resumirFluxos(fluxosCon.total, custoOportunidadeAa, ipcaAa);
  return {
    sim,
    fluxosFin,
    fluxosCon,
    financiamento,
    consorcio,
    categorias: linhasDeCusto(sim, fluxosFin, fluxosCon),
    serie: serieMensal(sim, fluxosFin, fluxosCon),
    verdict: buildVerdict(sim, fluxosFin, fluxosCon, financiamento, consorcio),
  };
}
