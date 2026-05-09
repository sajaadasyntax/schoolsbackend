/**
 * PM2 process file for the Express API.
 *
 * Usage (from this directory):
 *   npm run build
 *   pm2 start ecosystem.config.cjs --env production
 *
 *   pm2 save
 *   pm2 startup   # follow the printed command for reboot persistence
 */
module.exports = {
  apps: [
    {
      name: "school-management-backend",
      cwd: __dirname,
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
