import type { NewScenario, SavedScenario, ScenarioRepository } from '../application/ports';

/** Implementação em memória da porta de persistência (usada em testes). */
export class InMemoryScenarioRepository implements ScenarioRepository {
  private readonly items = new Map<number, SavedScenario>();
  private nextId = 1;

  async save(scenario: NewScenario): Promise<SavedScenario> {
    const saved: SavedScenario = { ...scenario, id: this.nextId++ };
    this.items.set(saved.id, saved);
    return saved;
  }

  async list(): Promise<SavedScenario[]> {
    return [...this.items.values()];
  }

  async get(id: number): Promise<SavedScenario | undefined> {
    return this.items.get(id);
  }

  async delete(id: number): Promise<void> {
    this.items.delete(id);
  }
}
