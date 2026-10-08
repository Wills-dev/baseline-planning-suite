import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';

test('renders Delivery heading and the initial loading state', () => {
  const markup = renderToStaticMarkup(<App />);
  expect(markup).toContain('<h1>Baseline Planning — Delivery</h1>');
  expect(markup).toContain('Loading planning data…');
});
