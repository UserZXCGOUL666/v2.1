import type { Category, ProductFilters as ProductFiltersState } from '../types/shop';

interface ProductFiltersProps {
  filters: ProductFiltersState;
  brands: string[];
  onChange: (filters: ProductFiltersState) => void;
}

const categoryLabels: Array<{ value: 'all' | Category; label: string }> = [
  { value: 'all', label: 'Все категории' },
  { value: 'hit', label: 'Хиты' },
  { value: 'new', label: 'Новинки' },
  { value: 'sale', label: 'Скидки' },
  { value: 'classic', label: 'Классика' }
];

export function ProductFilters({ filters, brands, onChange }: ProductFiltersProps) {
  return (
    <section className="filters-panel" aria-label="Фильтры каталога">
      <input
        className="input"
        value={filters.search}
        placeholder="Поиск: бренд, аромат, ноты"
        onChange={(event) => onChange({ ...filters, search: event.target.value })}
      />

      <div className="filter-row">
        <select
          className="input"
          value={filters.category}
          onChange={(event) => onChange({ ...filters, category: event.target.value as ProductFiltersState['category'] })}
        >
          {categoryLabels.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>

        <select
          className="input"
          value={filters.brand}
          onChange={(event) => onChange({ ...filters, brand: event.target.value })}
        >
          <option value="all">Все бренды</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-row">
        <select
          className="input"
          value={filters.priceBucket}
          onChange={(event) => onChange({ ...filters, priceBucket: event.target.value as ProductFiltersState['priceBucket'] })}
        >
          <option value="all">Любая цена</option>
          <option value="under_80">До 80 €</option>
          <option value="80_120">80–120 €</option>
          <option value="over_120">От 120 €</option>
        </select>

        <select
          className="input"
          value={filters.sortBy}
          onChange={(event) => onChange({ ...filters, sortBy: event.target.value as ProductFiltersState['sortBy'] })}
        >
          <option value="popular">По популярности</option>
          <option value="newest">По новизне</option>
          <option value="price_asc">Цена: ниже</option>
          <option value="price_desc">Цена: выше</option>
        </select>
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={filters.inStockOnly}
          onChange={(event) => onChange({ ...filters, inStockOnly: event.target.checked })}
        />
        Только в наличии
      </label>
    </section>
  );
}
