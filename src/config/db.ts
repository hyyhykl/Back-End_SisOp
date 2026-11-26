import { Pool, PoolConfig } from 'pg';
import { env } from './env';

const poolConfig: PoolConfig = {
  connectionString: env.databaseUrl,
  ssl: {
    rejectUnauthorized: false, 
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

export const pool = new Pool(poolConfig);


pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Database connected:', res.rows[0].now);
  }
});


process.on('SIGINT', async () => {
  await pool.end();
  console.log('📴 Database pool closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await pool.end();
  console.log('📴 Database pool closed');
  process.exit(0);
});

export default pool;