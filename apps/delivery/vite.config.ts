import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig({
  base: process.env.BASELINE_PUBLIC_BASE ?? '/',
  plugins: [
    react(),
    federation({
      name: 'delivery',
      filename: 'remoteEntry.js',
      exposes: { './DeliveryPage': './src/federated-page.ts' },
      shared: {
        react: { singleton: true },
        'react-dom': { singleton: true },
      },
      dts: false,
    }),
  ],
  server: { port: 5175, strictPort: true, cors: true },
  preview: { port: 5175, strictPort: true, cors: true },
});
