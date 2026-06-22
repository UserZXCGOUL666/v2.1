import type {
  DashboardStats,
  Product,
  ProductDraft,
  ProductImage,
  ProductListResponse,
  ProductStatus
} from './types';

const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TOKEN_KEY = 'perfume-admin-token-v1';

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `Ошибка API: ${response.status}`;
    try {
      const payload = await response.json() as { error?: string };
      message = payload.error || message;
    } catch {
      // Response may not contain JSON.
    }
    if (response.status === 401) clearToken();
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  async login(email: string, password: string): Promise<{ token: string; admin: { email: string } }> {
    const result = await request<{ token: string; admin: { email: string } }>('/api/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    saveToken(result.token);
    return result;
  },

  me(): Promise<{ email: string }> {
    return request('/api/admin/me');
  },

  dashboard(): Promise<DashboardStats> {
    return request('/api/admin/dashboard');
  },

  products(params: { search: string; status: string; category: string; page: number }): Promise<ProductListResponse> {
    const query = new URLSearchParams({
      search: params.search,
      status: params.status,
      category: params.category,
      page: String(params.page),
      limit: '25'
    });
    return request(`/api/admin/products?${query}`);
  },

  createProduct(draft: ProductDraft): Promise<Product> {
    return request('/api/admin/products', { method: 'POST', body: JSON.stringify(draft) });
  },

  updateProduct(id: string, draft: ProductDraft): Promise<Product> {
    return request(`/api/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(draft) });
  },

  duplicateProduct(id: string): Promise<Product> {
    return request(`/api/admin/products/${id}/duplicate`, { method: 'POST' });
  },

  archiveProduct(id: string): Promise<{ ok: boolean }> {
    return request(`/api/admin/products/${id}`, { method: 'DELETE' });
  },

  bulkStatus(ids: string[], status: ProductStatus): Promise<{ ok: boolean; updated: number }> {
    return request('/api/admin/products/bulk/status', {
      method: 'PATCH',
      body: JSON.stringify({ ids, status })
    });
  },

  uploadImage(file: File): Promise<ProductImage> {
    const form = new FormData();
    form.append('image', file);
    return request('/api/admin/uploads', { method: 'POST', body: form });
  },

  deleteUnusedUpload(publicId: string): Promise<{ ok: boolean }> {
    return request('/api/admin/uploads', {
      method: 'DELETE',
      body: JSON.stringify({ publicId })
    });
  }
};
