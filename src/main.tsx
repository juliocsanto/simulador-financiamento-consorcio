import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createServices } from './composition';
import { DexieScenarioRepository } from './infrastructure/DexieScenarioRepository';
import { App } from './presentation/App';
import './presentation/styles.css';

const services = createServices(new DexieScenarioRepository());

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);
