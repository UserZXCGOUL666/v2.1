const express = require('express');
const crypto = require('crypto');
const { pool, withTransaction } = require('../db');
const { productSelect, productGroupBy, mapProductRow } = require('../productMapper');
const { fetchProductById } = require('../productService');

const router = express.Router();

function priceBucketSql(bucket, values) {
  if (bucket === 'under_80') {
    values.push(8000);
    return `p.price_cents < $${values.length}`;
  }
  if (bucket === '80_120') {
    values.push(8000, 12000);
    return `p.price_cents BETWEEN $${values.length - 1} AND $${values.length}`;
  }
  if (bucket === 'over_120') {
    values.push(12000);
    return `p.price_cents > $${values.length}`;
  }
  return null;
}

router.get('/products', async (req, res, next) => {
  try {
    const values = [];
    const where = ["p.status = 'published'"];
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || 'all');
    const brand = String(req.query.brand || 'all');
    const inStock = String(req.query.inStock || '').toLowerCase() === 'true';
    const priceBucket = String(req.query.priceBucket || 'all');
    const sortBy = String(req.query.sortBy || 'popular');

    if (search) {
      values.push(`%${search}%`);
      where.push(`(
        p.title ILIKE $${values.length} OR
        p.brand ILIKE $${values.length} OR
        p.description ILIKE $${values.length} OR
        EXISTS (
          SELECT 1 FROM product_notes search_note
          WHERE search_note.product_id = p.id AND search_note.name ILIKE $${values.length}
        )
      )`);
    }
    if (category !== 'all') {
      values.push(category);
      where.push(`p.category = $${values.length}`);
    }
    if (brand !== 'all') {
      values.push(brand);
      where.push(`p.brand = $${values.length}`);
    }
    if (inStock) where.push('p.stock > 0');
    const priceSql = priceBucketSql(priceBucket, values);
    if (priceSql) where.push(priceSql);

    const orderBy = {
      price_asc: 'p.price_cents ASC, p.title ASC',
      price_desc: 'p.price_cents DESC, p.title ASC',
      newest: 'p.created_at DESC',
      popular: 'p.featured DESC, p.sort_order ASC, p.stock DESC, p.updated_at DESC'
    }[sortBy] || 'p.featured DESC, p.sort_order ASC, p.updated_at DESC';

    const { rows } = await pool.query(
      `${productSelect}
       WHERE ${where.join(' AND ')}
       ${productGroupBy}
       ORDER BY ${orderBy}`,
      values
    );

    res.json(rows.map(mapProductRow));
  } catch (error) {
    next(error);
  }
});

router.get('/products/:idOrSlug', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${productSelect}
       WHERE (p.id = $1 OR p.slug = $1) AND p.status = 'published'
       ${productGroupBy}`,
      [req.params.idOrSlug]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Товар не найден' });
    res.json(mapProductRow(rows[0]));
  } catch (error) {
    next(error);
  }
});

router.post('/orders', async (req, res, next) => {
  try {
    const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
    if (!rawItems.length) return res.status(400).json({ error: 'Заказ должен содержать хотя бы один товар' });

    const quantityByProduct = new Map();
    for (const item of rawItems) {
      const productId = String(item.productId || '').trim();
      if (!productId) continue;
      const quantity = Math.max(1, Math.trunc(Number(item.quantity) || 1));
      quantityByProduct.set(productId, (quantityByProduct.get(productId) || 0) + quantity);
    }
    const items = Array.from(quantityByProduct, ([productId, quantity]) => ({ productId, quantity }));
    if (!items.length) return res.status(400).json({ error: 'Заказ не содержит корректных товаров' });

    const result = await withTransaction(async (client) => {
      const orderItems = [];
      let totalAmountCents = 0;
      let currency = 'EUR';

      for (const item of items) {
        const product = await fetchProductById(client, item.productId, false);
        const quantity = item.quantity;
        if (!product) throw Object.assign(new Error('Один из товаров не найден или снят с публикации'), { statusCode: 400 });

        totalAmountCents += Math.round(product.price * 100) * quantity;
        currency = product.currency;
        orderItems.push({ product, quantity });
      }

      const customer = req.body.customer || {};
      const orderId = `ord_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await client.query(
        `INSERT INTO orders (
          id, status, customer_name, phone, city, address, comment,
          delivery_method, payment_method, telegram_user_id,
          total_amount_cents, currency
        ) VALUES ($1, 'created', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          orderId,
          String(customer.customerName || '').trim(),
          String(customer.phone || '').trim(),
          String(customer.city || '').trim(),
          String(customer.address || '').trim(),
          String(customer.comment || '').trim(),
          String(customer.deliveryMethod || 'delivery'),
          String(customer.paymentMethod || 'cash_on_delivery'),
          req.body.telegramUserId ? String(req.body.telegramUserId) : null,
          totalAmountCents,
          currency
        ]
      );

      for (const item of orderItems) {
        await client.query(
          `INSERT INTO order_items
           (order_id, product_id, title_snapshot, price_snapshot_cents, quantity)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.product.id, item.product.title, Math.round(item.product.price * 100), item.quantity]
        );
        const stockUpdate = await client.query(
          `UPDATE products
           SET stock = stock - $1, updated_at = NOW()
           WHERE id = $2 AND stock >= $1
           RETURNING stock`,
          [item.quantity, item.product.id]
        );
        if (!stockUpdate.rowCount) {
          throw Object.assign(new Error(`Недостаточно товара «${item.product.title}» на складе`), { statusCode: 409 });
        }
      }

      return { orderId, totalAmount: totalAmountCents / 100, currency, status: 'created' };
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
