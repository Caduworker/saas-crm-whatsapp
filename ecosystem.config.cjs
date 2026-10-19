// Config de PM2 para el backend en el VPS. Uso: pm2 start ecosystem.config.cjs
// (después de `npm run build --workspace server`). El cliente (Vite) no va acá:
// se compila a archivos estáticos, no necesita un proceso Node propio.
module.exports = {
  apps: [
    {
      name: 'crm',
      cwd: __dirname + '/server',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
