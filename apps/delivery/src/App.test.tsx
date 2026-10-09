import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';
import DeliveryPage from './DeliveryPage';

test('renders Delivery heading and the initial loading state', () => {
  const markup = renderToStaticMarkup(<App />);
  expect(markup).toContain('<h1>Baseline Planning — Delivery</h1>');
  expect(markup).toContain('Standalone Delivery user');
  expect(markup).toContain('Display currency: EUR');
  expect(markup).toContain('Loading planning data…');
});

test('public DeliveryPage consumes supplied host context without inventing local defaults or FX', () => {
  const runtimeContext = {
    displayCurrency: 'GBP' as const,
    activeUser: { id: 'host', name: 'Host planner' },
  };
  const markup = renderToStaticMarkup(
    <DeliveryPage runtimeContext={runtimeContext} />,
  );
  expect(markup).toContain('Host planner');
  expect(markup).toContain('Display currency: GBP');
  expect(markup).toContain('Amounts remain in EUR');
  expect(markup).not.toContain('Standalone Delivery user');
});
