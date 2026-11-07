import { compare, type Comparison } from '../domain/comparison';
import { buildHiddenCosts, type ItemOculto } from '../domain/hiddenCosts';
import { buildProximosPassos, type ProximosPassos } from '../domain/nextSteps';
import { buildPayoffPlan, type PlanoQuitacao } from '../domain/payoff';
import { completarInput } from '../domain/normalize';
import type { ScenarioInput } from '../domain/types';
import type { SavedScenario, ScenarioRepository } from './ports';

export interface SimulationReport {
  comparacao: Comparison;
  quitacao: PlanoQuitacao;
  oculto: ItemOculto[];
  /** só com consórcio em andamento e financiamento mais barato */
  proximosPassos: ProximosPassos | null;
}

/** Caso de uso puro: roda comparação, plano de quitação e itens "o que não te contam". */
export function simulateComparison(input: ScenarioInput): SimulationReport {
  const comparacao = compare(input);
  return {
    comparacao,
    quitacao: buildPayoffPlan(comparacao.sim),
    oculto: buildHiddenCosts(comparacao.sim, comparacao.fluxosCon, comparacao.verdict),
    proximosPassos: buildProximosPassos(input, comparacao.sim, comparacao.verdict),
  };
}

const NOME_PADRAO = 'Cenário sem nome';

export async function saveScenario(
  repo: ScenarioRepository,
  name: string,
  input: ScenarioInput,
  now: () => Date = () => new Date(),
): Promise<SavedScenario> {
  const { verdict } = compare(input);
  return repo.save({
    name: name.trim() || NOME_PADRAO,
    createdAt: now().toISOString(),
    input: structuredClone(input),
    summary: { winner: verdict.vencedor, diffPV: verdict.diffPV },
  });
}

export async function listScenarios(repo: ScenarioRepository): Promise<SavedScenario[]> {
  const todos = await repo.list();
  return [...todos].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteScenario(repo: ScenarioRepository, id: number): Promise<void> {
  await repo.delete(id);
}

export async function loadScenario(repo: ScenarioRepository, id: number): Promise<ScenarioInput | undefined> {
  const found = await repo.get(id);
  // cenários salvos antes dos campos de contrato em andamento são completados com os padrões
  return found ? completarInput(structuredClone(found.input)) : undefined;
}
