export function formatMoney(amount: number, currency = 'EUR'): string {
  const normalizedCurrency = currency === '€' ? 'EUR' : currency;
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
