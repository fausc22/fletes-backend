// ecosystem.config.js - Configuración de PM2 para Sistema de Fletes
module.exports = {
  apps: [
    {
      name: 'fletes-api',
      script: 'server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      
      // Variables de entorno para producción
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      
      // Variables de entorno para desarrollo
      env_development: {
        NODE_ENV: 'development',
        PORT: 3002
      },
      
      // Configuración de logs
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Reinicio automático
      exp_backoff_restart_delay: 100,
      restart_delay: 1000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Manejo de señales
      kill_timeout: 5000,
      listen_timeout: 3000,
      shutdown_with_message: true,
      
      // Merge logs (útil para cluster mode)
      merge_logs: true
    }
  ]

  
};
