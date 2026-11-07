import { fmtBRL } from '../../domain/format';
import type { ProximosPassos } from '../../domain/nextSteps';

/** Consórcio em andamento e financiamento mais barato: o que fazer agora, na ordem. */
export function NextSteps({ proximos }: { proximos: ProximosPassos | null }) {
  if (!proximos) return null;
  return (
    <section className="card" data-testid="proximos-passos" aria-labelledby="proximos-title">
      <h2 id="proximos-title">Próximos passos: sair do consórcio para financiar</h2>
      <p>
        Seguir com a cota custa <strong>{fmtBRL(proximos.vantagemFinanciamentoVP)}</strong> a mais em valor presente do que
        financiar. Para trocar sem perder dinheiro no caminho, nesta ordem:
      </p>
      <ol className="passos">
        {proximos.passos.map((p) => (
          <li key={p.id} data-testid={`passo-${p.id}`}>
            <strong>{p.titulo}.</strong>{' '}
            {p.ganhoVP !== null && p.ganhoVP > 0 && <span className="tag">+{fmtBRL(p.ganhoVP)} em VP</span>} {p.texto}
          </li>
        ))}
      </ol>
      <p className="nota">
        Cada ganho foi recalculado com a mesma régua do veredito (valor presente ao seu custo de oportunidade), mudando só aquele
        item. Usar a cota mais tarde para quitar o financiamento é outra rota possível, mas não é simulada aqui: depende de a
        administradora aceitar a quitação de financiamento.
      </p>
    </section>
  );
}
