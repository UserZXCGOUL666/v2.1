const fs = require('fs');
const path = require('path');
const { pool, withTransaction } = require('../src/db');
const {
  normalizeProduct,
  ensureUniqueFields,
  replaceNotes,
  replaceImages
} = require('../src/productService');

async function main() {
  const filePath = path.join(__dirname, '..', 'data', 'products.json');
  if (!fs.existsSync(filePath)) {
    console.log('Legacy products.json was not found. Nothing to import.');
    return;
  }

  const legacyProducts = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let imported = 0;
  let skipped = 0;

  for (const source of legacyProducts) {
    const existing = await pool.query('SELECT id FROM products WHERE id = $1 LIMIT 1', [source.id]);
    if (existing.rows.length) {
      skipped += 1;
      continue;
    }

    const product = normalizeProduct({
      ...source,
      sku: `LEGACY-${String(source.id || imported + 1).replace(/[^a-z0-9]/gi, '-').toUpperCase()}`,
      slug: `${source.brand}-${source.title}`,
      currency: source.currency === '€' ? 'EUR' : source.currency,
      status: 'published',
      featured: source.category === 'hit',
      sortOrder: imported,
      images: []
    });

    await withTransaction(async (client) => {
      await ensureUniqueFields(client, product);
      await client.query(
        `INSERT INTO products (
          id, sku, slug, title, brand, gender, concentration, volume_ml,
          price_cents, compare_at_price_cents, currency, stock, image_tone,
          description, category, status, featured, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
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
    imported += 1;
  }

  console.log(`Legacy import completed. Imported: ${imported}; skipped: ${skipped}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
