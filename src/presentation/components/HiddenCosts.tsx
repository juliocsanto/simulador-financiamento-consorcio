import type { ItemOculto } from '../../domain/hiddenCosts';

function Lista({ itens, titulo }: { itens: ItemOculto[]; titulo: string }) {
  return (
    <>
      <h3>{titulo}</h3>
      <ol className="ocultos">
        {itens.map((i) => (
          <li key={i.id} id={i.id}>
            <strong>{i.titulo}.</strong> {i.texto}
          </li>
        ))}
      </ol>
    </>
  );
}

export function HiddenCosts({ itens }: { itens: ItemOculto[] }) {
  return (
    <section className="card" data-testid="hidden-costs" aria-labelledby="oculto-title">
      <h2 id="oculto-title">O que não te contam</h2>
      <p className="nota">Cada item usa os números do seu cenário.</p>
      <Lista titulo="Financiamento" itens={itens.filter((i) => i.lado === 'financiamento')} />
      <Lista titulo="Consórcio" itens={itens.filter((i) => i.lado === 'consorcio')} />
    </section>
  );
}
