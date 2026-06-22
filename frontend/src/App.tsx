import { useEffect, useMemo, useState } from 'react';
import { ordersApi, productsApi } from './api/client';
import { CartView } from './components/CartView';
import { CheckoutView } from './components/CheckoutView';
import { ProductCard } from './components/ProductCard';
import { ProductDetails } from './components/ProductDetails';
import { ProductFilters } from './components/ProductFilters';
import { formatMoney } from './lib/money';
import { getTelegramInitData, getTelegramUser, initTelegramApp, notifyError, notifySuccess } from './lib/telegram';
import type { CartItem, CheckoutForm, Product, ProductFilters as ProductFiltersType } from './types/shop';

const CART_STORAGE_KEY = 'perfume-miniapp-cart-v2';
const PROFILE_STORAGE_KEY = 'perfume-miniapp-profile-v1';
const SUPPORT_BOT_URL = import.meta.env.VITE_SUPPORT_BOT_URL ?? 'https://t.me/your_support_bot';

type MainTab = 'profile' | 'home' | 'support';

type AchievementId = 'first_order' | 'subscriber' | 'collector' | 'bonus_hunter' | 'connoisseur';

type View =
  | { name: 'home' }
  | { name: 'profile' }
  | { name: 'support' }
  | { name: 'product'; productId: string }
  | { name: 'cart' }
  | { name: 'checkout' }
  | {
      name: 'success';
      orderId: string;
      totalAmount: number;
      currency: string;
      unlockedAchievements: Achievement[];
    };

interface UserStats {
  purchases: number;
  productsBought: number;
  bonuses: number;
  totalSpent: number;
  subscriptionStatus: 'inactive' | 'active';
  subscriptionPlan: string;
  achievements: AchievementId[];
}

interface Achievement {
  id: AchievementId;
  title: string;
  description: string;
  badge: string;
  isUnlocked: (stats: UserStats) => boolean;
}

const initialFilters: ProductFiltersType = {
  search: '',
  category: 'all',
  brand: 'all',
  inStockOnly: true,
  priceBucket: 'all',
  sortBy: 'popular'
};

const initialStats: UserStats = {
  purchases: 0,
  productsBought: 0,
  bonuses: 0,
  totalSpent: 0,
  subscriptionStatus: 'inactive',
  subscriptionPlan: '',
  achievements: []
};

const achievementsCatalog: Achievement[] = [
  {
    id: 'first_order',
    title: 'Первый заказ',
    description: 'Оформите первую покупку',
    badge: '01',
    isUnlocked: (stats) => stats.purchases >= 1
  },
  {
    id: 'subscriber',
    title: 'Подписчик',
    description: 'Активируйте ежемесячную доставку',
    badge: 'SUB',
    isUnlocked: (stats) => stats.subscriptionStatus === 'active'
  },
  {
    id: 'collector',
    title: 'Коллекционер',
    description: 'Купите 3 товара',
    badge: '03',
    isUnlocked: (stats) => stats.productsBought >= 3
  },
  {
    id: 'bonus_hunter',
    title: 'Охотник за бонусами',
    description: 'Накопите 100 бонусов',
    badge: '100',
    isUnlocked: (stats) => stats.bonuses >= 100
  },
  {
    id: 'connoisseur',
    title: 'Знаток ароматов',
    description: 'Оформите 5 покупок',
    badge: '05',
    isUnlocked: (stats) => stats.purchases >= 5
  }
];

function loadCartFromStorage(products: Product[]): CartItem[] {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Array<{ productId: string; quantity: number }>;

    return parsed
      .map((item) => {
        const product = products.find((current) => current.id === item.productId);
        if (!product) return null;
        return { product, quantity: Math.max(1, item.quantity) };
      })
      .filter(Boolean) as CartItem[];
  } catch {
    return [];
  }
}

function saveCartToStorage(items: CartItem[]): void {
  const payload = items.map((item) => ({ productId: item.product.id, quantity: item.quantity }));
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
}

