import { useCallback, useEffect, useState } from 'react';
import type { SavedScenario } from '../../application/ports';
import type { Services } from '../../composition';
import { fmtBRL } from '../../domain/format';
import type { ScenarioInput } from '../../domain/types';

const ROTULO: Record<SavedScenario['summary']['winner'], string> = {
  financiamento: 'Financiamento',
  consorcio: 'Consórcio',
  empate: 'Empate técnico',
};

interface Props {
  services: Services;
  input: ScenarioInput;
  onLoad: (input: ScenarioInput) => void;
}

export function SavedScenarios({ services, input, onLoad }: Props) {
  const [lista, setLista] = useState<SavedScenario[]>([]);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setLista(await services.list());
      setErro(null);
    } catch {
      setErro('Não foi possível ler os cenários salvos neste navegador.');
    }
  }, [services]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const salvar = async (): Promise<void> => {
    try {
      await services.save(nome, input);
      setNome('');
      await recarregar();
    } catch {
      setErro('Não foi possível salvar o cenário (armazenamento local indisponível).');
    }
  };

  const carregar = async (id: number): Promise<void> => {
    const carregado = await services.load(id);
    if (carregado) onLoad(carregado);
  };

  const apagar = async (id: number): Promise<void> => {
    await services.remove(id);
    await recarregar();
  };

  return (
    <section className="card" aria-labelledby="salvos-title">
      <h2 id="salvos-title">Cenários salvos</h2>
      <div className="salvar">
        <label className="campo" htmlFor="nome-cenario">
          <span className="campo-label">Nome do cenário</span>
          <input id="nome-cenario" name="nomeCenario" type="text" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Base, Lance 30%" />
        </label>
        <button type="button" className="btn" data-testid="save-scenario" onClick={() => void salvar()}>
          Salvar cenário
        </button>
      </div>
      {erro ? <p role="alert" className="erro">{erro}</p> : null}
      <ul className="lista-salvos" data-testid="saved-list">
        {lista.length === 0 ? <li className="vazio">Nenhum cenário salvo ainda.</li> : null}
        {lista.map((s) => (
          <li key={s.id}>
            <div>
              <strong>{s.name}</strong>
              <span className="meta">
                {new Date(s.createdAt).toLocaleString('pt-BR')} · {ROTULO[s.summary.winner]} · ΔVP {fmtBRL(s.summary.diffPV)}
              </span>
            </div>
            <div className="acoes">
              <button type="button" className="btn btn-secundario" onClick={() => void carregar(s.id)}>
                Carregar
              </button>
              <button type="button" className="btn btn-perigo" onClick={() => void apagar(s.id)} aria-label={`Excluir ${s.name}`}>
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
