import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initializeDeliveryPersistence } from './persistence/initialize';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element is missing');
}

await initializeDeliveryPersistence();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
