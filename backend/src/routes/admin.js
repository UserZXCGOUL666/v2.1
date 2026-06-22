const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { pool, withTransaction } = require('../db');
const config = require('../config');
const { requireAdmin } = require('../middleware/auth');
const { productSelect, productGroupBy, mapProductRow } = require('../productMapper');
const {
  normalizeProduct,
  validateProduct,
  ensureUniqueFields,
  replaceNotes,
  replaceImages,
  fetchProductById
} = require('../productService');
const { uploadBuffer, destroyImage, isConfigured: cloudinaryConfigured } = require('../cloudinary');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.mimetype)) {
      return callback(new Error('Разрешены только JPG, PNG, WEBP и AVIF'));
    }
    callback(null, true);
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Повторите позже' }
});

async function destroyIfUnused(publicId) {
  if (!publicId) return;
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM product_images WHERE public_id = $1', [publicId]);
  if (rows[0].count === 0) {
    try {
      await destroyImage(publicId);
    } catch (error) {
      console.error('Cloudinary cleanup failed:', publicId, error.message);
    }
  }
}

router.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const { rows } = await pool.query('SELECT * FROM admin_users WHERE email = $1 LIMIT 1', [email]);
    const admin = rows[0];
    const isValid = admin ? await bcrypt.compare(password, admin.password_hash) : false;

    if (!isValid) return res.status(401).json({ error: 'Неверный email или пароль' });

    const token = jwt.sign(
      { sub: admin.id, email: admin.email, role: admin.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    res.json({
      token,
      admin: { id: admin.id, email: admin.email, role: admin.role }
    });
  } catch (error) {
    next(error);
  }
});

router.use(requireAdmin);

router.get('/me', (req, res) => {
  res.json({ id: req.admin.sub, email: req.admin.email, role: req.admin.role });
});

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [products, stock, orders, revenue] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS value FROM products WHERE status <> 'archived'"),
      pool.query("SELECT COALESCE(SUM(stock), 0)::int AS value FROM products WHERE status = 'published'"),
      pool.query("SELECT COUNT(*)::int AS value FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'"),
      pool.query("SELECT COALESCE(SUM(total_amount_cents), 0)::bigint AS value FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'")
    ]);

    res.json({
      products: products.rows[0].value,
      stock: stock.rows[0].value,
      orders30d: orders.rows[0].value,
      revenue30d: Number(revenue.rows[0].value) / 100,
      currency: 'EUR',
      cloudinaryConfigured
    });
  } catch (error) {
    next(error);
  }
});

