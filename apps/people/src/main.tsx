import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initializePeoplePersistence } from './persistence/initialize';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element is missing');
}

await initializePeoplePersistence();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
