import { describe, expect, it } from 'vitest';
import {
  deleteScenario,
  listScenarios,
  loadScenario,
  saveScenario,
  simulateComparison,
} from '../src/application/useCases';
import { defaultInput } from '../src/domain/defaults';
import { InMemoryScenarioRepository } from '../src/infrastructure/InMemoryScenarioRepository';

describe('repositório em memória', () => {
  it('save/list/get/delete fazem o ciclo completo', async () => {
    const repo = new InMemoryScenarioRepository();
    const a = await repo.save({
      name: 'A',
      createdAt: '2026-01-01T00:00:00.000Z',
      input: defaultInput(),
      summary: { winner: 'consorcio', diffPV: 1 },
    });
    const b = await repo.save({
      name: 'B',
      createdAt: '2026-01-02T00:00:00.000Z',
      input: defaultInput(),
      summary: { winner: 'financiamento', diffPV: -1 },
    });
    expect((await repo.list()).map((s) => s.name)).toEqual(['A', 'B']);
    expect((await repo.get(a.id))?.name).toBe('A');
    await repo.delete(a.id);
    expect((await repo.list()).map((s) => s.id)).toEqual([b.id]);
    expect(await repo.get(a.id)).toBeUndefined();
  });
});

describe('casos de uso', () => {
  it('salva com resumo do veredito, lista (mais novo primeiro), carrega e remove', async () => {
    const repo = new InMemoryScenarioRepository();
    const first = await saveScenario(repo, '  Base  ', defaultInput(), () => new Date('2026-03-01T10:00:00Z'));
    await saveScenario(repo, '', defaultInput(), () => new Date('2026-03-02T10:00:00Z'));
    const lista = await listScenarios(repo);
    expect(lista.map((s) => s.name)).toEqual(['Cenário sem nome', 'Base']);
    expect(first.name).toBe('Base');
    expect(first.summary.winner).toBe(simulateComparison(defaultInput()).comparacao.verdict.vencedor);
    const carregado = await loadScenario(repo, first.id);
    expect(carregado).toEqual(defaultInput());
    expect(await loadScenario(repo, 999)).toBeUndefined();
    await deleteScenario(repo, first.id);
    expect(await listScenarios(repo)).toHaveLength(1);
  });
});