router.get('/products', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || 'all');
    const category = String(req.query.category || 'all');
    const values = [];
    const where = [];

    if (search) {
      values.push(`%${search}%`);
      where.push(`(p.title ILIKE $${values.length} OR p.brand ILIKE $${values.length} OR p.sku ILIKE $${values.length})`);
    }
    if (status !== 'all') {
      values.push(status);
      where.push(`p.status = $${values.length}`);
    }
    if (category !== 'all') {
      values.push(category);
      where.push(`p.category = $${values.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM products p ${whereSql}`, values);

    values.push(limit, offset);
    const { rows } = await pool.query(
      `${productSelect}
       ${whereSql}
       ${productGroupBy}
       ORDER BY p.updated_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    res.json({
      items: rows.map(mapProductRow),
      page,
      limit,
      total: countResult.rows[0].total,
      pages: Math.max(1, Math.ceil(countResult.rows[0].total / limit))
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/products/bulk/status', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).slice(0, 100) : [];
    const status = String(req.body.status || '');
    if (!ids.length) return res.status(400).json({ error: 'Не выбраны товары' });
    if (!['draft', 'published', 'archived'].includes(status)) return res.status(400).json({ error: 'Некорректный статус' });

    const { rowCount } = await pool.query(
      'UPDATE products SET status = $1, updated_at = NOW() WHERE id = ANY($2::text[])',
      [status, ids]
    );
    res.json({ ok: true, updated: rowCount });
  } catch (error) {
    next(error);
  }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    const product = await fetchProductById(pool, req.params.id, true);
    if (!product) return res.status(404).json({ error: 'Товар не найден' });
    res.json(product);
  } catch (error) {
    next(error);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const product = normalizeProduct(req.body);
    const errors = validateProduct(product);
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

    await withTransaction(async (client) => {
      await ensureUniqueFields(client, product);
      await client.query(
        `INSERT INTO products (
          id, sku, slug, title, brand, gender, concentration, volume_ml,
          price_cents, compare_at_price_cents, currency, stock, image_tone,
          description, category, status, featured, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        )`,
        [
          product.id, product.sku, product.slug, product.title, product.brand,
          product.gender, product.concentration, product.volumeMl,
          product.priceCents, product.compareAtPriceCents, product.currency,
          product.stock, product.imageTone, product.description, product.category,
          product.status, product.featured, product.sortOrder
        ]
      );
      await replaceNotes(client, product);
      await replaceImages(client, product);
    });

    const created = await fetchProductById(pool, product.id, true);
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.patch('/products/:id', async (req, res, next) => {
  try {
    const existing = await fetchProductById(pool, req.params.id, true);
    if (!existing) return res.status(404).json({ error: 'Товар не найден' });

    const product = normalizeProduct(req.body, existing);
    const errors = validateProduct(product);
    if (errors.length) return res.status(400).json({ error: errors[0], details: errors });

    const removedPublicIds = await withTransaction(async (client) => {
      await ensureUniqueFields(client, product, product.id);
      await client.query(
        `UPDATE products SET
          sku = $2, slug = $3, title = $4, brand = $5, gender = $6,
          concentration = $7, volume_ml = $8, price_cents = $9,
          compare_at_price_cents = $10, currency = $11, stock = $12,
          image_tone = $13, description = $14, category = $15, status = $16,
          featured = $17, sort_order = $18, updated_at = NOW()
        WHERE id = $1`,
        [
          product.id, product.sku, product.slug, product.title, product.brand,
          product.gender, product.concentration, product.volumeMl,
          product.priceCents, product.compareAtPriceCents, product.currency,
          product.stock, product.imageTone, product.description, product.category,
          product.status, product.featured, product.sortOrder
        ]
      );
      await replaceNotes(client, product);
      return replaceImages(client, product);
    });

    await Promise.all(removedPublicIds.map(destroyIfUnused));
    res.json(await fetchProductById(pool, product.id, true));
  } catch (error) {
    next(error);
  }
});

router.post('/products/:id/duplicate', async (req, res, next) => {
  try {
    const existing = await fetchProductById(pool, req.params.id, true);
    if (!existing) return res.status(404).json({ error: 'Товар не найден' });

    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const duplicate = normalizeProduct({
      ...existing,
      id: undefined,
      sku: `${existing.sku}-COPY-${suffix}`,
      slug: `${existing.slug}-copy-${suffix.toLowerCase()}`,
      title: `${existing.title} — копия`,
      status: 'draft',
      images: existing.images.map((image) => ({ ...image, id: undefined, isPrimary: image.isPrimary }))
    });

    await withTransaction(async (client) => {
      await ensureUniqueFields(client, duplicate);
      await client.query(
        `INSERT INTO products (
          id, sku, slug, title, brand, gender, concentration, volume_ml,
          price_cents, compare_at_price_cents, currency, stock, image_tone,
          description, category, status, featured, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          duplicate.id, duplicate.sku, duplicate.slug, duplicate.title, duplicate.brand,
          duplicate.gender, duplicate.concentration, duplicate.volumeMl,
          duplicate.priceCents, duplicate.compareAtPriceCents, duplicate.currency,
          duplicate.stock, duplicate.imageTone, duplicate.description, duplicate.category,
          duplicate.status, duplicate.featured, duplicate.sortOrder
        ]
      );
      await replaceNotes(client, duplicate);
      await replaceImages(client, duplicate);
    });

    res.status(201).json(await fetchProductById(pool, duplicate.id, true));
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE products SET status = 'archived', updated_at = NOW() WHERE id = $1",
      [req.params.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Товар не найден' });
    res.json({ ok: true, archivedId: req.params.id });
  } catch (error) {
    next(error);
  }
});

router.post('/uploads', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл изображения не получен' });
    const result = await uploadBuffer(req.file.buffer);
    res.status(201).json({
      id: `img_${crypto.randomUUID()}`,
      url: result.secure_url,
      publicId: result.public_id,
      altText: '',
      position: 0,
      isPrimary: false,
      width: result.width,
      height: result.height,
      format: result.format
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/uploads', async (req, res, next) => {
  try {
    const publicId = String(req.body.publicId || '').trim();
    if (!publicId) return res.status(400).json({ error: 'publicId обязателен' });
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM product_images WHERE public_id = $1', [publicId]);
    if (rows[0].count > 0) return res.status(409).json({ error: 'Изображение используется товаром' });
    await destroyImage(publicId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
