interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: TelegramUser;
  };
  colorScheme?: 'light' | 'dark';
  ready: () => void;
  expand: () => void;
  close: () => void;
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

export function initTelegramApp(): void {
  const tg = getTelegramWebApp();
  if (!tg) return;

  tg.ready();
  tg.expand();
}

export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData ?? '';
}

export function getTelegramUser(): TelegramUser | null {
  return getTelegramWebApp()?.initDataUnsafe?.user ?? null;
}

export function notifySuccess(): void {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred('success');
}

export function notifyError(): void {
  getTelegramWebApp()?.HapticFeedback?.notificationOccurred('error');
}
