import type { Comparison } from '../../domain/comparison';
import type { CustoEfetivo } from '../../domain/consortium';
import { fmtBRL, fmtMeses, fmtPct } from '../../domain/format';
import type { Simulation } from '../../domain/simulation';

function ceTexto(ce: CustoEfetivo, converte: (taxaAa: number) => number): string {
  if (ce.status === 'ok' && ce.taxaAa !== null) return fmtPct(converte(ce.taxaAa));
  return ce.status === 'sem-raiz' ? 'n/d (sem TIR)' : 'n/d (fluxo misto)';
}

/** Contrato em andamento: o que já foi pago (fora da conta), a restituição da cota e o saldo de hoje. */
function ContratoEmAndamento({ sim }: { sim: Simulation }) {
  const redutor = sim.input.consorcio.redutorParcelaPct;
  if (sim.situacao === 'nova-compra' && redutor <= 0) return null;
  const ehConsorcio = sim.situacao === 'consorcio-em-andamento';
  const jaPago = ehConsorcio ? sim.jaPago.consorcio : sim.jaPago.financiamento;
  const k = sim.con.contemplacao.mes;
  const antes = sim.con.rows[sim.parcelasPagasConsorcio];
  const depois = sim.con.rows[k];
  return (
    <div className="andamento">
      {sim.parcelasPagas > 0 ? (
        <p data-testid="ja-pago">
          <strong>Já pago (custo afundado):</strong> {fmtBRL(jaPago)} em {sim.parcelasPagas} parcelas do {ehConsorcio ? 'consórcio' : 'financiamento'}. Fica
          fora dos totais abaixo e do veredito: é igual nas duas escolhas.
        </p>
      ) : null}
      {sim.restituicao ? (
        <p data-testid="restituicao">
          <strong>Restituição se cancelar a cota:</strong> {fmtBRL(sim.restituicao.valor)} ({fmtPct(sim.restituicao.pctAmortizado)} do bem pago ao fundo comum,
          multa de {fmtPct(sim.restituicao.multaPct)}), recebida no mês {sim.restituicao.t} a partir de hoje, cerca de 60 dias depois da última assembleia do
          grupo.
        </p>
      ) : null}
      {sim.saldoFinanciamentoHoje !== undefined ? (
        <p data-testid="saldo-financiamento-hoje">
          <strong>Saldo devedor do financiamento hoje</strong> (após {sim.parcelasPagasFinanciamento} parcelas): {fmtBRL(sim.saldoFinanciamentoHoje)}. Confira com o
          extrato do banco.
        </p>
      ) : null}
      {redutor > 0 ? (
        <p data-testid="redutor-parcela">
          <strong>Redutor de {fmtPct(redutor)}:</strong> parcela do consórcio antes da contemplação {fmtBRL(antes.parcela)}
          {depois ? `; depois da contemplação ${fmtBRL(depois.parcela)}` : ''}.
        </p>
      ) : null}
    </div>
  );
}

export function SummaryTable({ comparacao }: { comparacao: Comparison }) {
  const { sim, financiamento: f, consorcio: c } = comparacao;
  const primeiraFin = sim.fin.rows[sim.parcelasPagasFinanciamento];
  const ultimaFin = sim.fin.rows[sim.fin.rows.length - 1];
  const primeiraCon = sim.con.rows[sim.parcelasPagasConsorcio];
  const ultimaCon = sim.con.rows[sim.con.rows.length - 1];
  const menor = (a: number, b: number): [string, string] => [a < b ? 'melhor' : '', b < a ? 'melhor' : ''];
  const [nf, nc] = menor(f.totalNominal, c.totalNominal);
  const [rf, rc] = menor(f.totalReal, c.totalReal);
  const [vf, vc] = menor(f.vp, c.vp);

  return (
    <section className="card" aria-labelledby="resumo-title">
      <h2 id="resumo-title">Resumo lado a lado</h2>
      <ContratoEmAndamento sim={sim} />
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
              <td className="num">{fmtMeses(sim.fin.rows.length - sim.parcelasPagasFinanciamento)}</td>
              <td className="num">{fmtMeses(sim.con.rows.length - sim.parcelasPagasConsorcio)}</td>
            </tr>
            <tr>
              <th scope="row">Pago antes de morar no imóvel</th>
              {sim.situacao === 'financiamento-em-andamento' ? (
                <>
                  <td className="num">Você já mora no imóvel</td>
                  <td className="num">Financiamento e consórcio em paralelo até o mês {sim.con.contemplacao.mes}</td>
                </>
              ) : (
                <>
                  <td className="num">{fmtBRL(sim.custosIniciais.total)} (entrada e custos)</td>
                  <td className="num">
                    {fmtBRL(sim.con.totals.aluguel)} de aluguel até o mês {sim.con.contemplacao.mes - sim.parcelasPagasConsorcio}
                  </td>
                </>
              )}
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
