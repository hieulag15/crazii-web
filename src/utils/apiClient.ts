// ============================================================
// CRAZII API Client - Authentication & Settings
// ============================================================

const TOKEN_KEY = 'crazii_token';
const BASE_URL = '/api';

// ===== Token Management =====

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ===== HTTP Helpers =====

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status})`);
  }

  return data;
}

// ===== Auth API =====

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string;
  settings?: UserSettings;
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

interface AuthResponse {
  ok: boolean;
  token: string;
  user: AuthUser;
}

interface ProfileResponse {
  ok: boolean;
  user: AuthUser;
}

interface SettingsResponse {
  ok: boolean;
  settings: UserSettings;
}

export async function register(
  email: string,
  password: string,
  displayName?: string
): Promise<AuthResponse> {
  const body: Record<string, string> = { email, password };
  if (displayName) body.displayName = displayName;

  const data = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  setToken(data.token);
  return data;
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const data = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  setToken(data.token);
  return data;
}

export async function getProfile(): Promise<ProfileResponse> {
  return request<ProfileResponse>('/auth/me');
}

export async function updateSettings(
  settings: Partial<UserSettings>
): Promise<SettingsResponse> {
  return request<SettingsResponse>('/auth/me', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}
