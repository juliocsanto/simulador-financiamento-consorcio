import type { Comparison } from '../../domain/comparison';
import type { CustoEfetivo } from '../../domain/consortium';
import { fmtBRL, fmtMeses, fmtPct } from '../../domain/format';

function ceTexto(ce: CustoEfetivo, converte: (taxaAa: number) => number): string {
  if (ce.status === 'ok' && ce.taxaAa !== null) return fmtPct(converte(ce.taxaAa));
  return ce.status === 'sem-raiz' ? 'n/d (sem TIR)' : 'n/d (fluxo misto)';
}

export function SummaryTable({ comparacao }: { comparacao: Comparison }) {
  const { sim, financiamento: f, consorcio: c } = comparacao;
  const primeiraFin = sim.fin.rows[0];
  const ultimaFin = sim.fin.rows[sim.fin.rows.length - 1];
  const primeiraCon = sim.con.rows[0];
  const ultimaCon = sim.con.rows[sim.con.rows.length - 1];
  const menor = (a: number, b: number): [string, string] => [a < b ? 'melhor' : '', b < a ? 'melhor' : ''];
  const [nf, nc] = menor(f.totalNominal, c.totalNominal);
  const [rf, rc] = menor(f.totalReal, c.totalReal);
  const [vf, vc] = menor(f.vp, c.vp);

  return (
    <section className="card" aria-labelledby="resumo-title">
      <h2 id="resumo-title">Resumo lado a lado</h2>
      <div className="tabela-wrap">
        <table data-testid="summary-table">
          <thead>
            <tr>
              <th scope="col">Indicador</th>
              <th scope="col" className="num">Financiamento ({sim.input.financiamento.sistema})</th>
              <th scope="col" className="num">Consórcio</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Régua ingênua: total nominal desembolsado</th>
              <td className={`num ${nf}`}>{fmtBRL(f.totalNominal)}</td>
              <td className={`num ${nc}`}>{fmtBRL(c.totalNominal)}</td>
            </tr>
            <tr>
              <th scope="row">Em R$ de hoje (deflacionado pelo IPCA)</th>
              <td className={`num ${rf}`}>{fmtBRL(f.totalReal)}</td>
              <td className={`num ${rc}`}>{fmtBRL(c.totalReal)}</td>
            </tr>
            <tr className="destaque">
              <th scope="row">Régua econômica: valor presente (decide o veredito)</th>
              <td className={`num ${vf}`}>{fmtBRL(f.vp)}</td>
              <td className={`num ${vc}`}>{fmtBRL(c.vp)}</td>
            </tr>
            <tr>
              <th scope="row">CET / custo efetivo (a.a.)</th>
              <td className="num">{fmtPct(sim.finCet)}</td>
              <td className="num">{ceTexto(sim.con.custoEfetivo, (x) => x)}</td>
            </tr>
            <tr>
              <th scope="row">Custo efetivo real (acima do IPCA)</th>
              <td className="num">{sim.finCet === null ? 'n/d' : fmtPct((1 + sim.finCet) / (1 + sim.input.comum.ipcaAa) - 1)}</td>
              <td className="num">{ceTexto(sim.con.custoEfetivo, (x) => (1 + x) / (1 + sim.input.comum.ipcaAa) - 1)}</td>
            </tr>
            <tr>
              <th scope="row">Primeira parcela</th>
              <td className="num">{fmtBRL(primeiraFin?.desembolso ?? 0)}</td>
              <td className="num">{fmtBRL(primeiraCon?.parcela ?? 0)}</td>
            </tr>
            <tr>
              <th scope="row">Última parcela</th>
              <td className="num">{fmtBRL(ultimaFin?.desembolso ?? 0)}</td>
              <td className="num">{fmtBRL(ultimaCon?.parcela ?? 0)}</td>
            </tr>
            <tr>
              <th scope="row">Duração</th>
              <td className="num">{fmtMeses(sim.fin.rows.length)}</td>
              <td className="num">{fmtMeses(sim.con.rows.length)}</td>
            </tr>
            <tr>
              <th scope="row">Pago antes de morar no imóvel</th>
              <td className="num">{fmtBRL(sim.custosIniciais.total)} (entrada e custos)</td>
              <td className="num">{fmtBRL(sim.con.totals.aluguel)} de aluguel até o mês {sim.con.contemplacao.mes}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="nota">
        Na régua ingênua soma-se tudo sem considerar quando o dinheiro sai. Na régua econômica cada real é trazido a valor presente pelo seu custo de oportunidade
        ({fmtPct(sim.input.comum.custoOportunidadeAa)} a.a.): dinheiro pago cedo deixa de render.
      </p>
    </section>
  );
}
