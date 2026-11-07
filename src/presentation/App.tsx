import { useMemo, useState } from 'react';
import type { Services } from '../composition';
import { defaultInput } from '../domain/defaults';
import type { ScenarioInput } from '../domain/types';
import type { SimulationReport } from '../application/useCases';
import { Charts } from './components/Charts';
import { CostBreakdownTable } from './components/CostBreakdownTable';
import { Footer } from './components/Footer';
import { HiddenCosts } from './components/HiddenCosts';
import { InputForm } from './components/InputForm';
import { NextSteps } from './components/NextSteps';
import { PayoffPlan } from './components/PayoffPlan';
import { SavedScenarios } from './components/SavedScenarios';
import { ScheduleTables } from './components/ScheduleTables';
import { SummaryTable } from './components/SummaryTable';
import { VerdictCard } from './components/VerdictCard';
import { useDebounced } from './hooks/useDebounced';

type Resultado = { ok: true; report: SimulationReport } | { ok: false; mensagem: string };

export function App({ services }: { services: Services }) {
  const [input, setInput] = useState<ScenarioInput>(() => defaultInput());
  const debounced = useDebounced(input);
  const pendente = debounced !== input;

  const resultado = useMemo<Resultado>(() => {
    try {
      return { ok: true, report: services.simulate(debounced) };
    } catch (e) {
      return { ok: false, mensagem: e instanceof Error ? e.message : 'Erro desconhecido na simulação' };
    }
  }, [services, debounced]);

  return (
    <div className="app">
      <header className="topo">
        <h1>Financiamento x Consórcio</h1>
        <p>Simule mês a mês um financiamento (SAC ou PRICE) e um consórcio imobiliário e veja qual custa menos em valor presente.</p>
      </header>
      <div className="layout">
        <aside className="lateral">
          <InputForm input={input} onChange={setInput} onReset={() => setInput(defaultInput())} />
          <SavedScenarios services={services} input={input} onLoad={setInput} />
        </aside>
        <main className="resultados" aria-live="polite" aria-busy={pendente}>
          {resultado.ok ? (
            <>
              <VerdictCard verdict={resultado.report.comparacao.verdict} />
              <NextSteps proximos={resultado.report.proximosPassos} />
              <SummaryTable comparacao={resultado.report.comparacao} />
              <CostBreakdownTable linhas={resultado.report.comparacao.categorias} />
              <Charts serie={resultado.report.comparacao.serie} />
              <PayoffPlan plano={resultado.report.quitacao} />
              <HiddenCosts itens={resultado.report.oculto} />
              <ScheduleTables sim={resultado.report.comparacao.sim} />
            </>
          ) : (
            <section className="card" role="alert">
              <h2>Não foi possível simular</h2>
              <p>{resultado.mensagem}</p>
            </section>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}
