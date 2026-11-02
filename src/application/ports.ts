import type { ScenarioInput } from '../domain/types';

export interface ScenarioSummary {
  winner: 'financiamento' | 'consorcio' | 'empate';
  /** VP do financiamento menos VP do consórcio */
  diffPV: number;
}

export interface SavedScenario {
  id: number;
  name: string;
  /** ISO 8601 */
  createdAt: string;
  input: ScenarioInput;
  summary: ScenarioSummary;
}

export type NewScenario = Omit<SavedScenario, 'id'>;

/** Porta de persistência; implementada na camada de infraestrutura. */
export interface ScenarioRepository {
  save(scenario: NewScenario): Promise<SavedScenario>;
  list(): Promise<SavedScenario[]>;
  get(id: number): Promise<SavedScenario | undefined>;
  delete(id: number): Promise<void>;
}
