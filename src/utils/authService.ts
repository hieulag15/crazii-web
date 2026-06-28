/**
 * Auth Service - quản lý đăng nhập/đăng ký/token phía client
 */

const TOKEN_KEY = 'crazii_token';
const USER_KEY = 'crazii_user';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  settings: UserSettings;
}

export interface UserSettings {
  symbol: string;
  timeframe: string;
  minConfidence: number;
  showOP: boolean;
  showMLP: boolean;
  showKTR: boolean;
  showPivot: boolean;
  showDiamond: boolean;
  showEMA200: boolean;
  showFVG: boolean;
  showOB: boolean;
  telegramEnabled: boolean;
  telegramChatId?: string;
  telegramMinConfidence: number;
}

/** Lấy token từ localStorage */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Lấy user đã cache */
export function getCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Lưu token + user sau đăng nhập */
function saveAuth(token: string, user: AuthUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Xóa auth (logout) */
export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Helper gọi API với token */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

/** Đăng ký */
export async function register(email: string, password: string, displayName?: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Đăng ký thất bại');
  saveAuth(data.token, data.user);
  return data.user;
}

/** Đăng nhập */
export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Đăng nhập thất bại');
  saveAuth(data.token, data.user);
  return data.user;
}

/** Lấy profile + settings mới nhất từ server */
export async function fetchMe(): Promise<AuthUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await authFetch('/api/auth/me');
    if (!res.ok) { logout(); return null; }
    const data = await res.json();
    const user = data.user as AuthUser;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch { return null; }
}

/** Lưu settings lên server */
export async function saveSettings(settings: Partial<UserSettings>): Promise<UserSettings | null> {
  try {
    const res = await authFetch('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Update cached user
    const cached = getCachedUser();
    if (cached) {
      cached.settings = data.settings;
      localStorage.setItem(USER_KEY, JSON.stringify(cached));
    }
    return data.settings;
  } catch { return null; }
}
