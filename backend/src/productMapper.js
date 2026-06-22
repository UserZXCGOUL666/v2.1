function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function centsToAmount(value) {
  return toNumber(value) / 100;
}

function mapImage(row) {
  return {
    id: row.id,
    url: row.url,
    publicId: row.public_id,
    altText: row.alt_text || '',
    position: Number(row.position || 0),
    isPrimary: Boolean(row.is_primary)
  };
}

function mapProductRow(row) {
  const images = Array.isArray(row.images)
    ? row.images.filter(Boolean).map(mapImage).sort((a, b) => a.position - b.position)
    : [];
  const notes = Array.isArray(row.notes)
    ? row.notes.filter(Boolean).sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
    : [];
  const notesByTier = { top: [], middle: [], base: [] };

  for (const note of notes) {
    if (notesByTier[note.tier]) notesByTier[note.tier].push(note.name);
  }

  const primaryImage = images.find((image) => image.isPrimary) || images[0] || null;

  return {
    id: row.id,
    sku: row.sku,
    slug: row.slug,
    title: row.title,
    brand: row.brand,
    gender: row.gender,
    concentration: row.concentration,
    volumeMl: Number(row.volume_ml),
    price: centsToAmount(row.price_cents),
    oldPrice: row.compare_at_price_cents == null ? undefined : centsToAmount(row.compare_at_price_cents),
    currency: row.currency,
    stock: Number(row.stock),
    imageTone: row.image_tone || 'amber',
    imageUrl: primaryImage?.url,
    images,
    description: row.description || '',
    notesTop: notesByTier.top,
    notesMiddle: notesByTier.middle,
    notesBase: notesByTier.base,
    category: row.category,
    status: row.status,
    featured: Boolean(row.featured),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const productSelect = `
  SELECT
    p.*,
    COALESCE(
      json_agg(DISTINCT jsonb_build_object(
        'id', pi.id,
        'url', pi.url,
        'public_id', pi.public_id,
        'alt_text', pi.alt_text,
        'position', pi.position,
        'is_primary', pi.is_primary
      )) FILTER (WHERE pi.id IS NOT NULL),
      '[]'
    ) AS images,
    COALESCE(
      json_agg(DISTINCT jsonb_build_object(
        'id', pn.id,
        'tier', pn.tier,
        'name', pn.name,
        'position', pn.position
      )) FILTER (WHERE pn.id IS NOT NULL),
      '[]'
    ) AS notes
  FROM products p
  LEFT JOIN product_images pi ON pi.product_id = p.id
  LEFT JOIN product_notes pn ON pn.product_id = p.id
`;

const productGroupBy = ' GROUP BY p.id ';

module.exports = { mapProductRow, productSelect, productGroupBy };
