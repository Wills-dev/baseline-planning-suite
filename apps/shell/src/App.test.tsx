import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';

test('renders Shell navigation without eagerly requesting remotes', () => {
  const markup = renderToStaticMarkup(<App />);
  expect(markup).toContain('<h1>Baseline Planning — Shell</h1>');
  expect(markup).toContain('aria-label="Applications"');
  expect(markup).toContain('>People</button>');
  expect(markup).toContain('>Delivery</button>');
});
