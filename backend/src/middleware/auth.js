const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Требуется авторизация администратора' });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (payload.role !== 'admin') throw new Error('Invalid role');
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Сессия истекла. Войдите снова' });
  }
}

module.exports = { requireAdmin };
