import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, clearToken, getToken } from './api';
import type {
  Concentration,
  DashboardStats,
  Gender,
  Product,
  ProductCategory,
  ProductDraft,
  ProductImage,
  ProductListResponse,
  ProductStatus
} from './types';

const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL ?? 'http://localhost:5173';

const statusLabels: Record<ProductStatus, string> = {
  draft: 'Черновик',
  published: 'Опубликован',
  archived: 'Архив'
};

const categoryLabels: Record<ProductCategory, string> = {
  new: 'Новинка',
  hit: 'Хит',
  sale: 'Скидка',
  classic: 'Классика'
};

const genderLabels: Record<Gender, string> = {
  unisex: 'Унисекс',
  female: 'Женский',
  male: 'Мужской'
};

type EditorState = Omit<ProductDraft, 'notesTop' | 'notesMiddle' | 'notesBase'> & {
  notesTop: string;
  notesMiddle: string;
  notesBase: string;
};

function makeSku(): string {
  return `PF-${Date.now().toString().slice(-8)}`;
}

function emptyEditor(): EditorState {
  return {
    sku: makeSku(),
    slug: '',
    title: '',
    brand: '',
    gender: 'unisex',
    concentration: 'EDP',
    volumeMl: 50,
    price: 0,
    oldPrice: undefined,
    currency: 'EUR',
    stock: 0,
    imageTone: 'amber',
    images: [],
    description: '',
    notesTop: '',
    notesMiddle: '',
    notesBase: '',
    category: 'new',
    status: 'draft',
    featured: false,
    sortOrder: 0
  };
}

function productToEditor(product: Product): EditorState {
  return {
    sku: product.sku,
    slug: product.slug,
    title: product.title,
    brand: product.brand,
    gender: product.gender,
    concentration: product.concentration,
    volumeMl: product.volumeMl,
    price: product.price,
    oldPrice: product.oldPrice,
    currency: product.currency,
    stock: product.stock,
    imageTone: product.imageTone,
    images: product.images,
    description: product.description,
    notesTop: product.notesTop.join(', '),
    notesMiddle: product.notesMiddle.join(', '),
    notesBase: product.notesBase.join(', '),
    category: product.category,
    status: product.status,
    featured: product.featured,
    sortOrder: product.sortOrder
  };
}

