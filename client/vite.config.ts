import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Lee el mismo .env de la raíz que usa el servidor (solo expone las VITE_*).
  envDir: '..',
});
