// PM2 process config for the Andersen PDF render sidecar.
// Deploy path on VPS: /opt/pdf-service/
//
// Start:   pm2 start ecosystem.config.cjs
// Reload:  pm2 reload pdf-service
// Logs:    pm2 logs pdf-service
// Status:  pm2 status

module.exports = {
  apps: [
    {
      name: 'pdf-service',
      script: 'server.js',
      cwd: '/opt/pdf-service',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 8001,
        // PDF_SERVICE_SECRET is set via: pm2 set pdf-service:PDF_SERVICE_SECRET <value>
        // or via a .env file / system environment variable before starting.
        // Never commit the actual secret here.
      },
      // Auto-restart on crash
      restart_delay: 3000,
      max_restarts: 10,
      // Log paths
      out_file: '/var/log/pdf-service/out.log',
      error_file: '/var/log/pdf-service/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
