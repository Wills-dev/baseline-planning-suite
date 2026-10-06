import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { App } from './App';

test('renders the People application name', () => {
  expect(renderToStaticMarkup(<App />)).toBe(
    '<h1>Baseline Planning — People</h1>',
  );
});
