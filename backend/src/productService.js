const crypto = require('crypto');
const slugify = require('slugify');
const { productSelect, productGroupBy, mapProductRow } = require('./productMapper');

const allowedGender = new Set(['male', 'female', 'unisex']);
const allowedConcentration = new Set(['EDT', 'EDP', 'Parfum']);
const allowedCategory = new Set(['new', 'hit', 'sale', 'classic']);
const allowedStatus = new Set(['draft', 'published', 'archived']);

function text(value, max = 10_000) {
  return String(value ?? '').trim().slice(0, max);
}

function integer(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function moneyToCents(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function cleanNotes(value) {
  const source = Array.isArray(value) ? value : String(value ?? '').split(',');
  return source.map((item) => text(item, 120)).filter(Boolean).slice(0, 30);
}

function cleanImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => ({
      id: text(item.id, 100) || `img_${crypto.randomUUID()}`,
      url: text(item.url, 3000),
      publicId: text(item.publicId, 1000),
      altText: text(item.altText, 250),
      position: integer(item.position, index),
      isPrimary: Boolean(item.isPrimary)
    }))
    .filter((item) => item.url && item.publicId)
    .slice(0, 12);
}

function normalizeProduct(input, existing = null) {
  const source = existing || {};
  const title = text(input.title ?? source.title, 180);
  const brand = text(input.brand ?? source.brand, 180);
  const requestedSlug = text(input.slug ?? source.slug, 180);
  const slugBase = requestedSlug || `${brand}-${title}`;

  return {
    id: source.id || text(input.id, 100) || `prd_${crypto.randomUUID()}`,
    sku: text(input.sku ?? source.sku, 100).toUpperCase(),
    slug: slugify(slugBase, { lower: true, strict: true, locale: 'ru' }).slice(0, 180),
    title,
    brand,
    gender: allowedGender.has(input.gender) ? input.gender : source.gender || 'unisex',
    concentration: allowedConcentration.has(input.concentration) ? input.concentration : source.concentration || 'EDP',
    volumeMl: Math.max(1, integer(input.volumeMl ?? source.volumeMl, 50)),
    priceCents: Math.max(0, moneyToCents(input.price ?? source.price)),
    compareAtPriceCents:
      input.oldPrice === '' || input.oldPrice === null || input.oldPrice === undefined
        ? null
        : Math.max(0, moneyToCents(input.oldPrice)),
    currency: text(input.currency ?? source.currency ?? 'EUR', 3).toUpperCase() || 'EUR',
    stock: Math.max(0, integer(input.stock ?? source.stock, 0)),
    imageTone: text(input.imageTone ?? source.imageTone ?? 'amber', 30) || 'amber',
    description: text(input.description ?? source.description, 20_000),
    category: allowedCategory.has(input.category) ? input.category : source.category || 'new',
    status: allowedStatus.has(input.status) ? input.status : source.status || 'draft',
    featured: input.featured === undefined ? Boolean(source.featured) : Boolean(input.featured),
    sortOrder: integer(input.sortOrder ?? source.sortOrder, 0),
    notesTop: cleanNotes(input.notesTop ?? source.notesTop),
    notesMiddle: cleanNotes(input.notesMiddle ?? source.notesMiddle),
    notesBase: cleanNotes(input.notesBase ?? source.notesBase),
    images: cleanImages(input.images ?? source.images)
  };
}

function validateProduct(product) {
  const errors = [];
  if (!product.title) errors.push('Введите название товара');
  if (!product.brand) errors.push('Введите бренд');
  if (!product.sku) errors.push('Введите артикул SKU');
  if (!product.slug) errors.push('Не удалось сформировать URL товара');
  if (product.compareAtPriceCents != null && product.compareAtPriceCents < product.priceCents) {
    errors.push('Старая цена не должна быть меньше текущей');
  }
  return errors;
}

async function ensureUniqueFields(client, product, excludeId = null) {
  const { rows } = await client.query(
    `SELECT sku, slug FROM products
     WHERE (sku = $1 OR slug = $2) AND ($3::text IS NULL OR id <> $3)
     LIMIT 1`,
    [product.sku, product.slug, excludeId]
  );
  if (rows.length) {
    if (rows[0].sku === product.sku) throw Object.assign(new Error('Такой SKU уже существует'), { statusCode: 409 });
    throw Object.assign(new Error('Такой URL товара уже существует'), { statusCode: 409 });
  }
}

async function replaceNotes(client, product) {
  await client.query('DELETE FROM product_notes WHERE product_id = $1', [product.id]);
  const tiers = [
    ['top', product.notesTop],
    ['middle', product.notesMiddle],
    ['base', product.notesBase]
  ];

  for (const [tier, notes] of tiers) {
    for (let index = 0; index < notes.length; index += 1) {
      await client.query(
        'INSERT INTO product_notes (product_id, tier, name, position) VALUES ($1, $2, $3, $4)',
        [product.id, tier, notes[index], index]
      );
    }
  }
}

async function replaceImages(client, product) {
  const previous = await client.query('SELECT public_id FROM product_images WHERE product_id = $1', [product.id]);
  const previousPublicIds = previous.rows.map((row) => row.public_id);

  await client.query('DELETE FROM product_images WHERE product_id = $1', [product.id]);
  const requestedPrimaryIndex = product.images.findIndex((image) => image.isPrimary);
  const primaryIndex = requestedPrimaryIndex >= 0 ? requestedPrimaryIndex : 0;

  for (let index = 0; index < product.images.length; index += 1) {
    const image = product.images[index];
    const isPrimary = index === primaryIndex;
    await client.query(
      `INSERT INTO product_images
       (id, product_id, url, public_id, alt_text, position, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [image.id, product.id, image.url, image.publicId, image.altText, index, isPrimary]
    );
  }

  const nextPublicIds = new Set(product.images.map((image) => image.publicId));
  return previousPublicIds.filter((publicId) => !nextPublicIds.has(publicId));
}

async function fetchProductById(client, id, includeArchived = true) {
  const params = [id];
  const statusClause = includeArchived ? '' : " AND p.status = 'published'";
  const { rows } = await client.query(
    `${productSelect} WHERE p.id = $1 ${statusClause} ${productGroupBy}`,
    params
  );
  return rows[0] ? mapProductRow(rows[0]) : null;
}

module.exports = {
  normalizeProduct,
  validateProduct,
  ensureUniqueFields,
  replaceNotes,
  replaceImages,
  fetchProductById
};
