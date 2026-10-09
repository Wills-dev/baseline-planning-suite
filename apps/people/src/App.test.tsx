import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';
import PeoplePage from './PeoplePage';

test('renders the People heading and accessible initial loading state', () => {
  const markup = renderToStaticMarkup(<App />);
  expect(markup).toContain('<h1>Baseline Planning — People</h1>');
  expect(markup).toContain('Standalone People user');
  expect(markup).toContain('Display currency: EUR');
  expect(markup).toContain('Loading employees…');
});

test('public PeoplePage consumes supplied host context without inventing local defaults or FX', () => {
  const runtimeContext = {
    displayCurrency: 'GBP' as const,
    activeUser: { id: 'host', name: 'Host planner' },
  };
  const markup = renderToStaticMarkup(
    <PeoplePage runtimeContext={runtimeContext} />,
  );
  expect(markup).toContain('Host planner');
  expect(markup).toContain('Display currency: GBP');
  expect(markup).toContain('Amounts remain in EUR');
  expect(markup).not.toContain('Standalone People user');
});
