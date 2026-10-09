import type { ShellRuntimeContext } from '@baseline/contracts';
import DeliveryPage from './DeliveryPage';

// Standalone composition owns its local defaults; the public page never invents context.
const standaloneContext: ShellRuntimeContext = {
  displayCurrency: 'EUR',
  activeUser: { id: 'delivery-standalone', name: 'Standalone Delivery user' },
};

export function App() {
  return <DeliveryPage runtimeContext={standaloneContext} />;
}
