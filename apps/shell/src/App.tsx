import { lazy, Suspense, useState } from 'react';
import { loadDeliveryPage, loadPeoplePage } from './remote-pages';

const PeoplePage = lazy(loadPeoplePage);
const DeliveryPage = lazy(loadDeliveryPage);

export function App() {
  const [page, setPage] = useState<'people' | 'delivery' | null>(null);

  return (
    <main>
      <h1>Baseline Planning — Shell</h1>
      <nav aria-label="Applications">
        <button type="button" onClick={() => setPage('people')}>
          People
        </button>
        <button type="button" onClick={() => setPage('delivery')}>
          Delivery
        </button>
      </nav>
      <Suspense fallback={<p>Loading application…</p>}>
        {page === 'people' && <PeoplePage />}
        {page === 'delivery' && <DeliveryPage />}
      </Suspense>
    </main>
  );
}
