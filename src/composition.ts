import {
  deleteScenario,
  listScenarios,
  loadScenario,
  saveScenario,
  simulateComparison,
} from './application/useCases';
import type { SavedScenario, ScenarioRepository } from './application/ports';
import type { ScenarioInput } from './domain/types';

/** Serviços que a camada de apresentação enxerga (sem saber de Dexie nem de repositório). */
export interface Services {
  simulate: typeof simulateComparison;
  save(name: string, input: ScenarioInput): Promise<SavedScenario>;
  list(): Promise<SavedScenario[]>;
  remove(id: number): Promise<void>;
  load(id: number): Promise<ScenarioInput | undefined>;
}

/** Raiz de composição: liga os casos de uso a um repositório concreto. */
export function createServices(repo: ScenarioRepository): Services {
  return {
    simulate: simulateComparison,
    save: (name, input) => saveScenario(repo, name, input),
    list: () => listScenarios(repo),
    remove: (id) => deleteScenario(repo, id),
    load: (id) => loadScenario(repo, id),
  };
}
