import type { LinhaCusto } from '../../domain/comparison';
import { fmtBRL } from '../../domain/format';

export function CostBreakdownTable({ linhas }: { linhas: LinhaCusto[] }) {
  const soma = (pick: (l: LinhaCusto) => number): number => linhas.reduce((s, l) => s + pick(l), 0);
  return (
    <section className="card" aria-labelledby="custos-title">
      <h2 id="custos-title">Custos por categoria</h2>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col" rowSpan={2}>Categoria</th>
              <th scope="colgroup" colSpan={2} className="num">Financiamento</th>
              <th scope="colgroup" colSpan={2} className="num">Consórcio</th>
            </tr>
            <tr>
              <th scope="col" className="num">Nominal</th>
              <th scope="col" className="num">VP</th>
              <th scope="col" className="num">Nominal</th>
              <th scope="col" className="num">VP</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.key}>
                <th scope="row">{l.label}</th>
                <td className="num">{fmtBRL(l.financiamento.nominal)}</td>
                <td className="num">{fmtBRL(l.financiamento.vp)}</td>
                <td className="num">{fmtBRL(l.consorcio.nominal)}</td>
                <td className="num">{fmtBRL(l.consorcio.vp)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num">{fmtBRL(soma((l) => l.financiamento.nominal))}</td>
              <td className="num">{fmtBRL(soma((l) => l.financiamento.vp))}</td>
              <td className="num">{fmtBRL(soma((l) => l.consorcio.nominal))}</td>
              <td className="num">{fmtBRL(soma((l) => l.consorcio.vp))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
