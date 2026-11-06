import { fmtBRL, fmtCustoLiquido, fmtMeses, fmtPct } from '../../domain/format';
import type { PlanoQuitacao } from '../../domain/payoff';

export function PayoffPlan({ plano }: { plano: PlanoQuitacao }) {
  const fin = plano.financiamento;
  const con = plano.consorcio;
  return (
    <section className="card" data-testid="payoff-plan" aria-labelledby="quitacao-title">
      <h2 id="quitacao-title">Plano de quitação</h2>

      <h3>Financiamento: como quitar mais cedo</h3>
      <p className="nota">
        {fin.amortizarCompensa === null
          ? 'Não foi possível calcular o CET para aplicar a regra de decisão.'
          : fin.amortizarCompensa
            ? `Amortizar compensa: o CET (${fmtPct(fin.cet)}) é maior que o seu custo de oportunidade (${fmtPct(fin.custoOportunidadeAa)}).`
            : `Atenção: o CET (${fmtPct(fin.cet)}) não supera o seu custo de oportunidade (${fmtPct(fin.custoOportunidadeAa)}). Nesse caso o fundo de quitação (investir o mesmo valor e quitar de uma vez) tende a vencer a amortização mensal.`}
      </p>
      <div className="tabela-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Estratégia</th>
              <th scope="col" className="num">Extra por mês</th>
              <th scope="col" className="num">1ª parcela total</th>
              <th scope="col" className="num">Duração</th>
              <th scope="col" className="num">Total nominal</th>
              <th scope="col" className="num">VP</th>
              <th scope="col" className="num">Juros economizados</th>
              <th scope="col" className="num">Fundo de quitação: mês / VP</th>
            </tr>
          </thead>
          <tbody>
            {[fin.baseline, ...fin.estrategias].map((e) => (
              <tr key={e.rotulo}>
                <th scope="row">{e.rotulo}</th>
                <td className="num">{fmtBRL(e.extraMensal)}</td>
                <td className="num">{fmtBRL(e.parcelaInicialTotal)}</td>
                <td className="num">{fmtMeses(e.meses)}</td>
                <td className="num">{fmtBRL(e.totalNominal)}</td>
                <td className="num">{fmtBRL(e.vp)}</td>
                <td className="num">{fmtBRL(e.jurosEconomizados)}</td>
                <td className="num">
                  {e.fundo === null
                    ? 'n/a'
                    : `${e.fundo.mesQuitacao ?? 'n/d'} / ${fmtBRL(e.fundo.vp)} (${e.fundo.vantagemDoFundoVP >= 0 ? 'fundo ' : 'amortizar '}${fmtBRL(Math.abs(e.fundo.vantagemDoFundoVP))} mais barato)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fin.fgts ? (
        <p className="nota">
          Usando o FGTS a cada 2 anos ({fmtBRL(fin.fgts.totalFgtsUsado)} no total): quita {fin.fgts.mesesReduzidos} meses antes ({fmtMeses(fin.fgts.meses)}), economiza {fmtBRL(fin.fgts.jurosEconomizados)} de juros e
          tira {fmtBRL(fin.fgts.totalNominalBolso)} do próprio bolso.
        </p>
      ) : (
        <p className="nota">Informe saldo ou aporte de FGTS no formulário para simular o uso a cada 2 anos.</p>
      )}

      <h3>Consórcio: seguir as parcelas ou antecipar</h3>
      <p className="nota">
        Seguir as parcelas {fmtCustoLiquido(con.baselineNominal)} nominais e {fmtCustoLiquido(con.baselineVP)} em valor presente, incluindo {fmtBRL(con.baselineAdm)} de taxa de administração.{' '}
        {con.quitarCompensa === null
          ? ''
          : con.quitarCompensa
            ? `Antecipar pode compensar: o saldo do consórcio corrige a ${fmtPct(con.custoDividaRestanteRealAa)} real a.a., acima do custo de oportunidade real (${fmtPct(con.custoOportunidadeRealAa)}).`
            : `Regra da wiki: não antecipe. O saldo do consórcio corrige a ${fmtPct(con.custoDividaRestanteRealAa)} real a.a., abaixo do custo de oportunidade real (${fmtPct(con.custoOportunidadeRealAa)}); invista a diferença.`}
      </p>
      {con.quitacoes.length > 0 ? (
        <div className="tabela-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Quitar no ano</th>
                <th scope="col" className="num">Saldo pago de uma vez</th>
                <th scope="col" className="num">Total nominal</th>
                <th scope="col" className="num">Economia nominal</th>
                <th scope="col" className="num">VP</th>
                <th scope="col" className="num">Quitar vs seguir (VP)</th>
                <th scope="col" className="num">Taxa adm paga</th>
              </tr>
            </thead>
            <tbody>
              {con.quitacoes.map((q) => (
                <tr key={q.anos}>
                  <th scope="row">Ano {q.anos} (mês {q.mes})</th>
                  <td className="num">{fmtBRL(q.valorQuitacao)}</td>
                  <td className="num">{fmtBRL(q.totalNominal)}</td>
                  <td className="num">{fmtBRL(q.economiaNominal)}</td>
                  <td className="num">{fmtBRL(q.vp)}</td>
                  <td className="num">{q.economiaVP >= 0 ? `quitar poupa ${fmtBRL(q.economiaVP)}` : `quitar custa ${fmtBRL(-q.economiaVP)} a mais`}</td>
                  <td className="num">{fmtBRL(q.admPaga)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="nota">Nenhuma meta de quitação (3, 5, 7 ou 10 anos) cabe depois da contemplação e antes do fim do grupo.</p>
      )}
      <p className="nota">A taxa de administração não é descontada ao antecipar: a economia vem só dos reajustes futuros que deixam de incidir.</p>
    </section>
  );
}
