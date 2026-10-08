import { lazy, Suspense, useState, type ComponentType } from 'react';
import { RemoteErrorBoundary } from './RemoteErrorBoundary';

interface Props {
  name: string;
  load: (retry?: boolean) => Promise<{ default: ComponentType }>;
}

/** A retry creates a new lazy component as well as a fresh boundary. */
export function RemoteOutlet({ name, load }: Props) {
  const [{ attempt, Page }, setAttempt] = useState(() => ({
    attempt: 0,
    Page: lazy(() => load()),
  }));
  return (
    <RemoteErrorBoundary
      key={attempt}
      name={name}
      onRetry={() =>
        setAttempt((previous) => ({
          attempt: previous.attempt + 1,
          Page: lazy(() => load(true)),
        }))
      }
    >
      <Suspense fallback={<p role="status">Loading {name}…</p>}>
        <Page />
      </Suspense>
    </RemoteErrorBoundary>
  );
}
