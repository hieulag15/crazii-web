/**
 * CRAZII Trading System Page
 * Tabs: 📋 Tín Hiệu | 💼 Lệnh của tôi
 * Real-time P&L, position sizing, wallet management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../utils/apiClient';

// ===== Types =====

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

interface Position {
  _id: string;
  userId: string;
  signalId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  entry: number;
  sl: number;
  tp: number;
  leverage: number;
  positionSize: number;
  riskAmount: number;
  status: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual';
  openedAt: string;
  closedAt?: string;
  pnlDollar: number;
  currentPrice: number;
}

interface EnterTradeModal {
  signal: CraziiSignal;
  riskAmount: number;
  leverage: number;
  positionSize: number;
  slDistancePct: number;
}

// ===== Helpers =====

function fmtPrice(p: number): string {
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function calcPositionSize(
  walletBalance: number,
  riskPerTrade: number,
  maxLossPerTrade: number,
  entry: number,
  sl: number,
) {
  const riskAmount = Math.min(walletBalance * (riskPerTrade / 100), maxLossPerTrade);
  const slDistancePct = Math.abs(entry - sl) / entry;
  if (slDistancePct === 0) return { riskAmount, slDistancePct: 0, leverage: 1, positionSize: riskAmount };
  const rawLeverage = riskAmount / (walletBalance * slDistancePct);
  const leverage = Math.max(1, Math.min(125, Math.round(rawLeverage)));
  const positionSize = riskAmount / slDistancePct;
  return { riskAmount, slDistancePct, leverage, positionSize };
}

function calcPnl(pos: Position, price: number): number {
  const { side, entry, positionSize, leverage } = pos;
  if (side === 'buy') return ((price - entry) / entry) * positionSize * leverage;
  return ((entry - price) / entry) * positionSize * leverage;
}

function pnlColor(pnl: number): string {
  if (pnl > 0) return '#22c55e';
  if (pnl < 0) return '#ef4444';
  return '#94a3b8';
}

// ===== Signal Row =====

function SignalRow({
  signal,
  onEnterTrade,
  walletReady,
}: {
  signal: CraziiSignal;
  onEnterTrade: (signal: CraziiSignal) => void;
  walletReady: boolean;
}) {
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
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#94a3b8' }}>{fmtTime(signal.time)}</td>
      <td style={{ padding: '8px 6px' }}>
        <span style={{ color: sideColor, fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 4, background: isBuy ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }}>
          {signal.side.toUpperCase()}
        </span>
      </td>
      <td style={{ padding: '8px 6px', fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{fmtPrice(signal.entry)}</td>
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#ef4444' }}>{fmtPrice(signal.sl)}</td>
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#22c55e' }}>{fmtPrice(signal.tp)}</td>
      <td style={{ padding: '8px 6px', fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>1:{signal.rr.toFixed(1)}</td>
      <td style={{ padding: '8px 6px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: signal.confidence >= 80 ? '#22c55e' : signal.confidence >= 65 ? '#eab308' : '#f97316', color: '#000' }}>
          {signal.confidence}%
        </span>
      </td>
      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
        <span style={{ color: outcomeColor, fontSize: 12 }}>{outcomeIcon}</span>
      </td>
      <td style={{ padding: '8px 6px', fontSize: 10, color: '#64748b', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{signal.source}</td>
      <td style={{ padding: '8px 6px' }}>
        {signal.outcome === 'pending' && walletReady && (
          <button
            onClick={() => onEnterTrade(signal)}
            style={{ background: '#1e3a5f', border: '1px solid #3b82f6', color: '#93c5fd', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            📈 Vào lệnh
          </button>
        )}
      </td>
    </tr>
  );
}

// ===== P&L Progress Bar =====

function PnlBar({ pos }: { pos: Position }) {
  const range = pos.tp - pos.sl;
  if (range <= 0) return null;
  const current = pos.currentPrice;
  const raw = ((current - pos.sl) / range) * 100;
  const pct = Math.max(0, Math.min(100, raw));
  const entryPct = ((pos.entry - pos.sl) / range) * 100;
  const pnl = calcPnl(pos, current);
  const pnlPct = pos.positionSize > 0 ? (pnl / pos.riskAmount) * 100 : 0;

  return (
    <div style={{ width: '100%', minWidth: 120 }}>
      <div style={{ position: 'relative', height: 10, background: '#1e293b', borderRadius: 5, overflow: 'visible' }}>
        {/* SL zone */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: `${entryPct}%`, height: '100%', background: 'rgba(239,68,68,0.25)', borderRadius: '5px 0 0 5px' }} />
        {/* TP zone */}
        <div style={{ position: 'absolute', left: `${entryPct}%`, top: 0, width: `${100 - entryPct}%`, height: '100%', background: 'rgba(34,197,94,0.18)', borderRadius: '0 5px 5px 0' }} />
        {/* Current price marker */}
        <div style={{ position: 'absolute', left: `${pct}%`, top: -2, width: 4, height: 14, background: pnl >= 0 ? '#22c55e' : '#ef4444', borderRadius: 2, transform: 'translateX(-50%)' }} />
        {/* Entry marker */}
        <div style={{ position: 'absolute', left: `${entryPct}%`, top: 0, width: 2, height: 10, background: '#fbbf24', transform: 'translateX(-50%)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginTop: 2 }}>
        <span style={{ color: '#ef4444' }}>SL {fmtPrice(pos.sl)}</span>
        <span style={{ color: pnlColor(pnl), fontWeight: 700 }}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}$ ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(0)}%)
        </span>
        <span style={{ color: '#22c55e' }}>TP {fmtPrice(pos.tp)}</span>
      </div>
    </div>
  );
}

