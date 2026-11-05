import { useState } from 'react';
import { PAGINA_CRONOGRAMA } from '../../domain/constants';
import type { Simulation } from '../../domain/simulation';
import { fmtBRLCents } from '../../domain/format';

type Aba = 'financiamento' | 'consorcio';

function Paginacao({ pagina, total, onChange }: { pagina: number; total: number; onChange: (p: number) => void }) {
  return (
    <div className="paginacao">
      <button type="button" className="btn btn-secundario" disabled={pagina === 0} onClick={() => onChange(pagina - 1)}>
        Anterior
      </button>
      <span>
        Página {pagina + 1} de {total}
      </span>
      <button type="button" className="btn btn-secundario" disabled={pagina >= total - 1} onClick={() => onChange(pagina + 1)}>
        Próxima
      </button>
    </div>
  );
}

function TabelaFinanciamento({ sim, pagina }: { sim: Simulation; pagina: number }) {
  const linhas = sim.fin.rows.slice(pagina * PAGINA_CRONOGRAMA, (pagina + 1) * PAGINA_CRONOGRAMA);
  return (
    <div className="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col" className="num">Saldo inicial</th>
            <th scope="col" className="num">Correção TR</th>
            <th scope="col" className="num">Juros</th>
            <th scope="col" className="num">Amortização</th>
            <th scope="col" className="num">Extra</th>
            <th scope="col" className="num">Seguros + tarifa</th>
            <th scope="col" className="num">Desembolso</th>
            <th scope="col" className="num">Saldo final</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((r) => (
            <tr key={r.mes} className={r.mes <= sim.parcelasPagasFinanciamento ? 'pago' : undefined}>
              <th scope="row">
                {r.mes}
                {r.mes <= sim.parcelasPagasFinanciamento ? ' (já pago)' : ''}
              </th>
              <td className="num">{fmtBRLCents(r.saldoInicial)}</td>
              <td className="num">{fmtBRLCents(r.correcao)}</td>
              <td className="num">{fmtBRLCents(r.juros)}</td>
              <td className="num">{fmtBRLCents(r.amortizacao)}</td>
              <td className="num">{fmtBRLCents(r.extra)}</td>
              <td className="num">{fmtBRLCents(r.mip + r.dfi + r.tarifa)}</td>
              <td className="num">{fmtBRLCents(r.desembolso)}</td>
              <td className="num">{fmtBRLCents(r.saldoFinal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaConsorcio({ sim, pagina }: { sim: Simulation; pagina: number }) {
  const linhas = sim.con.rows.slice(pagina * PAGINA_CRONOGRAMA, (pagina + 1) * PAGINA_CRONOGRAMA);
  return (
    <div className="tabela-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Mês</th>
            <th scope="col" className="num">Parcela</th>
            <th scope="col" className="num">Fundo comum</th>
            <th scope="col" className="num">Taxa adm</th>
            <th scope="col" className="num">Fundo reserva</th>
            <th scope="col" className="num">Aluguel</th>
            <th scope="col" className="num">Lance + complemento + compra</th>
            <th scope="col" className="num">Desembolso</th>
            <th scope="col" className="num">Saldo devedor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((r) => (
            <tr key={r.mes} className={r.mes <= sim.parcelasPagasConsorcio ? 'pago' : r.mes === sim.con.contemplacao.mes ? 'destaque' : undefined}>
              <th scope="row">
                {r.mes}
                {r.mes <= sim.parcelasPagasConsorcio ? ' (já pago)' : ''}
                {r.mes === sim.con.contemplacao.mes ? ' (contemplação)' : ''}
              </th>
              <td className="num">{fmtBRLCents(r.parcela)}</td>
              <td className="num">{fmtBRLCents(r.fundoComum)}</td>
              <td className="num">{fmtBRLCents(r.adm)}</td>
              <td className="num">{fmtBRLCents(r.fundoReserva)}</td>
              <td className="num">{fmtBRLCents(r.aluguel)}</td>
              <td className="num">{fmtBRLCents(r.lanceCaixa + r.complemento + r.custosCompra + r.tarifaAvaliacao)}</td>
              <td className="num">{fmtBRLCents(r.desembolso)}</td>
              <td className="num">{fmtBRLCents(r.saldoDevedor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScheduleTables({ sim }: { sim: Simulation }) {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<Aba>('financiamento');
  const [pagina, setPagina] = useState(0);
  const totalLinhas = aba === 'financiamento' ? sim.fin.rows.length : sim.con.rows.length;
  const totalPaginas = Math.max(1, Math.ceil(totalLinhas / PAGINA_CRONOGRAMA));
  const paginaSegura = Math.min(pagina, totalPaginas - 1);

  return (
    <details className="card" open={aberto} onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <h2 className="inline">Cronograma mês a mês</h2>
      </summary>
      {aberto ? (
        <>
          <div className="abas" role="tablist" aria-label="Cronograma">
            {(['financiamento', 'consorcio'] as const).map((a) => (
              <button
                key={a}
                type="button"
                role="tab"
                aria-selected={aba === a}
                className={`aba ${aba === a ? 'ativa' : ''}`}
                onClick={() => {
                  setAba(a);
                  setPagina(0);
                }}
              >
                {a === 'financiamento' ? 'Financiamento' : 'Consórcio'}
              </button>
            ))}
          </div>
          {aba === 'financiamento' ? <TabelaFinanciamento sim={sim} pagina={paginaSegura} /> : <TabelaConsorcio sim={sim} pagina={paginaSegura} />}
          <Paginacao pagina={paginaSegura} total={totalPaginas} onChange={setPagina} />
        </>
      ) : null}
    </details>
  );
}
