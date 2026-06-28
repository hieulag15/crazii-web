import { useState } from 'react';
import { saveSettings, logout } from '../utils/authService';
import type { AuthUser, UserSettings } from '../utils/authService';
import { SYMBOLS, TIMEFRAMES } from '../utils/dataService';

interface Props {
  user: AuthUser;
  onSettingsChange: (settings: UserSettings) => void;
  onLogout: () => void;
  onClose: () => void;
}

export default function SettingsPanel({ user, onSettingsChange, onLogout, onClose }: Props) {
  const [settings, setLocal] = useState<UserSettings>(user.settings);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const update = (partial: Partial<UserSettings>) => {
    setLocal((s) => ({ ...s, ...partial }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    const result = await saveSettings(settings);
    if (result) {
      onSettingsChange(result);
      setMsg('✅ Đã lưu cài đặt');
    } else {
      setMsg('❌ Lưu thất bại');
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const handleLogout = () => {
    logout();
    onLogout();
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>⚙️ Cài đặt</h2>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          {/* User info */}
          <div className="settings-section">
            <h4>👤 Tài khoản</h4>
            <div className="setting-info">
              <span>{user.displayName}</span>
              <span className="setting-email">{user.email}</span>
            </div>
          </div>

          {/* Trading defaults */}
          <div className="settings-section">
            <h4>📊 Mặc định giao dịch</h4>

            <label className="setting-row">
              <span>Tài sản</span>
              <select value={settings.symbol} onChange={(e) => update({ symbol: e.target.value })}>
                {SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>

            <label className="setting-row">
              <span>Khung thời gian</span>
              <select value={settings.timeframe} onChange={(e) => update({ timeframe: e.target.value })}>
                {TIMEFRAMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>

            <label className="setting-row">
              <span>Lọc Confidence ≥ {settings.minConfidence}%</span>
              <input type="range" min={0} max={95} step={5}
                value={settings.minConfidence}
                onChange={(e) => update({ minConfidence: Number(e.target.value) })} />
            </label>
          </div>

          {/* Indicators */}
          <div className="settings-section">
            <h4>📈 Chỉ báo hiển thị</h4>
            <div className="setting-toggles">
              <Toggle label="OP" active={settings.showOP} onToggle={() => update({ showOP: !settings.showOP })} />
              <Toggle label="MLP" active={settings.showMLP} onToggle={() => update({ showMLP: !settings.showMLP })} />
              <Toggle label="KTR" active={settings.showKTR} onToggle={() => update({ showKTR: !settings.showKTR })} />
              <Toggle label="Pivot" active={settings.showPivot} onToggle={() => update({ showPivot: !settings.showPivot })} />
              <Toggle label="EMA200" active={settings.showEMA200} onToggle={() => update({ showEMA200: !settings.showEMA200 })} />
              <Toggle label="💎" active={settings.showDiamond} onToggle={() => update({ showDiamond: !settings.showDiamond })} />
              <Toggle label="FVG" active={settings.showFVG} onToggle={() => update({ showFVG: !settings.showFVG })} />
              <Toggle label="OB" active={settings.showOB} onToggle={() => update({ showOB: !settings.showOB })} />
            </div>
          </div>

          {/* Telegram */}
          <div className="settings-section">
            <h4>📱 Telegram tự động</h4>

            <label className="setting-row">
              <span>Bật gửi tín hiệu qua Telegram</span>
              <input type="checkbox" checked={settings.telegramEnabled}
                onChange={(e) => update({ telegramEnabled: e.target.checked })} />
            </label>

            {settings.telegramEnabled && (
              <>
                <label className="setting-row">
                  <span>Chat ID (lấy từ @userinfobot)</span>
                  <input type="text" placeholder="-100xxx hoặc ID cá nhân"
                    value={settings.telegramChatId || ''}
                    onChange={(e) => update({ telegramChatId: e.target.value })} />
                </label>

                <label className="setting-row">
                  <span>Gửi khi confidence ≥ {settings.telegramMinConfidence}%</span>
                  <input type="range" min={50} max={100} step={5}
                    value={settings.telegramMinConfidence}
                    onChange={(e) => update({ telegramMinConfidence: Number(e.target.value) })} />
                </label>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="settings-footer">
          {msg && <span className="settings-msg">{msg}</span>}
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Đang lưu...' : '💾 Lưu cài đặt'}
          </button>
          <button className="btn-logout" onClick={handleLogout}>🚪 Đăng xuất</button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button className={`stoggle ${active ? 'on' : ''}`} onClick={onToggle}>
      {label}
    </button>
  );
}
