/**
 * CRAZII Trading System Page
 * Simple signal table + TradingView embed
 * Auto-refresh every 30s from /api/crazii-signals
 */

import { useState, useEffect, useCallback } from 'react';

interface CraziiSignal {
  _id: string;
  time: number;
  side: 'buy' | 'sell';
  source: string;
  entry: number;
  sl: number;
  tp: number;
  rr: number;
  confidence: number;
  reason: string;
  confluences: { name: string; passed: boolean; detail: string }[];
  outcome: 'pending' | 'tp' | 'sl' | 'expired';
  createdAt: string;
}

function fmtPrice(p: number): string {
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================
// SIGNAL ROW
// ============================================================
function SignalRow({ signal }: { signal: CraziiSignal }) {
  const isBuy = signal.side === 'buy';
  const sideColor = isBuy ? '#22c55e' : '#ef4444';
  const outcomeColor =
    signal.outcome === 'pending' ? '#eab308' :
    signal.outcome === 'tp' ? '#22c55e' : '#ef4444';
  const outcomeIcon =
    signal.outcome === 'pending' ? '⏳' :
    signal.outcome === 'tp' ? '✅' :
    signal.outcome === 'expired' ? '⌛' : '❌';

  return (
    <tr style={{ borderBottom: '1px solid #1e293b' }}>
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#94a3b8' }}>
        {fmtTime(signal.time)}
      </td>
      <td style={{ padding: '8px 6px' }}>
        <span style={{
          color: sideColor,
          fontWeight: 700,
          fontSize: 12,
          padding: '2px 8px',
          borderRadius: 4,
          background: isBuy ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        }}>
          {signal.side.toUpperCase()}
        </span>
      </td>
      <td style={{ padding: '8px 6px', fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>
        {fmtPrice(signal.entry)}
      </td>
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#ef4444' }}>
        {fmtPrice(signal.sl)}
      </td>
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#22c55e' }}>
        {fmtPrice(signal.tp)}
      </td>
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>
        1:{signal.rr.toFixed(1)}
      </td>
      <td style={{ padding: '8px 6px' }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          padding: '2px 6px',
          borderRadius: 3,
          background: signal.confidence >= 80 ? '#22c55e' : signal.confidence >= 65 ? '#eab308' : '#f97316',
          color: '#000',
        }}>
          {signal.confidence}%
        </span>
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <span style={{ color: outcomeColor, fontSize: 12 }}>
          {outcomeIcon}
        </span>
      </td>
      <td style={{ padding: '8px 6px', fontSize: 10, color: '#64748b', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {signal.source}
      </td>
    </tr>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
interface CraziiPageProps { onBack: () => void; onLogout?: () => void; }

export default function CraziiPage({ onBack, onLogout }: CraziiPageProps) {
  const [signals, setSignals] = useState<CraziiSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [clearing, setClearing] = useState(false);

  const fetchSignals = useCallback(async () => {
    try {
      setError('');
      const res = await fetch('/api/crazii-signals', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok && data.signals) {
        setSignals(data.signals);
      }
      setLastRefresh(new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    } catch (err: any) {
      setError(err.message || 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearOldSignals = useCallback(async () => {
    const ok = window.confirm('Xóa toàn bộ tín hiệu CRAZII cũ để reset backtest?');
    if (!ok) return;

    try {
      setClearing(true);
      setError('');
      setStatusMessage('');

      const res = await fetch('/api/crazii-signals?scope=all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setSignals([]);
      setStatusMessage(`Da xoa ${data.cleared || 0} tin hieu cu. He thong san sang backtest moi.`);
      setLastRefresh(new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    } catch (err: any) {
      setError(err.message || 'Clear failed');
    } finally {
      setClearing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  // Auto-refresh every 30s
  useEffect(() => {
    const timer = setInterval(fetchSignals, 30000);
    return () => clearInterval(timer);
  }, [fetchSignals]);

  // Stats
  const pendingCount = signals.filter(s => s.outcome === 'pending').length;
  const tpCount = signals.filter(s => s.outcome === 'tp').length;
  const slCount = signals.filter(s => s.outcome === 'sl').length;
  const closedCount = tpCount + slCount;
  const winRate = closedCount > 0 ? Math.round((tpCount / closedCount) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#060d1a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* HEADER */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', borderBottom: '1px solid #1e293b', background: '#0a0e17',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
            ← Key Level
          </button>
          <h1 style={{ margin: 0, fontSize: 16, color: '#fbbf24', fontWeight: 800 }}>
            🏆 CRAZII SYSTEM
          </h1>
          <button
            onClick={clearOldSignals}
            disabled={clearing}
            title="Xóa toàn bộ tín hiệu cũ (MongoDB)"
            style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              border: '1px solid #991b1b',
              background: clearing ? '#334155' : '#7f1d1d',
              color: '#fee2e2',
              cursor: clearing ? 'not-allowed' : 'pointer',
              fontSize: 13,
              lineHeight: '24px',
              padding: 0,
              opacity: clearing ? 0.7 : 1,
            }}
          >
            🗑️
          </button>
          <button
            onClick={clearOldSignals}
            disabled={clearing}
            title="Xóa toàn bộ tín hiệu cũ (MongoDB)"
            style={{
              background: clearing ? '#334155' : '#7f1d1d',
              border: '1px solid #991b1b',
              color: '#fee2e2',
              padding: '3px 8px',
              borderRadius: 4,
              cursor: clearing ? 'not-allowed' : 'pointer',
              fontSize: 11,
              opacity: clearing ? 0.7 : 1,
            }}
          >
            {clearing ? 'Dang xoa...' : 'Xoa tin hieu'}
          </button>
          <span style={{ fontSize: 11, color: '#64748b' }}>OANDA:XAUUSD 5M</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>⏱️ {lastRefresh}</span>
          {closedCount > 0 && (
            <span style={{ fontSize: 11, color: winRate >= 60 ? '#22c55e' : '#eab308' }}>
              WR: {winRate}% ({tpCount}/{closedCount})
            </span>
          )}
          <button onClick={fetchSignals} style={{
            background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0',
            padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
          }}>
            🔄 Refresh
          </button>
          {onLogout && (
            <button onClick={onLogout} style={{
              background: '#1e293b', border: 'none', color: '#94a3b8',
              padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11,
            }}>
              Logout
            </button>
          )}
        </div>
      </header>

      {/* CONTENT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', height: 'calc(100vh - 50px)' }}>
        {/* TRADINGVIEW CHART */}
        <div style={{ height: '50vh', borderBottom: '1px solid #1e293b' }}>
          <iframe
            src="https://www.tradingview.com/widgetembed/?symbol=OANDA:XAUUSD&interval=5&theme=dark&style=1&timezone=Asia%2FHo_Chi_Minh&hide_top_toolbar=0&hide_legend=0&allow_symbol_change=1&save_image=0"
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="TradingView XAUUSD M5"
            allowFullScreen
          />
        </div>

        {/* SIGNAL TABLE */}
        <div style={{ overflow: 'auto', padding: '10px 16px' }}>
          {/* Stats bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>
              📋 Tín Hiệu CRAZII
            </span>
            <span style={{ fontSize: 10, color: '#eab308' }}>⏳ Pending: {pendingCount}</span>
            <span style={{ fontSize: 10, color: '#22c55e' }}>✅ TP: {tpCount}</span>
            <span style={{ fontSize: 10, color: '#ef4444' }}>❌ SL: {slCount}</span>
            {statusMessage && <span style={{ fontSize: 10, color: '#22c55e' }}>✅ {statusMessage}</span>}
            {error && <span style={{ fontSize: 10, color: '#ef4444' }}>⚠️ {error}</span>}
          </div>

          {loading && signals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#fbbf24' }}>
              ⏳ Đang tải tín hiệu...
            </div>
          ) : signals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              Chưa có tín hiệu. API sẽ tự scan mỗi 30s.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #334155' }}>
                    <th style={{ padding: '6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>Time</th>
                    <th style={{ padding: '6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>Side</th>
                    <th style={{ padding: '6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>Entry</th>
                    <th style={{ padding: '6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>SL</th>
                    <th style={{ padding: '6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>TP</th>
                    <th style={{ padding: '6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>R:R</th>
                    <th style={{ padding: '6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>Conf</th>
                    <th style={{ padding: '6px', textAlign: 'center', color: '#64748b', fontSize: 10, fontWeight: 600 }}>Result</th>
                    <th style={{ padding: '6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((sig) => (
                    <SignalRow key={sig._id} signal={sig} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Rules reminder */}
          <div style={{ marginTop: 16, padding: 10, background: '#0f172a', borderRadius: 6, fontSize: 10, color: '#64748b' }}>
            <b style={{ color: '#fbbf24' }}>📖 CRAZII Rules:</b>{' '}
            OP Rule (trên = BUY, dưới = SELL) • Tam Điểm (3 nến + OP + KSI + KCX) • Nhấn Chìm (Engulfing + OP) • KTR = TP target
          </div>
        </div>
      </div>

      {/* Floating clear button (always visible while scrolling) */}
      <button
        onClick={clearOldSignals}
        disabled={clearing}
        title="Xóa toàn bộ tín hiệu cũ (MongoDB)"
        style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          zIndex: 2000,
          background: clearing ? '#334155' : '#7f1d1d',
          border: '1px solid #991b1b',
          color: '#fee2e2',
          padding: '9px 12px',
          borderRadius: 999,
          cursor: clearing ? 'not-allowed' : 'pointer',
          fontSize: 12,
          fontWeight: 700,
          boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
          opacity: clearing ? 0.75 : 1,
        }}
      >
        {clearing ? '⏳ Dang xoa...' : '🗑️ Xoa tin hieu cu'}
      </button>
    </div>
  );
}
