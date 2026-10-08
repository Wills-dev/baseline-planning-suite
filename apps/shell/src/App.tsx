import { useState } from 'react';
import { RemoteOutlet } from './RemoteOutlet';
import { loadDeliveryPage, loadPeoplePage } from './remote-pages';

export function App() {
  const [visited, setVisited] = useState({ people: false, delivery: false });
  const [page, setPage] = useState<'people' | 'delivery' | null>(null);

  return (
    <main>
      <h1>Baseline Planning — Shell</h1>
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
          <RemoteOutlet name="People" load={loadPeoplePage} />
        </div>
      )}
      {visited.delivery && (
        <div hidden={page !== 'delivery'}>
          <RemoteOutlet name="Delivery" load={loadDeliveryPage} />
        </div>
      )}
    </main>
  );
}