function splitNotes(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function editorToDraft(editor: EditorState): ProductDraft {
  return {
    ...editor,
    notesTop: splitNotes(editor.notesTop),
    notesMiddle: splitNotes(editor.notesMiddle),
    notesBase: splitNotes(editor.notesBase),
    images: editor.images.map((image, index) => ({ ...image, position: index }))
  };
}

function formatMoney(amount: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function Login({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.login(email, password);
      onSuccess(result.admin.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">P</div>
        <span className="eyebrow">Защищённая зона</span>
        <h1>Perfume Admin</h1>
        <p>Управление ассортиментом, фотографиями, ценами и остатками.</p>
        <form onSubmit={submit} className="login-form">
          <label>
            Email администратора
            <input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Пароль
            <input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <div className="alert alert-error">{error}</div>}
          <button className="button button-primary button-large" disabled={loading} type="submit">
            {loading ? 'Проверка…' : 'Войти в панель'}
          </button>
        </form>
      </section>
    </main>
  );
}

function ProductEditor({
  product,
  onClose,
  onSaved
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const [editor, setEditor] = useState<EditorState>(() => product ? productToEditor(product) : emptyEditor());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const originalPublicIds = useMemo(() => new Set(product?.images.map((image) => image.publicId) ?? []), [product]);

  function setField<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setEditor((current) => ({ ...current, [key]: value }));
  }

  async function uploadImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    if (editor.images.length + files.length > 12) {
      setError('У одного товара может быть не более 12 изображений');
      return;
    }

    setUploading(true);
    setError('');
    try {
      const uploaded: ProductImage[] = [];
      for (const file of files) {
        const image = await api.uploadImage(file);
        uploaded.push(image);
      }
      setEditor((current) => {
        const next = [...current.images, ...uploaded];
        if (!next.some((image) => image.isPrimary) && next[0]) next[0] = { ...next[0], isPrimary: true };
        return { ...current, images: next };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить изображение');
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(index: number) {
    const image = editor.images[index];
    setEditor((current) => {
      const next = current.images.filter((_, currentIndex) => currentIndex !== index);
      if (image.isPrimary && next[0]) next[0] = { ...next[0], isPrimary: true };
      return { ...current, images: next };
    });

    if (!originalPublicIds.has(image.publicId)) {
      try {
        await api.deleteUnusedUpload(image.publicId);
      } catch {
        // The API will also clean unused images when a saved product is updated.
      }
    }
  }

  function setPrimary(index: number) {
    setEditor((current) => ({
      ...current,
      images: current.images.map((image, currentIndex) => ({ ...image, isPrimary: currentIndex === index }))
    }));
  }

  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= editor.images.length) return;
    setEditor((current) => {
      const images = [...current.images];
      [images[index], images[target]] = [images[target], images[index]];
      return { ...current, images };
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const draft = editorToDraft(editor);
      const saved = product
        ? await api.updateProduct(product.id, draft)
        : await api.createProduct(draft);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить товар');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-backdrop" role="dialog" aria-modal="true">
      <section className="editor-panel">
        <header className="editor-header">
          <div>
            <span className="eyebrow">Карточка товара</span>
            <h2>{product ? 'Редактирование' : 'Новый товар'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <form onSubmit={save} className="editor-form">
          {error && <div className="alert alert-error">{error}</div>}

          <section className="form-section">
            <div className="section-title">
              <div><strong>Основная информация</strong><span>Название, артикул и отображение в каталоге</span></div>
            </div>
            <div className="form-grid two">
              <label className="wide">
                Название товара
                <input required value={editor.title} onChange={(event) => setField('title', event.target.value)} />
              </label>
              <label>
                Бренд
                <input required value={editor.brand} onChange={(event) => setField('brand', event.target.value)} />
              </label>
              <label>
                Артикул SKU
                <input required value={editor.sku} onChange={(event) => setField('sku', event.target.value.toUpperCase())} />
              </label>
              <label className="wide">
                URL-имя
                <input value={editor.slug} onChange={(event) => setField('slug', event.target.value)} />
                <small>Можно оставить пустым — сервер сформирует адрес из бренда и названия.</small>
              </label>
              <label>
                Статус
                <select value={editor.status} onChange={(event) => setField('status', event.target.value as ProductStatus)}>
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликован</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
              <label>
                Категория
                <select value={editor.category} onChange={(event) => setField('category', event.target.value as ProductCategory)}>
                  <option value="new">Новинка</option>
                  <option value="hit">Хит</option>
                  <option value="sale">Скидка</option>
                  <option value="classic">Классика</option>
                </select>
              </label>
              <label className="checkbox-label wide">
                <input type="checkbox" checked={editor.featured} onChange={(event) => setField('featured', event.target.checked)} />
                Показывать товар выше остальных
              </label>
            </div>
          </section>

          <section className="form-section">
            <div className="section-title">
              <div><strong>Изображения</strong><span>До 12 фотографий, JPG/PNG/WEBP/AVIF, не более 8 МБ</span></div>
              <label className={`button button-secondary upload-button ${uploading ? 'disabled' : ''}`}>
                {uploading ? 'Загрузка…' : '+ Добавить фото'}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple disabled={uploading} onChange={uploadImages} />
              </label>
            </div>

            {editor.images.length === 0 ? (
              <div className="upload-empty">Перетащите фотографии сюда или нажмите «Добавить фото». Для публикации нужна минимум одна фотография.</div>
            ) : (
              <div className="image-grid">
                {editor.images.map((image, index) => (
                  <article className={`image-card ${image.isPrimary ? 'primary' : ''}`} key={`${image.publicId}-${index}`}>
                    <img src={image.url} alt={image.altText || editor.title || 'Товар'} />
                    <div className="image-card-body">
                      <input
                        value={image.altText}
                        aria-label="Описание изображения"
                        placeholder="Описание фото"
                        onChange={(event) => setEditor((current) => ({
                          ...current,
                          images: current.images.map((item, currentIndex) => currentIndex === index
                            ? { ...item, altText: event.target.value }
                            : item)
                        }))}
                      />
                      <div className="image-actions">
                        <button type="button" onClick={() => setPrimary(index)}>{image.isPrimary ? 'Главное' : 'Сделать главным'}</button>
                        <button type="button" disabled={index === 0} onClick={() => moveImage(index, -1)}>←</button>
                        <button type="button" disabled={index === editor.images.length - 1} onClick={() => moveImage(index, 1)}>→</button>
                        <button type="button" className="danger-text" onClick={() => removeImage(index)}>Удалить</button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="form-section">
            <div className="section-title"><div><strong>Цена и склад</strong><span>Фактические числовые поля без ручного JSON</span></div></div>
            <div className="form-grid four">
              <label>
                Цена
                <input type="number" required min="0" step="0.01" value={editor.price} onChange={(event) => setField('price', Number(event.target.value))} />
              </label>
              <label>
                Старая цена
                <input type="number" min="0" step="0.01" value={editor.oldPrice ?? ''} onChange={(event) => setField('oldPrice', event.target.value === '' ? undefined : Number(event.target.value))} />
              </label>
              <label>
                Валюта
                <select value={editor.currency} onChange={(event) => setField('currency', event.target.value)}>
                  <option value="EUR">EUR</option>
                  <option value="RUB">RUB</option>
                  <option value="USD">USD</option>
                  <option value="CHF">CHF</option>
                </select>
              </label>
              <label>
                Остаток
                <input type="number" required min="0" step="1" value={editor.stock} onChange={(event) => setField('stock', Number(event.target.value))} />
              </label>
            </div>
          </section>

          <section className="form-section">
            <div className="section-title"><div><strong>Характеристики аромата</strong><span>Поля сохраняются в нормализованные таблицы базы данных</span></div></div>
            <div className="form-grid four">
              <label>
                Пол
                <select value={editor.gender} onChange={(event) => setField('gender', event.target.value as Gender)}>
                  <option value="unisex">Унисекс</option>
                  <option value="female">Женский</option>
                  <option value="male">Мужской</option>
                </select>
              </label>
              <label>
                Концентрация
                <select value={editor.concentration} onChange={(event) => setField('concentration', event.target.value as Concentration)}>
                  <option value="EDT">EDT</option>
                  <option value="EDP">EDP</option>
                  <option value="Parfum">Parfum</option>
                </select>
              </label>
              <label>
                Объём, мл
                <input type="number" required min="1" value={editor.volumeMl} onChange={(event) => setField('volumeMl', Number(event.target.value))} />
              </label>
              <label>
                Порядок показа
                <input type="number" step="1" value={editor.sortOrder} onChange={(event) => setField('sortOrder', Number(event.target.value))} />
              </label>
              <label className="wide">
                Описание
                <textarea required rows={5} value={editor.description} onChange={(event) => setField('description', event.target.value)} />
              </label>
              <label className="wide">
                Верхние ноты
                <input value={editor.notesTop} onChange={(event) => setField('notesTop', event.target.value)} />
                <small>Разделяйте ноты запятыми.</small>
              </label>
              <label className="wide">
                Средние ноты
                <input value={editor.notesMiddle} onChange={(event) => setField('notesMiddle', event.target.value)} />
              </label>
              <label className="wide">
                Базовые ноты
                <input value={editor.notesBase} onChange={(event) => setField('notesBase', event.target.value)} />
              </label>
            </div>
          </section>

          <footer className="editor-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="button button-primary" disabled={saving || uploading}>
              {saving ? 'Сохранение…' : product ? 'Сохранить изменения' : 'Создать товар'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function Admin({ adminEmail, onLogout }: { adminEmail: string; onLogout: () => void }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [data, setData] = useState<ProductListResponse>({ items: [], page: 1, limit: 25, total: 0, pages: 1 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadDashboard() {
    try {
      setStats(await api.dashboard());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику');
    }
  }

  async function loadProducts() {
    setLoading(true);
    setError('');
    try {
      const result = await api.products({ search, status, category, page });
      setData(result);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить товары');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadProducts, 250);
    return () => window.clearTimeout(timer);
  }, [search, status, category, page]);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === data.items.length) setSelected(new Set());
    else setSelected(new Set(data.items.map((item) => item.id)));
  }

  async function bulkStatus(nextStatus: ProductStatus) {
    try {
      await api.bulkStatus(Array.from(selected), nextStatus);
      setNotice(`Статус изменён у ${selected.size} товаров.`);
      await Promise.all([loadProducts(), loadDashboard()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить массовое действие');
    }
  }

  async function duplicate(product: Product) {
    try {
      await api.duplicateProduct(product.id);
      setNotice('Создана копия товара в статусе «Черновик».');
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать копию');
    }
  }

  async function archive(product: Product) {
    if (!window.confirm(`Переместить «${product.title}» в архив?`)) return;
    try {
      await api.archiveProduct(product.id);
      setNotice('Товар перемещён в архив.');
      await Promise.all([loadProducts(), loadDashboard()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось архивировать товар');
    }
  }

  function saved() {
    setEditing(undefined);
    setNotice('Товар сохранён. Изменения доступны магазину через публичное API.');
    void Promise.all([loadProducts(), loadDashboard()]);
  }

  const allSelected = data.items.length > 0 && selected.size === data.items.length;

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><div className="brand-mark small">P</div><div><strong>Perfume</strong><span>ADMIN PANEL</span></div></div>
        <nav>
          <button className="nav-item active"><span>▦</span>Товары</button>
          <button className="nav-item" disabled><span>□</span>Заказы <em>далее</em></button>
          <button className="nav-item" disabled><span>◎</span>Клиенты <em>далее</em></button>
          <button className="nav-item" disabled><span>⚙</span>Настройки <em>далее</em></button>
        </nav>
        <div className="sidebar-bottom">
          <a href={STOREFRONT_URL} target="_blank" rel="noreferrer">Открыть магазин ↗</a>
          <button onClick={onLogout}>Выйти</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Каталог</span>
            <h1>Управление товарами</h1>
          </div>
          <div className="account"><span>{adminEmail}</span><div>{adminEmail.slice(0, 1).toUpperCase()}</div></div>
        </header>

        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-success">{notice}<button onClick={() => setNotice('')}>×</button></div>}

        <section className="stats-grid">
          <article><span>Товаров</span><strong>{stats?.products ?? '—'}</strong><small>без архива</small></article>
          <article><span>Остаток</span><strong>{stats?.stock ?? '—'}</strong><small>единиц опубликовано</small></article>
          <article><span>Заказы за 30 дней</span><strong>{stats?.orders30d ?? '—'}</strong><small>из базы данных</small></article>
          <article><span>Выручка за 30 дней</span><strong>{stats ? formatMoney(stats.revenue30d, stats.currency) : '—'}</strong><small>{stats?.cloudinaryConfigured ? 'фото подключены' : 'Cloudinary не настроен'}</small></article>
        </section>

        <section className="catalog-card">
          <div className="catalog-toolbar">
            <div className="search-box"><span>⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Поиск по названию, бренду или SKU" /></div>
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">Все статусы</option>
              <option value="published">Опубликованные</option>
              <option value="draft">Черновики</option>
              <option value="archived">Архив</option>
            </select>
            <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
              <option value="all">Все категории</option>
              <option value="new">Новинки</option>
              <option value="hit">Хиты</option>
              <option value="sale">Скидки</option>
              <option value="classic">Классика</option>
            </select>
            <button className="button button-primary" onClick={() => setEditing(null)}>+ Новый товар</button>
          </div>

          {selected.size > 0 && (
            <div className="bulk-bar">
              <strong>Выбрано: {selected.size}</strong>
              <button onClick={() => bulkStatus('published')}>Опубликовать</button>
              <button onClick={() => bulkStatus('draft')}>В черновики</button>
              <button onClick={() => bulkStatus('archived')}>В архив</button>
              <button onClick={() => setSelected(new Set())}>Снять выбор</button>
            </div>
          )}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="checkbox-cell"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                  <th>Товар</th>
                  <th>Статус</th>
                  <th>Категория</th>
                  <th>Цена</th>
                  <th>Остаток</th>
                  <th>Обновлён</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8}><div className="empty-row">Загрузка каталога…</div></td></tr>
                ) : data.items.length === 0 ? (
                  <tr><td colSpan={8}><div className="empty-row">Товары не найдены. Измените фильтры или создайте первый товар.</div></td></tr>
                ) : data.items.map((product) => (
                  <tr key={product.id}>
                    <td className="checkbox-cell"><input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelected(product.id)} /></td>
                    <td>
                      <div className="product-cell">
                        <div className="product-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span>{product.brand.slice(0, 1)}</span>}</div>
                        <div><strong>{product.title}</strong><span>{product.brand} · {product.sku} · {genderLabels[product.gender]} · {product.volumeMl} мл</span></div>
                      </div>
                    </td>
                    <td><span className={`status status-${product.status}`}>{statusLabels[product.status]}</span></td>
                    <td>{categoryLabels[product.category]}</td>
                    <td><strong>{formatMoney(product.price, product.currency)}</strong>{product.oldPrice ? <small className="old-price">{formatMoney(product.oldPrice, product.currency)}</small> : null}</td>
                    <td><span className={product.stock > 0 ? 'stock-ok' : 'stock-zero'}>{product.stock}</span></td>
                    <td className="date-cell">{formatDate(product.updatedAt)}</td>
                    <td>
                      <details className="row-menu">
                        <summary>•••</summary>
                        <div>
                          <button onClick={() => setEditing(product)}>Редактировать</button>
                          <button onClick={() => duplicate(product)}>Создать копию</button>
                          {product.status !== 'archived' && <button className="danger-text" onClick={() => archive(product)}>В архив</button>}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <footer className="pagination">
            <span>Показано {data.items.length} из {data.total}</span>
            <div>
              <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>←</button>
              <span>{page} / {data.pages}</span>
              <button disabled={page >= data.pages} onClick={() => setPage((current) => current + 1)}>→</button>
            </div>
          </footer>
        </section>
      </main>

      {editing !== undefined && <ProductEditor product={editing} onClose={() => setEditing(undefined)} onSaved={saved} />}
    </div>
  );
}

export default function App() {
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [adminEmail, setAdminEmail] = useState('');

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api.me()
      .then((admin) => setAdminEmail(admin.email))
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  function logout() {
    clearToken();
    setAdminEmail('');
  }

  if (checking) return <div className="splash"><div className="brand-mark">P</div><span>Проверка сессии…</span></div>;
  if (!adminEmail) return <Login onSuccess={setAdminEmail} />;
  return <Admin adminEmail={adminEmail} onLogout={logout} />;
}
