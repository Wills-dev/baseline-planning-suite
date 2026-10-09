import { lazy, Suspense, useState, type ComponentType } from 'react';
import type {
  ShellRuntimeContext,
  ShellRuntimeProps,
} from '@baseline/contracts';
import { RemoteErrorBoundary } from './RemoteErrorBoundary';

interface Props {
  name: string;
  runtimeContext: ShellRuntimeContext;
  load: (
    retry?: boolean,
  ) => Promise<{ default: ComponentType<ShellRuntimeProps> }>;
}

/** A retry creates a new lazy component as well as a fresh boundary. */
export function RemoteOutlet({ name, load, runtimeContext }: Props) {
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
        <Page runtimeContext={runtimeContext} />
      </Suspense>
    </RemoteErrorBoundary>
  );
}
