const express = require('express');
const { Pool } = require('pg');

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
for (const name of required) {
  if (!process.env[name]) {
    console.error(`[FATAL] Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const app = express();
const port = Number(process.env.PORT || 3000);
const bindAddress = process.env.BIND_ADDRESS || '0.0.0.0';
const startupDelay = Number(process.env.STARTUP_DELAY_MS || 0);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionTimeoutMillis: 2000,
});

app.get('/', (_req, res) => res.json({ service: 'docker-debug-lab-api', status: 'running' }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    console.error('[HEALTH] Database check failed:', error.message);
    res.status(503).json({ status: 'unhealthy', database: error.message });
  }
});

app.get('/users', async (_req, res) => {
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL)');
    const count = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    res.json({ users: count.rows[0].count });
  } catch (error) {
    console.error('[API] /users failed:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/memory', (_req, res) => {
  const sizeMb = Number(process.env.ALLOCATE_MB || 200);
  console.log(`[MEMORY] Allocating approximately ${sizeMb} MB`);
  const blocks = [];
  for (let i = 0; i < sizeMb; i++) blocks.push(Buffer.alloc(1024 * 1024, 'x'));
  res.json({ allocatedMb: sizeMb, blocks: blocks.length });
});

setTimeout(() => {
  app.listen(port, bindAddress, () => {
    console.log(`[STARTUP] API listening on http://${bindAddress}:${port}`);
    console.log(`[CONFIG] DB_HOST=${process.env.DB_HOST} DB_PORT=${process.env.DB_PORT || 5432}`);
  });
}, startupDelay);
