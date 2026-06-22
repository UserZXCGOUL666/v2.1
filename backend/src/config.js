require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is required`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  port: Number(process.env.PORT || 3000),
  isProduction,
  databaseUrl: required('DATABASE_URL'),
  databaseSsl: process.env.DATABASE_SSL === 'true' || isProduction,
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  frontendOrigins: (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    folder: process.env.CLOUDINARY_FOLDER || 'perfume-shop/products'
  }
};
