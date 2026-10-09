import { useState } from 'react';
import type { ShellRuntimeContext, DisplayCurrency } from '@baseline/contracts';
import { RemoteOutlet } from './RemoteOutlet';
import { loadDeliveryPage, loadPeoplePage } from './remote-pages';

export function App() {
  const [runtimeContext, setRuntimeContext] = useState<ShellRuntimeContext>({
    displayCurrency: 'EUR',
    activeUser: { id: 'shell-planner', name: 'Alex Morgan' },
  });
  const [visited, setVisited] = useState({ people: false, delivery: false });
  const [page, setPage] = useState<'people' | 'delivery' | null>(null);

  return (
    <main>
      <h1>Baseline Planning — Shell</h1>
      <p>Active user: {runtimeContext.activeUser.name}</p>
      <label htmlFor="shell-display-currency">Display currency</label>
      <select
        id="shell-display-currency"
        value={runtimeContext.displayCurrency}
        onChange={(event) => {
          const displayCurrency = event.target.value;
          if (['EUR', 'USD', 'GBP'].includes(displayCurrency))
            setRuntimeContext((previous) => ({
              ...previous,
              displayCurrency: displayCurrency as DisplayCurrency,
            }));
        }}
      >
        <option value="EUR">EUR</option>
        <option value="USD">USD</option>
        <option value="GBP">GBP</option>
      </select>
      <nav aria-label="Applications">
        <button
          type="button"
          onClick={() => {
            setVisited((value) => ({ ...value, people: true }));
            setPage('people');
          }}
        >
          People
        </button>
        <button
          type="button"
          onClick={() => {
            setVisited((value) => ({ ...value, delivery: true }));
            setPage('delivery');
          }}
        >
          Delivery
        </button>
      </nav>

      {visited.people && (
        <div hidden={page !== 'people'}>
          <RemoteOutlet
            name="People"
            load={loadPeoplePage}
            runtimeContext={runtimeContext}
          />
        </div>
      )}
      {visited.delivery && (
        <div hidden={page !== 'delivery'}>
          <RemoteOutlet
            name="Delivery"
            load={loadDeliveryPage}
            runtimeContext={runtimeContext}
          />
        </div>
      )}
    </main>
  );
}
