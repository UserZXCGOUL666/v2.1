# Perfume Mini App — production admin

Готовая архитектура для магазина духов:

- `frontend/` — текущий клиентский магазин React/Vite для Vercel;
- `admin/` — отдельная профессиональная админ-панель React/Vite для второго проекта Vercel;
- `backend/` — Express API для Render;
- PostgreSQL — товары, изображения, ноты, остатки, заказы и администраторы;
- Cloudinary — хранение фотографий товаров;
- JWT — вход администратора;
- архивирование вместо безвозвратного удаления.

JSON-файлы из старой демонстрации больше не используются как рабочее хранилище. Файл `backend/data/products.json` сохранён только для однократного импорта существующих демо-товаров.

## Что умеет админ-панель

- отдельный защищённый вход;
- создание и редактирование карточки товара;
- несколько изображений у товара;
- выбор главного изображения;
- изменение порядка фотографий;
- название, бренд, SKU, URL, описание;
- цена, старая цена, валюта и складской остаток;
- пол, концентрация, объём и ноты аромата;
- категории: новинка, хит, скидка, классика;
- статусы: черновик, опубликован, архив;
- поиск и фильтры;
- массовая публикация, перевод в черновики и архив;
- копирование карточки товара;
- статистика каталога и заказов за 30 дней;
- адаптивный интерфейс для компьютера и телефона.

## Архитектура данных

Данные разнесены по таблицам:

- `products` — основные свойства товара;
- `product_images` — изображения и их порядок;
- `product_notes` — верхние, средние и базовые ноты;
- `orders` — заказы;
- `order_items` — позиции заказа;
- `admin_users` — администраторы.

Администратор работает с обычными формами. Редактировать JSON вручную не требуется.

# 1. Локальный запуск

Нужны Node.js 20+ и Docker Desktop.

## 1.1. Запуск PostgreSQL

Из корня проекта:

```bash
docker compose up -d
```

Локальная база будет доступна по адресу:

```text
postgresql://postgres:postgres@localhost:5432/perfume_shop
```

## 1.2. Настройка backend

Скопируйте файл:

```text
backend/.env.example
```

в:

```text
backend/.env
```

В `backend/.env` задайте реальные значения:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/perfume_shop
DATABASE_SSL=false
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=Use-A-Strong-Password-2026
JWT_SECRET=use-a-random-secret-longer-than-32-characters-2026
JWT_EXPIRES_IN=8h
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:5174
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_FOLDER=perfume-shop/products
```

Для локального теста без фотографий поля Cloudinary можно временно оставить пустыми. Создание товаров будет работать, но загрузка файлов — нет.

## 1.3. Установка зависимостей

Из корня проекта:

```bash
npm install
npm run install:all
```

## 1.4. Создание таблиц и администратора

```bash
cd backend
npm run db:init
npm run db:import-legacy
cd ..
```

`db:import-legacy` переносит старые товары из `backend/data/products.json` в PostgreSQL. Команду можно запускать повторно: уже импортированные записи будут пропущены.

## 1.5. Запуск трёх приложений

```bash
npm run dev
```

Адреса:

```text
Магазин:   http://localhost:5173
Админка:   http://localhost:5174
Backend:   http://localhost:3000
Проверка:  http://localhost:3000/health
```

Вход в админку выполняется через `ADMIN_EMAIL` и `ADMIN_PASSWORD` из `backend/.env`.

# 2. Подключение Cloudinary

1. Создайте аккаунт Cloudinary.
2. Откройте раздел API Keys.
3. Скопируйте `Cloud name`, `API key`, `API secret`.
4. Добавьте их в переменные backend на Render.
5. Перезапустите backend.

Фотографии загружаются только через backend. Секрет Cloudinary не попадает во frontend или admin.

# 3. Развёртывание backend на Render

В проекте есть `render.yaml`, поэтому можно использовать Render Blueprint. Либо создать ресурсы вручную.

## Вариант вручную

### 3.1. PostgreSQL

Создайте PostgreSQL Database в Render и сохраните её Internal Database URL.

### 3.2. Web Service

Подключите GitHub-репозиторий и укажите:

```text
Root Directory: backend
Build Command:  npm ci
Start Command:  npm run db:init && npm run db:import-legacy && npm start
Health Check:   /health
```

### 3.3. Переменные Render

```env
NODE_ENV=production
DATABASE_URL=<Internal Database URL из Render PostgreSQL>
DATABASE_SSL=true
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD=Use-A-Strong-Password-2026
JWT_SECRET=<длинная случайная строка минимум 32 символа>
JWT_EXPIRES_IN=8h
FRONTEND_ORIGINS=https://your-store.vercel.app,https://your-admin.vercel.app
CLOUDINARY_CLOUD_NAME=<Cloudinary cloud name>
CLOUDINARY_API_KEY=<Cloudinary API key>
CLOUDINARY_API_SECRET=<Cloudinary API secret>
CLOUDINARY_FOLDER=perfume-shop/products
```

После деплоя проверьте:

```text
https://your-render-service.onrender.com/health
```

Ожидаемый ответ:

```json
{"status":"ok","database":"connected"}
```

# 4. Развёртывание магазина на Vercel

Создайте Vercel Project из того же репозитория.

```text
Root Directory: frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Переменные магазина:

