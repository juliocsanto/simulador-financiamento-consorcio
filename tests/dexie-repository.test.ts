import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NewScenario } from '../src/application/ports';
import { deleteScenario, listScenarios, loadScenario, saveScenario } from '../src/application/useCases';
import { defaultInput } from '../src/domain/defaults';
import { DexieScenarioRepository } from '../src/infrastructure/DexieScenarioRepository';

const novo = (name: string, createdAt: string): NewScenario => ({
  name,
  createdAt,
  input: defaultInput(),
  summary: { winner: 'consorcio', diffPV: 1234.5 },
});

beforeEach(async () => {
  await Dexie.delete('simulador-imovel');
});

describe('DexieScenarioRepository (IndexedDB)', () => {
  it('save atribui id autoincrementado e devolve o cenário com id', async () => {
    const repo = new DexieScenarioRepository();
    const a = await repo.save(novo('A', '2026-01-01T00:00:00.000Z'));
    const b = await repo.save(novo('B', '2026-01-02T00:00:00.000Z'));
    expect(typeof a.id).toBe('number');
    expect(b.id).toBeGreaterThan(a.id);
    expect(a.name).toBe('A');
    expect(a.summary).toEqual({ winner: 'consorcio', diffPV: 1234.5 });
  });

  it('list, get e delete', async () => {
    const repo = new DexieScenarioRepository();
    expect(await repo.list()).toEqual([]);
    const a = await repo.save(novo('A', '2026-01-01T00:00:00.000Z'));
    const b = await repo.save(novo('B', '2026-01-02T00:00:00.000Z'));
    expect((await repo.list()).map((s) => s.name).sort()).toEqual(['A', 'B']);
    expect(await repo.get(a.id)).toEqual(a);
    expect(await repo.get(9999)).toBeUndefined();
    await repo.delete(a.id);
    expect(await repo.get(a.id)).toBeUndefined();
    expect((await repo.list()).map((s) => s.id)).toEqual([b.id]);
    await expect(repo.delete(9999)).resolves.toBeUndefined();
  });

  it('persiste entre instâncias (mesmo banco) e preserva o input completo', async () => {
    const entrada = defaultInput();
    entrada.financiamento.sistema = 'PRICE';
    entrada.consorcio.embutidoAbateSaldo = true;
    const salvo = await saveScenario(new DexieScenarioRepository(), '  Persistido ', entrada, () => new Date('2026-05-05T10:00:00Z'));
    expect(salvo.name).toBe('Persistido');
    expect(salvo.createdAt).toBe('2026-05-05T10:00:00.000Z');

    const outra = new DexieScenarioRepository();
    expect(await loadScenario(outra, salvo.id)).toEqual(entrada);
  });

  it('casos de uso sobre o Dexie: lista mais nova primeiro e exclusão', async () => {
    const repo = new DexieScenarioRepository();
    await saveScenario(repo, 'Velho', defaultInput(), () => new Date('2026-01-01T00:00:00Z'));
    const recente = await saveScenario(repo, 'Novo', defaultInput(), () => new Date('2026-02-01T00:00:00Z'));
    expect((await listScenarios(repo)).map((s) => s.name)).toEqual(['Novo', 'Velho']);
    await deleteScenario(repo, recente.id);
    expect((await listScenarios(repo)).map((s) => s.name)).toEqual(['Velho']);
  });
});
