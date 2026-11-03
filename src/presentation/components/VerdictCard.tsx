import type { Verdict } from '../../domain/verdict';
import { fmtBRL, fmtPct } from '../../domain/format';

const TITULO: Record<Verdict['vencedor'], string> = {
  financiamento: 'Financiamento',
  consorcio: 'Consórcio',
  empate: 'Empate técnico',
};

export function VerdictCard({ verdict }: { verdict: Verdict }) {
  const eq = verdict.sensibilidade.equilibrio;
  return (
    <section className={`card verdict verdict-${verdict.vencedor}`} data-testid="verdict" aria-labelledby="verdict-title">
      <h2 id="verdict-title">Veredito</h2>
      <p className="verdict-headline">
        <span className="rotulo">Mais barato em valor presente:</span>{' '}
        <strong data-testid="verdict-winner">{TITULO[verdict.vencedor]}</strong>
      </p>
      <p className="verdict-delta">
        Diferença (VP): <strong>{fmtBRL(Math.abs(verdict.diffPV))}</strong> ({fmtPct(Math.abs(verdict.diffPVPctImovel))} do imóvel)
      </p>
      <p>{verdict.resumo}</p>

      <h3>Por quê</h3>
      <ul className="razoes">
        {verdict.razoes.map((r) => (
          <li key={r.titulo} className={`razao razao-${r.favorece}`}>
            <span className="tag">{r.favorece === 'neutro' ? 'Neutro' : r.favorece === 'consorcio' ? 'Pró-consórcio' : 'Pró-financiamento'}</span>
            <strong>{r.titulo}.</strong> {r.texto}
          </li>
        ))}
      </ul>

      <h3>Riscos e sensibilidade</h3>
      <ul className="riscos">
        {verdict.riscos.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="nota">
        Mês de equilíbrio da contemplação:{' '}
        <strong>
          {eq.situacao === 'equilibrio'
            ? `mês ${eq.mes}`
            : eq.situacao === 'vence-tarde'
              ? `o consórcio só vence a partir do mês ${eq.mes}`
              : eq.situacao === 'sempre-vence'
                ? 'o consórcio vence em qualquer mês'
                : 'o consórcio não vence em nenhum mês'}
        </strong>
        .
      </p>
    </section>
  );
}