```env
VITE_USE_MOCK=false
VITE_API_URL=https://your-render-service.onrender.com
VITE_ADMIN_URL=https://your-admin.vercel.app
VITE_SUPPORT_BOT_URL=https://t.me/your_support_bot
```

Текущий магазин уже изменён: он получает товары из PostgreSQL через backend и показывает реальную фотографию, если она загружена. Для старых товаров без фотографии остаётся декоративный флакон.

# 5. Развёртывание отдельной админки на Vercel

Создайте второй Vercel Project из того же репозитория.

```text
Root Directory: admin
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Переменные админки:

```env
VITE_API_URL=https://your-render-service.onrender.com
VITE_STOREFRONT_URL=https://your-store.vercel.app
```

После получения домена админки обновите на Render:

```env
FRONTEND_ORIGINS=https://your-store.vercel.app,https://your-admin.vercel.app
```

Затем выполните Manual Deploy backend, чтобы CORS применил новые адреса.

# 6. Как происходит интеграция

Поток данных выглядит так:

```text
Админка Vercel
      │
      │ JWT + REST API
      ▼
Backend Render ───── PostgreSQL Render
      │
      ├───────────── Cloudinary
      │
      ▼
Магазин Vercel
```

Когда администратор сохраняет товар:

1. admin отправляет данные в `PATCH /api/admin/products/:id`;
2. backend обновляет таблицы PostgreSQL;
3. изображения уже находятся в Cloudinary;
4. магазин запрашивает `GET /products` или `GET /api/products`;
5. опубликованный товар сразу появляется в каталоге.

# 7. Основные API-маршруты

Публичные:

```text
GET  /health
GET  /products
GET  /products/:idOrSlug
POST /orders
```

Защищённые:

```text
POST   /api/admin/auth/login
GET    /api/admin/me
GET    /api/admin/dashboard
GET    /api/admin/products
GET    /api/admin/products/:id
POST   /api/admin/products
PATCH  /api/admin/products/:id
POST   /api/admin/products/:id/duplicate
PATCH  /api/admin/products/bulk/status
DELETE /api/admin/products/:id
POST   /api/admin/uploads
DELETE /api/admin/uploads
```

# 8. Безопасность

- операции изменения каталога требуют JWT;
- пароль хранится в PostgreSQL как bcrypt-хеш;
- вход ограничен по количеству попыток;
- Cloudinary API secret находится только на backend;
- CORS разрешает запросы только с заданных доменов;
- товар архивируется вместо физического удаления;
- загрузка ограничена изображениями до 8 МБ;
- SQL-запросы параметризованы.

Перед публичным запуском используйте новый сложный пароль, уникальный `JWT_SECRET` и не добавляйте `.env` в Git.

# 9. Дальнейшее развитие

Архитектура уже позволяет последовательно добавить:

- управление заказами и статусами доставки;
- роли менеджера и администратора;
- варианты товара по объёму;
- промокоды и акции;
- импорт и экспорт Excel;
- аудит действий сотрудников;
- уведомления в Telegram;
- онлайн-оплату;
- аналитику продаж;
- несколько складов.
