import { loadStandaloneCapacity } from './integration/delivery-capacity';
import type { ShellRuntimeContext } from '@baseline/contracts';
import PeoplePage from './PeoplePage';

// Standalone composition owns its local defaults; the public page never invents context.
const standaloneContext: ShellRuntimeContext = {
  displayCurrency: 'EUR',
  activeUser: { id: 'people-standalone', name: 'Standalone People user' },
};

export function App() {
  return (
    <PeoplePage
      runtimeContext={standaloneContext}
      loadCapacity={loadStandaloneCapacity}
    />
  );
}
