// ============================================================
// CRAZII Login / Register Page
// ============================================================

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'login' | 'register';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (tab === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName || undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>
          <span style={styles.logoIcon}>◆</span>
          <span style={styles.logoText}>CRAZII</span>
        </div>
        <p style={styles.subtitle}>Hệ thống giao dịch thông minh</p>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(tab === 'login' ? styles.tabActive : {}) }}
            onClick={() => { setTab('login'); setError(''); }}
          >
            Đăng nhập
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'register' ? styles.tabActive : {}) }}
            onClick={() => { setTab('register'); setError(''); }}
          >
            Đăng ký
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={styles.form}>
          {tab === 'register' && (
            <div style={styles.field}>
              <label style={styles.label}>Tên hiển thị</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="VD: Trader Crazii"
                style={styles.input}
              />
            </div>
          )}

          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              style={styles.input}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading
              ? '⏳ Đang xử lý...'
              : tab === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ===== Inline Styles (dark theme) =====

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#060d1a',
    padding: '1rem',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: '#0a1628',
    borderRadius: '12px',
    border: '1px solid #2a3f5f',
    padding: '2rem',
  },
  logo: {
    textAlign: 'center' as const,
    marginBottom: '0.25rem',
  },
  logoIcon: {
    fontSize: '2rem',
    color: '#ffd700',
    marginRight: '0.5rem',
  },
  logoText: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#ffd700',
    letterSpacing: '2px',
  },
  subtitle: {
    textAlign: 'center' as const,
    color: '#8892b0',
    fontSize: '0.85rem',
    marginBottom: '1.5rem',
  },
  tabs: {
    display: 'flex',
    gap: '0',
    marginBottom: '1.5rem',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #2a3f5f',
  },
  tab: {
    flex: 1,
    padding: '0.6rem',
    border: 'none',
    background: '#1a2744',
    color: '#8892b0',
    fontSize: '0.9rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    background: '#2a3f5f',
    color: '#ffd700',
    fontWeight: 600,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.3rem',
  },
  label: {
    color: '#8892b0',
    fontSize: '0.8rem',
    fontWeight: 500,
  },
  input: {
    padding: '0.7rem 0.9rem',
    borderRadius: '8px',
    border: '1px solid #2a3f5f',
    background: '#1a2744',
    color: '#e6e6e6',
    fontSize: '0.95rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  error: {
    color: '#ff4444',
    fontSize: '0.85rem',
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,68,68,0.1)',
    borderRadius: '6px',
    border: '1px solid rgba(255,68,68,0.3)',
  },
  button: {
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    background: '#ffd700',
    color: '#060d1a',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    marginTop: '0.5rem',
  },
};
