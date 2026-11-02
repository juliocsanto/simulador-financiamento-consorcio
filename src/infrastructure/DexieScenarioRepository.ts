import Dexie, { type Table } from 'dexie';
import type { NewScenario, SavedScenario, ScenarioRepository } from '../application/ports';

const DB_NAME = 'simulador-imovel';
const TABLE_SCHEMA = '++id, name, createdAt';

class SimuladorDatabase extends Dexie {
  scenarios!: Table<SavedScenario, number>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({ scenarios: TABLE_SCHEMA });
  }
}

/** Persistência local em IndexedDB (banco `simulador-imovel`, tabela `scenarios`). */
export class DexieScenarioRepository implements ScenarioRepository {
  private readonly db = new SimuladorDatabase();

  async save(scenario: NewScenario): Promise<SavedScenario> {
    const id = await this.db.scenarios.add(scenario as SavedScenario);
    return { ...scenario, id };
  }

  list(): Promise<SavedScenario[]> {
    return this.db.scenarios.toArray();
  }

  get(id: number): Promise<SavedScenario | undefined> {
    return this.db.scenarios.get(id);
  }

  async delete(id: number): Promise<void> {
    await this.db.scenarios.delete(id);
  }
}
