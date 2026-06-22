import type { Product } from '../types/shop';

interface ProductBottleProps {
  product: Product;
  size?: 'small' | 'large';
}

export function ProductBottle({ product, size = 'small' }: ProductBottleProps) {
  const initials = product.brand
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (product.imageUrl) {
    return (
      <div className={`product-photo product-photo-${size}`}>
        <img src={product.imageUrl} alt={product.title} loading="lazy" />
      </div>
    );
  }

  return (
    <div className={`bottle bottle-${size} tone-${product.imageTone}`} aria-label={product.title}>
      <div className="bottle-cap" />
      <div className="bottle-glass">
        <span>{initials}</span>
      </div>
    </div>
  );
}
