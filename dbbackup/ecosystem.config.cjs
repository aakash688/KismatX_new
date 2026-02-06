module.exports = {
  apps: [
    {
      name: 'kismatx-backup-scheduler',
      script: './scheduler.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // Auto restart on crash
      autorestart: true,
      // Number of restart before stopping
      max_restarts: 10,
      // Time to wait before restarting
      min_uptime: '10s',
      max_memory_restart: '1G',
      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/scheduler-error.log',
      out_file: './logs/scheduler-out.log',
      // On Windows, handle shutdown gracefully
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 3000,
      // Monitor settings
      monitoring: true,
      watch: false, // Set to true to restart on file changes (development only)
      ignore_watch: ['node_modules', './backups', './logs'],
    },
  ],
};
