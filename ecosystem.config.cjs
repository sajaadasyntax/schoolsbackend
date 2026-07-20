module.exports = {
  apps: [
    {
      name: "school-api",
      script: "dist/index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: 5000,
      },
    },
  ],
};
