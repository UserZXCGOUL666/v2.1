import { useState } from 'react';
import { formatMoney } from '../lib/money';
import type { CheckoutForm } from '../types/shop';

interface CheckoutViewProps {
  totalAmount: number;
  currency: string;
  isSubmitting: boolean;
  onBack: () => void;
  onSubmit: (form: CheckoutForm) => void;
}

const initialForm: CheckoutForm = {
  customerName: '',
  phone: '',
  city: '',
  address: '',
  comment: '',
  deliveryMethod: 'delivery',
  paymentMethod: 'cash_on_delivery'
};

export function CheckoutView({ totalAmount, currency, isSubmitting, onBack, onSubmit }: CheckoutViewProps) {
  const [form, setForm] = useState<CheckoutForm>(initialForm);

  const isValid = form.customerName.trim() && form.phone.trim() && form.city.trim() &&
    (form.deliveryMethod === 'pickup' || form.address.trim());

  return (
    <main className="page checkout-page">
      <button className="ghost-button" type="button" onClick={onBack}>
        ← В корзину
      </button>

      <header className="section-header">
        <h1>Оформление</h1>
        <strong>{formatMoney(totalAmount, currency)}</strong>
      </header>

      <form
        className="checkout-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (isValid) onSubmit(form);
        }}
      >
        <label>
          Имя
          <input
            className="input"
            value={form.customerName}
            placeholder="Иван"
            onChange={(event) => setForm({ ...form, customerName: event.target.value })}
          />
        </label>

        <label>
          Телефон
          <input
            className="input"
            value={form.phone}
            placeholder="+36..."
            inputMode="tel"
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </label>

        <label>
          Город
          <input
            className="input"
            value={form.city}
            placeholder="Budapest"
            onChange={(event) => setForm({ ...form, city: event.target.value })}
          />
        </label>

        <label>
          Способ доставки
          <select
            className="input"
            value={form.deliveryMethod}
            onChange={(event) => setForm({ ...form, deliveryMethod: event.target.value as CheckoutForm['deliveryMethod'] })}
          >
            <option value="delivery">Доставка</option>
            <option value="pickup">Самовывоз</option>
          </select>
        </label>

        {form.deliveryMethod === 'delivery' && (
          <label>
            Адрес
            <input
              className="input"
              value={form.address}
              placeholder="Улица, дом, квартира"
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </label>
        )}

        <label>
          Оплата
          <select
            className="input"
            value={form.paymentMethod}
            onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as CheckoutForm['paymentMethod'] })}
          >
            <option value="cash_on_delivery">При получении</option>
            <option value="bank_transfer">Переводом после подтверждения</option>
          </select>
        </label>

        <label>
          Комментарий
          <textarea
            className="input textarea"
            value={form.comment}
            placeholder="Например: доставить после 18:00"
            onChange={(event) => setForm({ ...form, comment: event.target.value })}
          />
        </label>

        <button className="primary-button large-button" type="submit" disabled={!isValid || isSubmitting}>
          {isSubmitting ? 'Создаём заказ...' : 'Подтвердить заказ'}
        </button>
      </form>
    </main>
  );
}
