export type ProductStatus = 'draft' | 'published' | 'archived';
export type ProductCategory = 'new' | 'hit' | 'sale' | 'classic';
export type Gender = 'male' | 'female' | 'unisex';
export type Concentration = 'EDT' | 'EDP' | 'Parfum';

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
  sku: string;
  slug: string;
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
  images: ProductImage[];
  description: string;
  notesTop: string[];
  notesMiddle: string[];
  notesBase: string[];
  category: ProductCategory;
  status: ProductStatus;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductDraft = Omit<Product, 'id' | 'imageUrl' | 'createdAt' | 'updatedAt'>;

export interface ProductListResponse {
  items: Product[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface DashboardStats {
  products: number;
  stock: number;
  orders30d: number;
  revenue30d: number;
  currency: string;
  cloudinaryConfigured: boolean;
}
