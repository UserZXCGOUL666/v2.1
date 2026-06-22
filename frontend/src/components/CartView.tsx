import { formatMoney } from '../lib/money';
import type { CartItem } from '../types/shop';
import { ProductBottle } from './ProductBottle';

interface CartViewProps {
  items: CartItem[];
  totalAmount: number;
  currency: string;
  onBack: () => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
}

export function CartView({
  items,
  totalAmount,
  currency,
  onBack,
  onIncrease,
  onDecrease,
  onRemove,
  onCheckout
}: CartViewProps) {
  return (
    <main className="page">
      <button className="ghost-button" type="button" onClick={onBack}>
        ← В каталог
      </button>

      <header className="section-header">
        <h1>Корзина</h1>
        <span className="muted">{items.length} поз.</span>
      </header>

      {items.length === 0 ? (
        <section className="empty-state">
          <h2>Корзина пустая</h2>
          <p>Добавь хотя бы один аромат, иначе оформлять нечего.</p>
          <button className="primary-button" type="button" onClick={onBack}>
            Перейти в каталог
          </button>
        </section>
      ) : (
        <>
          <div className="cart-list">
            {items.map(({ product, quantity }) => (
              <article className="cart-item" key={product.id}>
                <ProductBottle product={product} />
                <div className="cart-item-info">
                  <strong>{product.title}</strong>
                  <span className="muted small-text">
                    {product.brand} · {product.volumeMl} мл
                  </span>
                  <span>{formatMoney(product.price * quantity, product.currency)}</span>
                </div>
                <div className="quantity-controls">
                  <button type="button" onClick={() => onDecrease(product.id)}>
                    −
                  </button>
                  <span>{quantity}</span>
                  <button type="button" onClick={() => onIncrease(product.id)}>
                    +
                  </button>
                </div>
                <button className="remove-button" type="button" onClick={() => onRemove(product.id)}>
                  ×
                </button>
              </article>
            ))}
          </div>

          <section className="order-summary">
            <div>
              <span className="muted">Итого</span>
              <strong>{formatMoney(totalAmount, currency)}</strong>
            </div>
            <button className="primary-button" type="button" onClick={onCheckout}>
              Оформить заказ
            </button>
          </section>
        </>
      )}
    </main>
  );
}
