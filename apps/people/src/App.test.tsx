import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';

test('renders the People heading and accessible initial loading state', () => {
  const markup = renderToStaticMarkup(<App />);
  expect(markup).toContain('<h1>Baseline Planning — People</h1>');
  expect(markup).toContain('Loading employees…');
});
