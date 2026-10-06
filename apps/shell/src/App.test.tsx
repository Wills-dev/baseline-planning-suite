import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';

test('renders the Shell application name', () => {
  expect(renderToStaticMarkup(<App />)).toBe(
    '<h1>Baseline Planning — Shell</h1>',
  );
});