// ===== Enter Trade Modal =====

function EnterTradeModalView({
  modal,
  onConfirm,
  onCancel,
}: {
  modal: EnterTradeModal;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { signal, riskAmount, leverage, positionSize, slDistancePct } = modal;
  const isBuy = signal.side === 'buy';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0a1628', border: '1px solid #2a3f5f', borderRadius: 12, padding: '1.5rem', maxWidth: 380, width: '100%' }}>
        <h3 style={{ margin: '0 0 1rem', color: '#fbbf24', fontSize: '1rem' }}>📈 Xác nhận vào lệnh</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
          {[
            ['Symbol', signal.source || 'XAUUSD'],
            ['Side', <span style={{ color: isBuy ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{signal.side.toUpperCase()}</span>],
            ['Entry', fmtPrice(signal.entry)],
            ['SL', <span style={{ color: '#ef4444' }}>{fmtPrice(signal.sl)}</span>],
            ['TP', <span style={{ color: '#22c55e' }}>{fmtPrice(signal.tp)}</span>],
            ['SL Distance', `${(slDistancePct * 100).toFixed(2)}%`],
            ['Leverage', <span style={{ color: '#fbbf24', fontWeight: 700 }}>{leverage}x</span>],
            ['Position Size', `$${positionSize.toFixed(2)}`],
            ['Risk Amount', <span style={{ color: '#ef4444', fontWeight: 700 }}>${riskAmount.toFixed(2)}</span>],
            ['R:R', `1:${signal.rr.toFixed(1)}`],
          ].map(([label, value], i) => (
            <div key={i} style={{ background: '#0f1e38', borderRadius: 6, padding: '0.4rem 0.6rem' }}>
              <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
              <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{value as React.ReactNode}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: '1px solid #2a3f5f', background: '#1a2744', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}>
            Hủy
          </button>
          <button onClick={onConfirm} style={{ flex: 2, padding: '0.6rem', borderRadius: 8, border: 'none', background: isBuy ? '#16a34a' : '#dc2626', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>
            ✅ Xác nhận {signal.side.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===== Positions Tab =====

function PositionsTab({
  positions,
  currentPrice,
  onClose,
  walletBalance,
}: {
  positions: Position[];
  currentPrice: number | null;
  onClose: (id: string, status: 'closed_tp' | 'closed_sl' | 'closed_manual') => void;
  walletBalance: number;
}) {
  const openPositions = positions.filter(p => p.status === 'open');
  const closedPositions = positions.filter(p => p.status !== 'open');

  const totalPnlOpen = openPositions.reduce((sum, p) => {
    const price = currentPrice ?? p.currentPrice;
    return sum + calcPnl(p, price);
  }, 0);

  const totalPnlClosed = closedPositions.reduce((sum, p) => sum + p.pnlDollar, 0);
  const totalPnl = totalPnlOpen + totalPnlClosed;

  return (
    <div>
      {/* Wallet Summary */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, padding: '8px 12px', background: '#0a1628', borderRadius: 8, border: '1px solid #1e3a5f' }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          💰 Ví: <b style={{ color: '#22c55e' }}>${walletBalance.toFixed(0)}</b>
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          📊 Open P&L: <b style={{ color: pnlColor(totalPnlOpen) }}>{totalPnlOpen >= 0 ? '+' : ''}{totalPnlOpen.toFixed(2)}$</b>
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          🏁 Closed P&L: <b style={{ color: pnlColor(totalPnlClosed) }}>{totalPnlClosed >= 0 ? '+' : ''}{totalPnlClosed.toFixed(2)}$</b>
        </span>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>
          💹 P&L tổng: <b style={{ color: pnlColor(totalPnl), fontSize: 13 }}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}$</b>
        </span>
        {currentPrice && (
          <span style={{ fontSize: 11, color: '#64748b' }}>
            📡 Giá: <b style={{ color: '#fbbf24' }}>{fmtPrice(currentPrice)}</b>
          </span>
        )}
      </div>

      {openPositions.length === 0 && closedPositions.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
          Chưa có lệnh nào. Nhấn "📈 Vào lệnh" ở tab Tín Hiệu để mở lệnh.
        </div>
      )}

      {openPositions.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700, marginBottom: 6 }}>🟢 Lệnh đang mở ({openPositions.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #334155' }}>
                  {['Symbol', 'Side', 'Entry', 'SL', 'TP', 'Lev', 'Risk$', 'P&L', 'Progress', 'Action'].map(h => (
                    <th key={h} style={{ padding: '5px 6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {openPositions.map(pos => {
                  const price = currentPrice ?? pos.currentPrice;
                  const pnl = calcPnl(pos, price);
                  return (
                    <tr key={pos._id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '6px', color: '#e2e8f0', fontWeight: 600 }}>{pos.symbol}</td>
                      <td style={{ padding: '6px' }}>
                        <span style={{ color: pos.side === 'buy' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{pos.side.toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '6px', color: '#e2e8f0' }}>{fmtPrice(pos.entry)}</td>
                      <td style={{ padding: '6px', color: '#ef4444' }}>{fmtPrice(pos.sl)}</td>
                      <td style={{ padding: '6px', color: '#22c55e' }}>{fmtPrice(pos.tp)}</td>
                      <td style={{ padding: '6px', color: '#fbbf24' }}>{pos.leverage}x</td>
                      <td style={{ padding: '6px', color: '#ef4444' }}>${pos.riskAmount.toFixed(2)}</td>
                      <td style={{ padding: '6px', color: pnlColor(pnl), fontWeight: 700 }}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}$
                      </td>
                      <td style={{ padding: '6px', minWidth: 150 }}>
                        <PnlBar pos={{ ...pos, currentPrice: price }} />
                      </td>
                      <td style={{ padding: '6px' }}>
                        <button onClick={() => onClose(pos._id, 'closed_manual')}
                          style={{ background: '#1e293b', border: '1px solid #475569', color: '#94a3b8', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 10 }}>
                          Đóng
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {closedPositions.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, margin: '12px 0 6px' }}>🔒 Lịch sử ({closedPositions.length})</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #334155' }}>
                  {['Symbol', 'Side', 'Entry', 'Close', 'Lev', 'P&L', 'Status', 'Thời gian'].map(h => (
                    <th key={h} style={{ padding: '5px 6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {closedPositions.map(pos => (
                  <tr key={pos._id} style={{ borderBottom: '1px solid #1e293b', opacity: 0.75 }}>
                    <td style={{ padding: '6px', color: '#e2e8f0' }}>{pos.symbol}</td>
                    <td style={{ padding: '6px' }}>
                      <span style={{ color: pos.side === 'buy' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{pos.side.toUpperCase()}</span>
                    </td>
                    <td style={{ padding: '6px', color: '#94a3b8' }}>{fmtPrice(pos.entry)}</td>
                    <td style={{ padding: '6px', color: '#94a3b8' }}>{fmtPrice(pos.currentPrice)}</td>
                    <td style={{ padding: '6px', color: '#fbbf24' }}>{pos.leverage}x</td>
                    <td style={{ padding: '6px', color: pnlColor(pos.pnlDollar), fontWeight: 700 }}>
                      {pos.pnlDollar >= 0 ? '+' : ''}{pos.pnlDollar.toFixed(2)}$
                    </td>
                    <td style={{ padding: '6px', fontSize: 10 }}>
                      <span style={{ color: pos.status === 'closed_tp' ? '#22c55e' : pos.status === 'closed_sl' ? '#ef4444' : '#94a3b8' }}>
                        {pos.status === 'closed_tp' ? '✅ TP' : pos.status === 'closed_sl' ? '❌ SL' : '🔒 Manual'}
                      </span>
                    </td>
                    <td style={{ padding: '6px', color: '#64748b', fontSize: 10 }}>
                      {pos.closedAt ? new Date(pos.closedAt).toLocaleDateString('vi-VN') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ===== Main Page =====

interface CraziiPageProps { onBack: () => void; onLogout?: () => void; }

export default function CraziiPage({ onBack, onLogout }: CraziiPageProps) {
  const { user } = useAuth();
  const settings = user?.settings;
  const walletBalance = settings?.walletBalance ?? 300;
  const riskPerTrade = settings?.riskPerTrade ?? 2;
  const maxLossPerTrade = settings?.maxLossPerTrade ?? 10;
  const walletReady = !!user;

  // Signals
  const [signals, setSignals] = useState<CraziiSignal[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [lastRefresh, setLastRefresh] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [clearing, setClearing] = useState(false);

  // Positions
  const [positions, setPositions] = useState<Position[]>([]);
  const [loadingPos, setLoadingPos] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState<'signals' | 'positions'>('signals');
  const [enterModal, setEnterModal] = useState<EnterTradeModal | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Real-time price
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const priceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch signals ──────────────────────────────────────────────────────────
  const fetchSignals = useCallback(async () => {
    try {
      setError('');
      const res = await fetch('/api/crazii-signals', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok && data.signals) setSignals(data.signals);
      setLastRefresh(new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    } catch (err: any) {
      setError(err.message || 'Fetch failed');
    } finally {
      setLoadingSignals(false);
    }
  }, []);

  // ── Fetch positions ────────────────────────────────────────────────────────
  const fetchPositions = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoadingPos(true);
    try {
      const res = await fetch('/api/crazii-positions', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.ok && data.positions) setPositions(data.positions);
    } catch { /* silent */ } finally {
      setLoadingPos(false);
    }
  }, []);

  // ── Price polling every 10s ────────────────────────────────────────────────
  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch('https://fapi.binance.com/fapi/v1/ticker/price?symbol=XAUUSDT');
      if (res.ok) {
        const json = await res.json();
        setCurrentPrice(parseFloat(json.price));
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    fetchSignals();
    fetchPositions();
    fetchPrice();
  }, [fetchSignals, fetchPositions, fetchPrice]);

  useEffect(() => {
    const t = setInterval(fetchSignals, 30000);
    return () => clearInterval(t);
  }, [fetchSignals]);

  useEffect(() => {
    priceTimerRef.current = setInterval(fetchPrice, 10000);
    return () => { if (priceTimerRef.current) clearInterval(priceTimerRef.current); };
  }, [fetchPrice]);

  // Auto-detect SL/TP hit
  useEffect(() => {
    if (!currentPrice) return;
    const openPositions = positions.filter(p => p.status === 'open');
    for (const pos of openPositions) {
      let hitStatus: 'closed_tp' | 'closed_sl' | null = null;
      if (pos.side === 'buy') {
        if (currentPrice >= pos.tp) hitStatus = 'closed_tp';
        else if (currentPrice <= pos.sl) hitStatus = 'closed_sl';
      } else {
        if (currentPrice <= pos.tp) hitStatus = 'closed_tp';
        else if (currentPrice >= pos.sl) hitStatus = 'closed_sl';
      }
      if (hitStatus) {
        handleClosePosition(pos._id, hitStatus, currentPrice);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPrice]);

  // ── Enter trade ────────────────────────────────────────────────────────────
  const handleEnterTrade = useCallback((signal: CraziiSignal) => {
    const { riskAmount, slDistancePct, leverage, positionSize } = calcPositionSize(
      walletBalance, riskPerTrade, maxLossPerTrade, signal.entry, signal.sl,
    );
    setEnterModal({ signal, riskAmount, leverage, positionSize, slDistancePct });
  }, [walletBalance, riskPerTrade, maxLossPerTrade]);

  const handleConfirmTrade = useCallback(async () => {
    if (!enterModal) return;
    setSubmitting(true);
    try {
      const token = getToken();
      const { signal, riskAmount, leverage, positionSize } = enterModal;
      const res = await fetch('/api/crazii-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          signalId: signal._id,
          symbol: signal.source || 'XAUUSD',
          side: signal.side,
          entry: signal.entry,
          sl: signal.sl,
          tp: signal.tp,
          leverage,
          positionSize,
          riskAmount,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setEnterModal(null);
        setActiveTab('positions');
        await fetchPositions();
      } else {
        alert(data.error || 'Lỗi khi mở lệnh');
      }
    } catch (err: any) {
      alert(err.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  }, [enterModal, fetchPositions]);

  // ── Close position ─────────────────────────────────────────────────────────
  const handleClosePosition = useCallback(async (
    id: string,
    status: 'closed_tp' | 'closed_sl' | 'closed_manual',
    closePrice?: number,
  ) => {
    const token = getToken();
    try {
      const body: Record<string, unknown> = { status };
      if (closePrice !== undefined) body.currentPrice = closePrice;
      else if (currentPrice) body.currentPrice = currentPrice;

      const res = await fetch(`/api/crazii-positions?id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setPositions(prev => prev.map(p => p._id === id ? { ...p, ...data.position, _id: id } : p));
      }
    } catch { /* silent */ }
  }, [currentPrice]);

  // ── Clear old signals ──────────────────────────────────────────────────────
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
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSignals([]);
      setStatusMessage(`Da xoa ${data.cleared || 0} tin hieu cu.`);
      setLastRefresh(new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    } catch (err: any) {
      setError(err.message || 'Clear failed');
    } finally {
      setClearing(false);
    }
  }, []);

  // Stats
  const pendingCount = signals.filter(s => s.outcome === 'pending').length;
  const tpCount = signals.filter(s => s.outcome === 'tp').length;
  const slCount = signals.filter(s => s.outcome === 'sl').length;
  const closedCount = tpCount + slCount;
  const winRate = closedCount > 0 ? Math.round((tpCount / closedCount) * 100) : 0;
  const openPositionsCount = positions.filter(p => p.status === 'open').length;

  return (
    <div style={{ minHeight: '100vh', background: '#060d1a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #1e293b', background: '#0a0e17' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>← Key Level</button>
          <h1 style={{ margin: 0, fontSize: 16, color: '#fbbf24', fontWeight: 800 }}>🏆 CRAZII SYSTEM</h1>
          <button onClick={clearOldSignals} disabled={clearing} title="Xóa toàn bộ tín hiệu cũ"
            style={{ width: 26, height: 26, borderRadius: 999, border: '1px solid #991b1b', background: clearing ? '#334155' : '#7f1d1d', color: '#fee2e2', cursor: clearing ? 'not-allowed' : 'pointer', fontSize: 13, lineHeight: '24px', padding: 0, opacity: clearing ? 0.7 : 1 }}>
            🗑️
          </button>
          <span style={{ fontSize: 11, color: '#64748b' }}>OANDA:XAUUSD 5M</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {currentPrice && <span style={{ fontSize: 11, color: '#fbbf24' }}>📡 {fmtPrice(currentPrice)}</span>}
          <span style={{ fontSize: 10, color: '#64748b' }}>⏱️ {lastRefresh}</span>
          {closedCount > 0 && <span style={{ fontSize: 11, color: winRate >= 60 ? '#22c55e' : '#eab308' }}>WR: {winRate}% ({tpCount}/{closedCount})</span>}
          <button onClick={() => { fetchSignals(); fetchPositions(); }}
            style={{ background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>
            🔄 Refresh
          </button>
          {onLogout && (
            <button onClick={onLogout} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Logout</button>
          )}
        </div>
      </header>

      {/* CHART */}
      <div style={{ height: '45vh', borderBottom: '1px solid #1e293b' }}>
        <iframe
          src="https://www.tradingview.com/widgetembed/?symbol=OANDA:XAUUSD&interval=5&theme=dark&style=1&timezone=Asia%2FHo_Chi_Minh&hide_top_toolbar=0&hide_legend=0&allow_symbol_change=1&save_image=0"
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="TradingView XAUUSD M5"
          allowFullScreen
        />
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', background: '#0a0e17' }}>
        <button
          onClick={() => setActiveTab('signals')}
          style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', borderBottom: activeTab === 'signals' ? '2px solid #fbbf24' : '2px solid transparent', background: 'none', color: activeTab === 'signals' ? '#fbbf24' : '#64748b' }}>
          📋 Tín Hiệu {pendingCount > 0 && <span style={{ marginLeft: 4, background: '#eab308', color: '#000', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{pendingCount}</span>}
        </button>
        <button
          onClick={() => setActiveTab('positions')}
          style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', borderBottom: activeTab === 'positions' ? '2px solid #22c55e' : '2px solid transparent', background: 'none', color: activeTab === 'positions' ? '#22c55e' : '#64748b' }}>
          💼 Lệnh của tôi {openPositionsCount > 0 && <span style={{ marginLeft: 4, background: '#22c55e', color: '#000', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>{openPositionsCount}</span>}
        </button>
      </div>

      {/* TAB CONTENT */}
      <div style={{ overflow: 'auto', padding: '10px 16px', height: 'calc(55vh - 90px)' }}>

        {/* ── SIGNALS TAB ── */}
        {activeTab === 'signals' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>📋 Tín Hiệu CRAZII</span>
              <span style={{ fontSize: 10, color: '#eab308' }}>⏳ Pending: {pendingCount}</span>
              <span style={{ fontSize: 10, color: '#22c55e' }}>✅ TP: {tpCount}</span>
              <span style={{ fontSize: 10, color: '#ef4444' }}>❌ SL: {slCount}</span>
              {statusMessage && <span style={{ fontSize: 10, color: '#22c55e' }}>✅ {statusMessage}</span>}
              {error && <span style={{ fontSize: 10, color: '#ef4444' }}>⚠️ {error}</span>}
            </div>

            {loadingSignals && signals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#fbbf24' }}>⏳ Đang tải tín hiệu...</div>
            ) : signals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Chưa có tín hiệu. API sẽ tự scan mỗi 30s.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #334155' }}>
                      {['Time', 'Side', 'Entry', 'SL', 'TP', 'R:R', 'Conf', 'Result', 'Source', ''].map(h => (
                        <th key={h} style={{ padding: '6px', textAlign: 'left', color: '#64748b', fontSize: 10, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map(sig => (
                      <SignalRow key={sig._id} signal={sig} onEnterTrade={handleEnterTrade} walletReady={walletReady} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 16, padding: 10, background: '#0f172a', borderRadius: 6, fontSize: 10, color: '#64748b' }}>
              <b style={{ color: '#fbbf24' }}>📖 CRAZII Rules:</b>{' '}
              OP Rule (trên = BUY, dưới = SELL) • Tam Điểm (3 nến + OP + KSI + KCX) • Nhấn Chìm (Engulfing + OP) • KTR = TP target
            </div>
          </>
        )}

        {/* ── POSITIONS TAB ── */}
        {activeTab === 'positions' && (
          <>
            {loadingPos && positions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#fbbf24' }}>⏳ Đang tải lệnh...</div>
            ) : (
              <PositionsTab
                positions={positions}
                currentPrice={currentPrice}
                onClose={(id, status) => handleClosePosition(id, status)}
                walletBalance={walletBalance}
              />
            )}
          </>
        )}
      </div>

      {/* Enter Trade Modal */}
      {enterModal && (
        <EnterTradeModalView
          modal={enterModal}
          onConfirm={submitting ? () => {} : handleConfirmTrade}
          onCancel={() => setEnterModal(null)}
        />
      )}

      {/* Floating clear button */}
      <button onClick={clearOldSignals} disabled={clearing} title="Xóa toàn bộ tín hiệu cũ (MongoDB)"
        style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 2000, background: clearing ? '#334155' : '#7f1d1d', border: '1px solid #991b1b', color: '#fee2e2', padding: '9px 12px', borderRadius: 999, cursor: clearing ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 22px rgba(0,0,0,0.35)', opacity: clearing ? 0.75 : 1 }}>
        {clearing ? '⏳ Dang xoa...' : '🗑️ Xoa tin hieu cu'}
      </button>
    </div>
  );
}
