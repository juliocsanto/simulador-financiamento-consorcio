import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createServices } from '../src/composition';
import { InMemoryScenarioRepository } from '../src/infrastructure/InMemoryScenarioRepository';
import { App } from '../src/presentation/App';

describe('App (renderização no servidor)', () => {
  const html = renderToString(<App services={createServices(new InMemoryScenarioRepository())} />);

  it.each(['verdict', 'verdict-winner', 'summary-table', 'save-scenario', 'saved-list', 'payoff-plan', 'hidden-costs'])(
    'expõe data-testid=%s',
    (id) => {
      expect(html).toContain(`data-testid="${id}"`);
    },
  );

  it('mostra o aviso educacional, as fontes e os campos com name', () => {
    expect(html).toContain('Simulação educacional, não é recomendação');
    expect(html).toContain('BCB SGS 226');
    expect(html).toContain('name="valorImovel"');
    expect(html).toContain('name="jurosAa"');
    expect(html).toContain('name="mesContemplacao"');
  });
});
