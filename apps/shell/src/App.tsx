import { lazy, Suspense, useState } from 'react';
import { loadDeliveryPage, loadPeoplePage } from './remote-pages';

const PeoplePage = lazy(loadPeoplePage);
const DeliveryPage = lazy(loadDeliveryPage);

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
      <Suspense fallback={<p>Loading application…</p>}>
        {visited.people && (
          <div hidden={page !== 'people'}>
            <PeoplePage />
          </div>
        )}
        {visited.delivery && (
          <div hidden={page !== 'delivery'}>
            <DeliveryPage />
          </div>
        )}
      </Suspense>
    </main>
  );
}
