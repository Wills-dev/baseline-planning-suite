import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'delivery',
      filename: 'remoteEntry.js',
      exposes: { './DeliveryPage': './src/DeliveryPage.tsx' },
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
