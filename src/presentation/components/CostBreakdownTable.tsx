import type { LinhaCusto } from '../../domain/comparison';
import { fmtBRL } from '../../domain/format';

/** Por que uma categoria de custo pode ficar negativa sem ser erro (só para as que não são entradas por natureza). */
const EXPLICA_NEGATIVO: Partial<Record<LinhaCusto['key'], string>> = {
  amortizacao:
    'Principal negativo: em parte do contrato a TR corrige o saldo devedor mais do que a parcela amortiza (amortização negativa), e o saldo cresce; o principal só volta a ser pago no fim, por isso o VP pode ficar abaixo de zero.',
  fundoReserva:
    'Fundo de reserva negativo: a devolução no encerramento do grupo inclui o fundo já pago antes de hoje, que fica fora da conta como custo afundado.',
};

export function CostBreakdownTable({ linhas }: { linhas: LinhaCusto[] }) {
  const soma = (pick: (l: LinhaCusto) => number): number => linhas.reduce((s, l) => s + pick(l), 0);
  const negativo = (l: LinhaCusto): boolean =>
    [l.financiamento.nominal, l.financiamento.vp, l.consorcio.nominal, l.consorcio.vp].some((v) => v < -0.5);
  const notas = linhas.filter((l) => EXPLICA_NEGATIVO[l.key] && negativo(l)).map((l) => EXPLICA_NEGATIVO[l.key] as string);
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
      {notas.map((n) => (
        <p className="nota" key={n}>
          {n}
        </p>
      ))}
    </section>
  );
}
