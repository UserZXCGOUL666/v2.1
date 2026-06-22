export type Gender = 'male' | 'female' | 'unisex';
export type Concentration = 'EDT' | 'EDP' | 'Parfum';
export type PaymentMethod = 'cash_on_delivery' | 'bank_transfer';
export type DeliveryMethod = 'delivery' | 'pickup';
export type Category = 'new' | 'hit' | 'sale' | 'classic';
export type ProductSortBy = 'popular' | 'newest' | 'price_asc' | 'price_desc';
export type PriceBucket = 'all' | 'under_80' | '80_120' | 'over_120';

export interface ProductImage {
  id: string;
  url: string;
  publicId: string;
  altText: string;
  position: number;
  isPrimary: boolean;
}

export interface Product {
  id: string;
  title: string;
  brand: string;
  gender: Gender;
  concentration: Concentration;
  volumeMl: number;
  price: number;
  oldPrice?: number;
  currency: string;
  stock: number;
  imageTone: string;
  imageUrl?: string;
  images?: ProductImage[];
  description: string;
  notesTop: string[];
  notesMiddle: string[];
  notesBase: string[];
  category: Category;
  status?: 'draft' | 'published' | 'archived';
  featured?: boolean;
  sortOrder?: number;
}

export interface ProductFilters {
  search: string;
  category: 'all' | Category;
  brand: 'all' | string;
  inStockOnly: boolean;
  priceBucket: PriceBucket;
  sortBy: ProductSortBy;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface CheckoutForm {
  customerName: string;
  phone: string;
  city: string;
  address: string;
  comment: string;
  deliveryMethod: DeliveryMethod;
  paymentMethod: PaymentMethod;
}

export interface CreateOrderPayload {
  customer: CheckoutForm;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  initData: string;
}

export interface CreateOrderResponse {
  orderId: string;
  totalAmount: number;
  currency: string;
  status: 'created';
}
