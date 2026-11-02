import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PontoSerie } from '../../domain/comparison';
import { fmtBRL } from '../../domain/format';

const COR_FIN = 'var(--cor-fin)';
const COR_CON = 'var(--cor-con)';
const ALTURA_GRAFICO = 280;

const compacto = (v: number): string => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (abs >= 1_000) return `${Math.round(v / 1_000)} mil`;
  return String(Math.round(v));
};

interface GraficoProps {
  dados: PontoSerie[];
  chaveFin: keyof PontoSerie;
  chaveCon: keyof PontoSerie;
  titulo: string;
}

function Grafico({ dados, chaveFin, chaveCon, titulo }: GraficoProps) {
  return (
    <figure className="grafico">
      <figcaption>{titulo}</figcaption>
      <ResponsiveContainer width="100%" height={ALTURA_GRAFICO}>
        <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--cor-borda)" strokeDasharray="3 3" />
          <XAxis dataKey="mes" tick={{ fontSize: 12, fill: 'var(--cor-texto-suave)' }} label={{ value: 'mês', position: 'insideBottomRight', offset: -2, fontSize: 12 }} />
          <YAxis tickFormatter={compacto} width={56} tick={{ fontSize: 12, fill: 'var(--cor-texto-suave)' }} />
          <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(m) => `Mês ${m}`} />
          <Legend />
          <Line type="monotone" dataKey={chaveFin} name="Financiamento" stroke={COR_FIN} dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey={chaveCon} name="Consórcio" stroke={COR_CON} dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}

export function Charts({ serie }: { serie: PontoSerie[] }) {
  return (
    <section className="card" aria-labelledby="graficos-title">
      <h2 id="graficos-title">Gráficos</h2>
      <Grafico dados={serie} chaveFin="financiamento" chaveCon="consorcio" titulo="Desembolso mensal (R$ nominais)" />
      <Grafico dados={serie} chaveFin="vpAcumuladoFinanciamento" chaveCon="vpAcumuladoConsorcio" titulo="Valor presente acumulado (R$)" />
    </section>
  );
}