function loadUserStats(): UserStats {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return initialStats;
    const parsed = JSON.parse(raw) as Partial<UserStats>;

    return {
      purchases: Number(parsed.purchases ?? initialStats.purchases),
      productsBought: Number(parsed.productsBought ?? initialStats.productsBought),
      bonuses: Number(parsed.bonuses ?? initialStats.bonuses),
      totalSpent: Number(parsed.totalSpent ?? initialStats.totalSpent),
      subscriptionStatus: parsed.subscriptionStatus === 'active' ? 'active' : 'inactive',
      subscriptionPlan: String(parsed.subscriptionPlan ?? ''),
      achievements: Array.isArray(parsed.achievements) ? (parsed.achievements as AchievementId[]) : []
    };
  } catch {
    return initialStats;
  }
}

function saveUserStats(stats: UserStats): void {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(stats));
}

function applyUnlockedAchievements(stats: UserStats): UserStats {
  const unlocked = new Set(stats.achievements);
  achievementsCatalog.forEach((achievement) => {
    if (achievement.isUnlocked(stats)) unlocked.add(achievement.id);
  });

  return { ...stats, achievements: Array.from(unlocked) };
}

function applyOrderToStats(current: UserStats, totalAmount: number, productQuantity: number) {
  const before = new Set(current.achievements);
  const draft: UserStats = {
    ...current,
    purchases: current.purchases + 1,
    productsBought: current.productsBought + productQuantity,
    bonuses: current.bonuses + Math.max(10, Math.floor(totalAmount * 0.08)),
    totalSpent: current.totalSpent + totalAmount
  };
  const next = applyUnlockedAchievements(draft);
  const unlockedAchievements = achievementsCatalog.filter(
    (achievement) => next.achievements.includes(achievement.id) && !before.has(achievement.id)
  );

  return { next, unlockedAchievements };
}

function activateSubscriptionInStats(current: UserStats) {
  const before = new Set(current.achievements);
  const draft: UserStats = {
    ...current,
    subscriptionStatus: 'active',
    subscriptionPlan: 'Monthly Scent Drop',
    bonuses: current.subscriptionStatus === 'active' ? current.bonuses : current.bonuses + 50
  };
  const next = applyUnlockedAchievements(draft);
  const unlockedAchievements = achievementsCatalog.filter(
    (achievement) => next.achievements.includes(achievement.id) && !before.has(achievement.id)
  );

  return { next, unlockedAchievements };
}

function getLevel(stats: UserStats): number {
  return Math.max(1, Math.floor((stats.purchases * 2 + stats.productsBought + stats.bonuses / 80) / 3) + 1);
}

function getLevelProgress(stats: UserStats): number {
  const rawScore = stats.purchases * 2 + stats.productsBought + stats.bonuses / 80;
  return Math.round(((rawScore % 3) / 3) * 100);
}

function BottomNavigation({ activeTab, onNavigate }: { activeTab: MainTab; onNavigate: (tab: MainTab) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Основное меню">
      <button className={activeTab === 'profile' ? 'is-active' : ''} type="button" onClick={() => onNavigate('profile')}>
        <span>ПР</span>
        Профиль
      </button>
      <button className={activeTab === 'home' ? 'is-active' : ''} type="button" onClick={() => onNavigate('home')}>
        <span>GL</span>
        Главная
      </button>
      <button className={activeTab === 'support' ? 'is-active' : ''} type="button" onClick={() => onNavigate('support')}>
        <span>TG</span>
        Поддержка
      </button>
    </nav>
  );
}

