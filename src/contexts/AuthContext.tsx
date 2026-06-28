// ============================================================
// CRAZII Auth Context - Global authentication state
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import * as api from '../utils/apiClient';
import type { AuthUser, UserSettings } from '../utils/apiClient';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(api.getToken());
  const [loading, setLoading] = useState(true);

  // Restore session on mount
  useEffect(() => {
    const savedToken = api.getToken();
    if (!savedToken) {
      setLoading(false);
      return;
    }

    api.getProfile()
      .then((res) => {
        setUser(res.user);
        setToken(savedToken);
      })
      .catch(() => {
        // Token expired or invalid
        api.clearToken();
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    const res = await api.register(email, password, displayName);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    api.clearToken();
    setToken(null);
    setUser(null);
  }, []);

  const updateSettings = useCallback(async (settings: Partial<UserSettings>) => {
    const res = await api.updateSettings(settings);
    setUser((prev) => prev ? { ...prev, settings: res.settings } : prev);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      isLoggedIn: !!token && !!user,
      loading,
      login,
      register,
      logout,
      updateSettings,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
