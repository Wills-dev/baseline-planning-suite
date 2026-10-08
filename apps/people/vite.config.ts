import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'people',
      filename: 'remoteEntry.js',
      exposes: { './PeoplePage': './src/federated-page.ts' },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
      dts: false,
    }),
  ],
  server: { port: 5174, strictPort: true, cors: true },
  preview: { port: 5174, strictPort: true, cors: true },
});
