// ============================================================
// CRAZII Settings Page - User preferences & Telegram config
// ============================================================

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { UserSettings } from '../utils/apiClient';
import { SYMBOLS, TIMEFRAMES } from '../utils/dataService';

interface SettingsPageProps {
  onBack: () => void;
}

const DEFAULT_SETTINGS: UserSettings = {
  symbol: 'BTCUSDT',
  timeframe: '5m',
  minConfidence: 55,
  showOP: true,
  showMLP: true,
  showKTR: true,
  showPivot: true,
  showDiamond: true,
  showEMA200: true,
  showFVG: false,
  showOB: false,
  telegramEnabled: false,
  telegramChatId: '',
  telegramMinConfidence: 90,
};

export default function SettingsPage({ onBack }: SettingsPageProps) {
  const { user, updateSettings, logout } = useAuth();
  const [form, setForm] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Load user settings into form
  useEffect(() => {
    if (user?.settings) {
      setForm({ ...DEFAULT_SETTINGS, ...user.settings });
    }
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof UserSettings) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={styles.container}>
      <div style={styles.page}>
        {/* Header */}
        <div style={styles.header}>
          <button onClick={onBack} style={styles.backBtn}>← Quay lại</button>
          <h2 style={styles.title}>⚙️ Cài đặt</h2>
        </div>

        {/* User info */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>👤 Tài khoản</h3>
          <div style={styles.infoRow}>
            <span style={styles.infoLabel}>Email:</span>
            <span style={styles.infoValue}>{user?.email}</span>
          </div>
          {user?.displayName && (
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>Tên:</span>
              <span style={styles.infoValue}>{user.displayName}</span>
            </div>
          )}
          <button onClick={logout} style={styles.logoutBtn}>Đăng xuất</button>
        </div>

        {/* Chart settings */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>📊 Biểu đồ</h3>

          <div style={styles.row}>
            <label style={styles.label}>Cặp tiền:</label>
            <select
              value={form.symbol}
              onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
              style={styles.select}
            >
              {SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Khung thời gian:</label>
            <select
              value={form.timeframe}
              onChange={(e) => setForm((f) => ({ ...f, timeframe: e.target.value }))}
              style={styles.select}
            >
              {TIMEFRAMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div style={styles.row}>
            <label style={styles.label}>Lọc confidence ≥ {form.minConfidence}%</label>
            <input
              type="range"
              min={0} max={95} step={5}
              value={form.minConfidence}
              onChange={(e) => setForm((f) => ({ ...f, minConfidence: Number(e.target.value) }))}
              style={styles.slider}
            />
          </div>
        </div>

        {/* Indicator toggles */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>📈 Chỉ báo</h3>
          <div style={styles.toggleGrid}>
            <ToggleItem label="OP" active={form.showOP} color="#ff8c00" onToggle={() => toggle('showOP')} />
            <ToggleItem label="MLP" active={form.showMLP} color="#9b59b6" onToggle={() => toggle('showMLP')} />
            <ToggleItem label="KTR" active={form.showKTR} color="#22c55e" onToggle={() => toggle('showKTR')} />
            <ToggleItem label="Pivot" active={form.showPivot} color="#ff00ff" onToggle={() => toggle('showPivot')} />
            <ToggleItem label="Diamond 💎" active={form.showDiamond} color="#00ffff" onToggle={() => toggle('showDiamond')} />
            <ToggleItem label="EMA200" active={form.showEMA200} color="#f59e0b" onToggle={() => toggle('showEMA200')} />
            <ToggleItem label="FVG" active={form.showFVG} color="#22c55e" onToggle={() => toggle('showFVG')} />
            <ToggleItem label="OB" active={form.showOB} color="#00e5ff" onToggle={() => toggle('showOB')} />
          </div>
        </div>

        {/* Telegram settings */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>📱 Telegram</h3>

          <div style={styles.row}>
            <label style={styles.label}>Bật thông báo Telegram:</label>
            <button
              onClick={() => toggle('telegramEnabled')}
              style={{
                ...styles.toggleBtn,
                background: form.telegramEnabled ? '#229ed9' : '#1a2744',
                borderColor: form.telegramEnabled ? '#229ed9' : '#2a3f5f',
              }}
            >
              {form.telegramEnabled ? 'BẬT' : 'TẮT'}
            </button>
          </div>

          {form.telegramEnabled && (
            <>
              <div style={styles.row}>
                <label style={styles.label}>Chat ID:</label>
                <input
                  type="text"
                  value={form.telegramChatId || ''}
                  onChange={(e) => setForm((f) => ({ ...f, telegramChatId: e.target.value }))}
                  placeholder="VD: 123456789"
                  style={styles.input}
                />
              </div>
              <div style={styles.row}>
                <label style={styles.label}>
                  Chỉ gửi khi confidence ≥ {form.telegramMinConfidence}%
                </label>
                <input
                  type="range"
                  min={50} max={100} step={5}
                  value={form.telegramMinConfidence}
                  onChange={(e) => setForm((f) => ({ ...f, telegramMinConfidence: Number(e.target.value) }))}
                  style={styles.slider}
                />
              </div>
            </>
          )}
        </div>

        {/* Save */}
        <div style={styles.footer}>
          {error && <div style={styles.error}>{error}</div>}
          {saved && <div style={styles.success}>✓ Đã lưu thành công</div>}
          <button onClick={handleSave} disabled={saving} style={styles.saveBtn}>
            {saving ? '⏳ Đang lưu...' : '💾 Lưu cài đặt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Toggle Item =====

function ToggleItem({ label, active, color, onToggle }: {
  label: string; active: boolean; color: string; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        padding: '0.5rem 0.75rem',
        borderRadius: '6px',
        border: `1px solid ${active ? color : '#2a3f5f'}`,
        background: active ? `${color}20` : '#1a2744',
        color: active ? color : '#666',
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  );
}

// ===== Styles =====

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#060d1a',
    padding: '1rem',
    overflowY: 'auto',
  },
  page: {
    maxWidth: '600px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  backBtn: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #2a3f5f',
    background: '#1a2744',
    color: '#8892b0',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  title: {
    color: '#ffd700',
    fontSize: '1.2rem',
    margin: 0,
  },
  section: {
    background: '#0a1628',
    borderRadius: '10px',
    border: '1px solid #2a3f5f',
    padding: '1.25rem',
    marginBottom: '1rem',
  },
  sectionTitle: {
    color: '#d1d4dc',
    fontSize: '0.95rem',
    margin: '0 0 1rem 0',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
  },
  infoLabel: {
    color: '#8892b0',
    fontSize: '0.85rem',
  },
  infoValue: {
    color: '#e6e6e6',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  logoutBtn: {
    marginTop: '0.75rem',
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #ff4444',
    background: 'rgba(255,68,68,0.1)',
    color: '#ff4444',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.75rem',
    gap: '0.75rem',
    flexWrap: 'wrap' as const,
  },
  label: {
    color: '#8892b0',
    fontSize: '0.85rem',
    flex: 1,
  },
  select: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #2a3f5f',
    background: '#1a2744',
    color: '#e6e6e6',
    fontSize: '0.85rem',
    minWidth: '120px',
  },
  input: {
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #2a3f5f',
    background: '#1a2744',
    color: '#e6e6e6',
    fontSize: '0.85rem',
    flex: 1,
    maxWidth: '200px',
  },
  slider: {
    width: '120px',
    accentColor: '#ffd700',
  },
  toggleGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.5rem',
  },
  toggleBtn: {
    padding: '0.4rem 0.75rem',
    borderRadius: '6px',
    border: '1px solid #2a3f5f',
    color: '#e6e6e6',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  footer: {
    marginTop: '0.5rem',
    marginBottom: '2rem',
  },
  error: {
    color: '#ff4444',
    fontSize: '0.85rem',
    marginBottom: '0.75rem',
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,68,68,0.1)',
    borderRadius: '6px',
  },
  success: {
    color: '#22c55e',
    fontSize: '0.85rem',
    marginBottom: '0.75rem',
    padding: '0.5rem 0.75rem',
    background: 'rgba(34,197,94,0.1)',
    borderRadius: '6px',
  },
  saveBtn: {
    width: '100%',
    padding: '0.75rem',
    borderRadius: '8px',
    border: 'none',
    background: '#ffd700',
    color: '#060d1a',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
};
