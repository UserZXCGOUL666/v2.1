const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { pool } = require('./db');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.frontendOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'perfume-shop-api', version: '1.0.0' });
});

app.get('/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Совместимость со старым frontend, где использовались /products и /orders без /api.
app.use('/', publicRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Маршрут не найден' }));

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Файл превышает 8 МБ' });
  if (error.code === '23505') return res.status(409).json({ error: 'Запись с таким уникальным значением уже существует' });
  const status = error.statusCode || 500;
  res.status(status).json({
    error: status >= 500 ? 'Внутренняя ошибка сервера' : error.message,
    ...(config.isProduction ? {} : { debug: error.message })
  });
});

app.listen(config.port, () => {
  console.log(`Perfume API is running on port ${config.port}`);
});