export default function App() {
  if (window.location.pathname.startsWith('/admin')) {
    const adminUrl = import.meta.env.VITE_ADMIN_URL ?? '/';
    window.location.replace(adminUrl);
    return <main className="page"><div className="loading-box">Переход в админ-панель…</div></main>;
  }

  const [view, setView] = useState<View>({ name: 'home' });
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<ProductFiltersType>(initialFilters);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [userStats, setUserStats] = useState<UserStats>(() => applyUnlockedAchievements(loadUserStats()));
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const telegramUser = getTelegramUser();

  useEffect(() => {
    initTelegramApp();
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadCatalogBase() {
      try {
        const loadedProducts = await productsApi.getProducts({
          ...initialFilters,
          inStockOnly: false,
          sortBy: 'popular'
        });
        if (isMounted) setAllProducts(loadedProducts);
      } catch {
        if (isMounted) setAllProducts([]);
      }
    }

    loadCatalogBase();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      setIsLoading(true);
      setError(null);

      try {
        const loadedProducts = await productsApi.getProducts(filters);
        if (!isMounted) return;
        setProducts(loadedProducts);
      } catch {
        if (!isMounted) return;
        setError('Не удалось загрузить каталог. Проверь, запущен ли backend на http://localhost:3000.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadProducts();

    return () => {
      isMounted = false;
    };
  }, [filters]);

  useEffect(() => {
    const source = allProducts.length > 0 ? allProducts : products;
    if (source.length === 0) return;
    setCartItems((current) => {
      if (current.length > 0) return current;
      return loadCartFromStorage(source);
    });
  }, [allProducts, products]);

  useEffect(() => {
    saveCartToStorage(cartItems);
  }, [cartItems]);

  useEffect(() => {
    saveUserStats(userStats);
  }, [userStats]);

  const brands = useMemo(() => {
    const source = allProducts.length > 0 ? allProducts : products;
    const brandSet = new Set(source.map((product) => product.brand));
    return Array.from(brandSet).sort();
  }, [allProducts, products]);

  const catalogStats = useMemo(() => {
    const source = allProducts.length > 0 ? allProducts : products;
    return {
      brands: new Set(source.map((product) => product.brand)).size,
      inStock: source.filter((product) => product.stock > 0).length,
      total: source.length
    };
  }, [allProducts, products]);

  const selectedProduct = useMemo(() => {
    if (view.name !== 'product') return null;
    const source = allProducts.length > 0 ? allProducts : products;
    return source.find((product) => product.id === view.productId) ?? null;
  }, [allProducts, products, view]);

  const totalAmount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cartItems]
  );

  const totalQuantity = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems]
  );

  const currency = cartItems[0]?.product.currency ?? '€';
  const level = getLevel(userStats);
  const levelProgress = getLevelProgress(userStats);
  const userName = telegramUser?.first_name || 'Гость';

  function navigateToTab(tab: MainTab): void {
    setError(null);
    if (tab === 'profile') setView({ name: 'profile' });
    if (tab === 'home') setView({ name: 'home' });
    if (tab === 'support') setView({ name: 'support' });
  }

  function addToCart(product: Product): void {
    if (product.stock <= 0) return;

    setCartItems((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (!existing) return [...current, { product, quantity: 1 }];

      return current.map((item) =>
        item.product.id === product.id
          ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) }
          : item
      );
    });

    notifySuccess();
  }

  function increaseQuantity(productId: string): void {
    setCartItems((current) =>
      current.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: Math.min(item.quantity + 1, item.product.stock) }
          : item
      )
    );
  }

  function decreaseQuantity(productId: string): void {
    setCartItems((current) =>
      current
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeFromCart(productId: string): void {
    setCartItems((current) => current.filter((item) => item.product.id !== productId));
  }

  function activateMonthlySubscription(): void {
    const { next } = activateSubscriptionInStats(userStats);
    setUserStats(next);
    notifySuccess();
    setView({ name: 'profile' });
  }

  async function submitOrder(form: CheckoutForm): Promise<void> {
    if (cartItems.length === 0) return;

    const orderedQuantity = totalQuantity;
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await ordersApi.createOrder({
        customer: form,
        items: cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity
        })),
        initData: getTelegramInitData()
      });

      const statsUpdate = applyOrderToStats(userStats, response.totalAmount, orderedQuantity);
      setUserStats(statsUpdate.next);
      setCartItems([]);
      window.localStorage.removeItem(CART_STORAGE_KEY);
      notifySuccess();
      setView({
        name: 'success',
        orderId: response.orderId,
        totalAmount: response.totalAmount,
        currency: response.currency,
        unlockedAchievements: statsUpdate.unlockedAchievements
      });
    } catch {
      notifyError();
      setError('Заказ не создан. Проверь, запущен ли backend.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (view.name === 'product') {
    if (!selectedProduct) {
      return (
        <main className="page empty-state">
          <h1>Товар не найден</h1>
          <button className="primary-button" type="button" onClick={() => setView({ name: 'home' })}>
            Вернуться в каталог
          </button>
        </main>
      );
    }

    return (
      <ProductDetails
        product={selectedProduct}
        onBack={() => setView({ name: 'home' })}
        onAddToCart={addToCart}
      />
    );
  }

  if (view.name === 'cart') {
    return (
      <CartView
        items={cartItems}
        totalAmount={totalAmount}
        currency={currency}
        onBack={() => setView({ name: 'home' })}
        onIncrease={increaseQuantity}
        onDecrease={decreaseQuantity}
        onRemove={removeFromCart}
        onCheckout={() => setView({ name: 'checkout' })}
      />
    );
  }

  if (view.name === 'checkout') {
    return (
      <CheckoutView
        totalAmount={totalAmount}
        currency={currency}
        isSubmitting={isSubmitting}
        onBack={() => setView({ name: 'cart' })}
        onSubmit={submitOrder}
      />
    );
  }

  if (view.name === 'success') {
    return (
      <>
        <main className="page success-page page-with-nav">
          <div className="success-card">
            <span className="success-icon">✓</span>
            <h1>Заказ принят</h1>
            <p>Номер заказа: <strong>{view.orderId}</strong></p>
            <p>Сумма: <strong>{formatMoney(view.totalAmount, view.currency)}</strong></p>
            <p className="muted">Бонусы и прогресс профиля обновлены.</p>
            {view.unlockedAchievements.length > 0 && (
              <div className="unlocked-box">
                <strong>Открыты ачивки</strong>
                {view.unlockedAchievements.map((achievement) => (
                  <span key={achievement.id}>{achievement.title}</span>
                ))}
              </div>
            )}
            <button className="primary-button full-width" type="button" onClick={() => setView({ name: 'profile' })}>
              Смотреть прогресс
            </button>
          </div>
        </main>
        <BottomNavigation activeTab="profile" onNavigate={navigateToTab} />
      </>
    );
  }

  if (view.name === 'profile') {
    return (
      <>
        <main className="page profile-page page-with-nav">
          <header className="app-header compact-header">
            <div>
              <span className="eyebrow">Profile</span>
              <h1>Профиль</h1>
              <p className="muted">Покупки, подписка, ачивки и бонусная механика.</p>
            </div>
          </header>

          <section className="profile-card">
            <div className="profile-topline">
              <div className="avatar">{userName.slice(0, 1).toUpperCase()}</div>
              <div>
                <strong>{userName}</strong>
                <p className="muted small-text">Уровень {level} · {userStats.bonuses} бонусов</p>
              </div>
            </div>
            <div className="level-meter" aria-label={`Прогресс уровня: ${levelProgress}%`}>
              <span style={{ width: `${Math.max(8, levelProgress)}%` }} />
            </div>
            <div className="profile-stats-grid">
              <div>
                <span>Покупки</span>
                <strong>{userStats.purchases}</strong>
              </div>
              <div>
                <span>Товаров</span>
                <strong>{userStats.productsBought}</strong>
              </div>
              <div>
                <span>Потрачено</span>
                <strong>{formatMoney(userStats.totalSpent, '€')}</strong>
              </div>
            </div>
          </section>

          <section className="subscription-status-card">
            <div>
              <span className="eyebrow">Подписка</span>
              <h2>{userStats.subscriptionStatus === 'active' ? userStats.subscriptionPlan : 'Ежемесячная доставка не активна'}</h2>
              <p className="muted">
                {userStats.subscriptionStatus === 'active'
                  ? 'Следующая коробка будет собрана по профилю предпочтений.'
                  : 'Активируйте monthly delivery и получите бонусы за подписку.'}
              </p>
            </div>
            <button className="primary-button full-width" type="button" onClick={activateMonthlySubscription}>
              {userStats.subscriptionStatus === 'active' ? 'Обновить подписку' : 'Активировать подписку'}
            </button>
          </section>

          <section className="achievements-section">
            <div className="section-header compact-header">
              <div>
                <h2>Ачивки</h2>
                <p className="muted small-text">Открываются покупками, подпиской и накоплением бонусов.</p>
              </div>
              <span className="counter-pill">{userStats.achievements.length}/{achievementsCatalog.length}</span>
            </div>
            <div className="achievements-grid">
              {achievementsCatalog.map((achievement) => {
                const unlocked = userStats.achievements.includes(achievement.id);
                return (
                  <article className={`achievement-card ${unlocked ? 'is-unlocked' : ''}`} key={achievement.id}>
                    <span>{achievement.badge}</span>
                    <strong>{achievement.title}</strong>
                    <p>{achievement.description}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </main>
        <BottomNavigation activeTab="profile" onNavigate={navigateToTab} />
      </>
    );
  }

  if (view.name === 'support') {
    return (
      <>
        <main className="page support-page page-with-nav">
          <header className="app-header compact-header">
            <div>
              <span className="eyebrow">Support</span>
              <h1>Поддержка</h1>
              <p className="muted">Переход в Telegram-бот для вопросов по подписке, оплате и доставке.</p>
            </div>
          </header>

          <section className="support-card">
            <span className="support-mark">TG</span>
            <h2>Telegram-бот техподдержки</h2>
            <p>
              Для production укажите реальную ссылку в переменной <code>VITE_SUPPORT_BOT_URL</code>. Сейчас кнопка ведёт на базовый placeholder.
            </p>
            <a className="primary-button full-width large-button" href={SUPPORT_BOT_URL} target="_blank" rel="noreferrer">
              Открыть Telegram-бот
            </a>
          </section>

          <section className="support-grid">
            <div>
              <strong>Подписка</strong>
              <p>Изменение плана, перенос доставки, отмена.</p>
            </div>
            <div>
              <strong>Заказы</strong>
              <p>Статус оплаты, адрес, наличие товаров.</p>
            </div>
            <div>
              <strong>Бонусы</strong>
              <p>Проверка начислений и открытых ачивок.</p>
            </div>
          </section>
        </main>
        <BottomNavigation activeTab="support" onNavigate={navigateToTab} />
      </>
    );
  }

  return (
    <>
      <main className="page catalog-page page-with-nav">
        <header className="app-header">
          <div>
            <span className="eyebrow">Scent subscription</span>
            <h1>Ежемесячная доставка духов</h1>
            <p className="muted">
              {telegramUser?.first_name
                ? `${telegramUser.first_name}, соберите подписку и выберите ароматы`
                : 'Мобильный каталог с подпиской, покупками и прогрессом профиля'}
            </p>
          </div>
          <button className="cart-button" type="button" onClick={() => setView({ name: 'cart' })}>
            Корзина
            {totalQuantity > 0 && <span>{totalQuantity}</span>}
          </button>
        </header>

        <section className="subscription-hero">
          <div>
            <span className="eyebrow">Monthly Scent Drop</span>
            <h2>Новая коробка ароматов каждый месяц</h2>
            <p>
              Подборка из 3–5 ароматов под профиль пользователя, бонусы за покупки и открываемые ачивки после заказов.
            </p>
          </div>
          <div className="hero-metrics">
            <div>
              <strong>{catalogStats.total}</strong>
              <span>товаров</span>
            </div>
            <div>
              <strong>{catalogStats.brands}</strong>
              <span>брендов</span>
            </div>
            <div>
              <strong>{catalogStats.inStock}</strong>
              <span>в наличии</span>
            </div>
          </div>
          <button className="primary-button large-button" type="button" onClick={activateMonthlySubscription}>
            Подписаться на месяц
          </button>
        </section>

        <section className="concept-card">
          <span>UI/UX</span>
          <h2>Mobile-first витрина в фиксированной мобильной ширине</h2>
          <p>Фокус: подписка, быстрый каталог, нижнее меню из трёх вкладок и прогресс пользователя.</p>
        </section>

        <section className="quick-categories" aria-label="Быстрые категории">
          <button type="button" onClick={() => setFilters({ ...filters, category: 'hit' })}>Хиты</button>
          <button type="button" onClick={() => setFilters({ ...filters, category: 'new' })}>Новинки</button>
          <button type="button" onClick={() => setFilters({ ...filters, category: 'sale' })}>Sale</button>
        </section>

        <section className="catalog-section">
          <div className="section-header compact-header">
            <div>
              <span className="eyebrow">Ассортимент</span>
              <h2>Каталог ароматов</h2>
            </div>
            <span className="counter-pill">{products.length}</span>
          </div>

          <ProductFilters filters={filters} brands={brands} onChange={setFilters} />

          {error && <div className="error-box">{error}</div>}

          {isLoading ? (
            <div className="loading-box">Загружаем каталог...</div>
          ) : products.length === 0 ? (
            <section className="empty-state">
              <h2>Ничего не найдено</h2>
              <p>Сними часть фильтров или добавь товары через админку.</p>
            </section>
          ) : (
            <section className="products-grid">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onOpen={(current) => setView({ name: 'product', productId: current.id })}
                  onAddToCart={addToCart}
                />
              ))}
            </section>
          )}
        </section>
      </main>
      <BottomNavigation activeTab="home" onNavigate={navigateToTab} />
    </>
  );
}
