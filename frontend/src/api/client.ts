import { mockProducts } from '../data/mockProducts';
import type {
  Category,
  CreateOrderPayload,
  CreateOrderResponse,
  PriceBucket,
  Product,
  ProductFilters,
  ProductSortBy
} from '../types/shop';

const API_URL = import.meta.env.VITE_API_URL ?? '';
const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

const categoryPriority: Record<Category, number> = {
  hit: 0,
  new: 1,
  sale: 2,
  classic: 3
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function buildQuery(filters: ProductFilters): string {
  const params = new URLSearchParams();

  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.brand !== 'all') params.set('brand', filters.brand);
  if (filters.inStockOnly) params.set('inStock', 'true');
  if (filters.priceBucket !== 'all') params.set('priceBucket', filters.priceBucket);
  params.set('sortBy', filters.sortBy);

  return params.toString();
}

function matchesPriceBucket(product: Product, priceBucket: PriceBucket): boolean {
  switch (priceBucket) {
    case 'under_80':
      return product.price < 80;
    case '80_120':
      return product.price >= 80 && product.price <= 120;
    case 'over_120':
      return product.price > 120;
    default:
      return true;
  }
}

function sortProducts(products: Product[], sortBy: ProductSortBy): Product[] {
  return [...products].sort((a, b) => {
    switch (sortBy) {
      case 'price_asc':
        return a.price - b.price;
      case 'price_desc':
        return b.price - a.price;
      case 'newest':
        return Number(b.category === 'new') - Number(a.category === 'new') || a.title.localeCompare(b.title);
      case 'popular':
      default:
        return categoryPriority[a.category] - categoryPriority[b.category] || b.stock - a.stock;
    }
  });
}

function filterMockProducts(filters: ProductFilters): Product[] {
  const search = filters.search.trim().toLowerCase();

  const filtered = mockProducts.filter((product) => {
    const matchesSearch =
      !search ||
      product.title.toLowerCase().includes(search) ||
      product.brand.toLowerCase().includes(search) ||
      product.description.toLowerCase().includes(search) ||
      product.notesTop.join(' ').toLowerCase().includes(search) ||
      product.notesMiddle.join(' ').toLowerCase().includes(search) ||
      product.notesBase.join(' ').toLowerCase().includes(search);

    const matchesCategory = filters.category === 'all' || product.category === filters.category;
    const matchesBrand = filters.brand === 'all' || product.brand === filters.brand;
    const matchesStock = !filters.inStockOnly || product.stock > 0;
    const matchesPrice = matchesPriceBucket(product, filters.priceBucket);

    return matchesSearch && matchesCategory && matchesBrand && matchesStock && matchesPrice;
  });

  return sortProducts(filtered, filters.sortBy);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const productsApi = {
  async getProducts(filters: ProductFilters): Promise<Product[]> {
    if (USE_MOCK) {
      await wait(250);
      return filterMockProducts(filters);
    }

    const query = buildQuery(filters);
    return request<Product[]>(`/products${query ? `?${query}` : ''}`);
  },

  async getProductById(id: string): Promise<Product | null> {
    if (USE_MOCK) {
      await wait(150);
      return mockProducts.find((product) => product.id === id) ?? null;
    }

    return request<Product>(`/products/${id}`);
  }
};

export const ordersApi = {
  async createOrder(payload: CreateOrderPayload): Promise<CreateOrderResponse> {
    if (USE_MOCK) {
      await wait(500);

      const totalAmount = payload.items.reduce((sum, item) => {
        const product = mockProducts.find((current) => current.id === item.productId);
        return sum + (product?.price ?? 0) * item.quantity;
      }, 0);

      return {
        orderId: `M-${Math.floor(100000 + Math.random() * 900000)}`,
        totalAmount,
        currency: '€',
        status: 'created'
      };
    }

    return request<CreateOrderResponse>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};
