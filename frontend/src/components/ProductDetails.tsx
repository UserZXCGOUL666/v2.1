import { formatMoney } from '../lib/money';
import type { Product } from '../types/shop';
import { ProductBottle } from './ProductBottle';

interface ProductDetailsProps {
  product: Product;
  onBack: () => void;
  onAddToCart: (product: Product) => void;
}

const genderLabels = {
  male: 'Мужской',
  female: 'Женский',
  unisex: 'Унисекс'
};

export function ProductDetails({ product, onBack, onAddToCart }: ProductDetailsProps) {
  return (
    <main className="page product-details-page">
      <button className="ghost-button" type="button" onClick={onBack}>
        ← В каталог
      </button>

      <section className="details-hero">
        <ProductBottle product={product} size="large" />
        <div>
          <div className="muted">{product.brand}</div>
          <h1>{product.title}</h1>
          <div className="product-meta details-meta">
            <span>{genderLabels[product.gender]}</span>
            <span>{product.concentration}</span>
            <span>{product.volumeMl} мл</span>
          </div>
          <div className="details-price">
            <strong>{formatMoney(product.price, product.currency)}</strong>
            {product.oldPrice && <span className="old-price">{formatMoney(product.oldPrice, product.currency)}</span>}
          </div>
          <p>{product.description}</p>
          <p className={product.stock > 0 ? 'stock-good' : 'stock-empty'}>
            {product.stock > 0 ? `В наличии: ${product.stock} шт.` : 'Нет в наличии'}
          </p>
        </div>
      </section>

      <section className="notes-grid">
        <div>
          <h3>Верхние ноты</h3>
          <p>{product.notesTop.join(', ')}</p>
        </div>
        <div>
          <h3>Средние ноты</h3>
          <p>{product.notesMiddle.join(', ')}</p>
        </div>
        <div>
          <h3>Базовые ноты</h3>
          <p>{product.notesBase.join(', ')}</p>
        </div>
      </section>

      <div className="sticky-action">
        <button
          className="primary-button full-width large-button"
          type="button"
          disabled={product.stock <= 0}
          onClick={() => onAddToCart(product)}
        >
          {product.stock <= 0 ? 'Нет в наличии' : 'Добавить в корзину'}
        </button>
      </div>
    </main>
  );
}
