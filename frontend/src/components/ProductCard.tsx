import { formatMoney } from '../lib/money';
import type { Product } from '../types/shop';
import { ProductBottle } from './ProductBottle';

interface ProductCardProps {
  product: Product;
  onOpen: (product: Product) => void;
  onAddToCart: (product: Product) => void;
}

const categoryLabels = {
  new: 'Новинка',
  hit: 'Хит',
  sale: 'Sale',
  classic: 'Classic'
};

export function ProductCard({ product, onOpen, onAddToCart }: ProductCardProps) {
  const isOutOfStock = product.stock <= 0;

  return (
    <article className="product-card">
      <button className="product-card-media" type="button" onClick={() => onOpen(product)}>
        <ProductBottle product={product} />
        <span className={`badge badge-${product.category}`}>{categoryLabels[product.category]}</span>
      </button>

      <div className="product-card-body">
        <button className="text-button product-title" type="button" onClick={() => onOpen(product)}>
          {product.title}
        </button>
        <div className="muted small-text">{product.brand} · {product.concentration} · {product.volumeMl} мл</div>
        <p className="product-description">{product.description}</p>
        <div className="price-row">
          <strong>{formatMoney(product.price, product.currency)}</strong>
          {product.oldPrice && <span className="old-price">{formatMoney(product.oldPrice, product.currency)}</span>}
        </div>
        <div className="product-actions">
          <button className="ghost-button inline-button" type="button" onClick={() => onOpen(product)}>
            Подробнее
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={isOutOfStock}
            onClick={() => onAddToCart(product)}
          >
            {isOutOfStock ? 'Нет' : 'Купить'}
          </button>
        </div>
      </div>
    </article>
  );
}
