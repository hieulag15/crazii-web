/**
 * NarrativePanel — Tab "Narrative" trong KeyLevelPage
 * Hiển thị kết quả Narrative Scan gần nhất + lịch sử 7 ngày
 * Cho phép trigger scan thủ công
 */

import { useState, useEffect, useCallback } from 'react';

// ─── Types (mirror api/narrative-scan.ts) ──────────────────────────────────────

interface TopGainer {
  symbol: string;
  change: number;
}

interface NarrativeResult {
  id:              string;
  name:            string;
  emoji:           string;
  change4h:        number;
  topGainers1h:    TopGainer[];
  potentialTokens: string[];
  coinCount:       number;
}

interface NarrativeScanData {
  scanTime:         number;
  narratives:       NarrativeResult[];
  topNarratives:    NarrativeResult[];
  allPotentialCoins: string[];
  marketHealth:     'strong' | 'moderate' | 'weak';
}

interface HistoryItem {
  scanTime:      number;
  marketHealth:  'strong' | 'moderate' | 'weak';
  topNarratives: Array<{ name: string; change4h: number }>;
  potentialCount: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function sym(s: string) { return s.replace('USDT', '').replace('BUSD', ''); }

function fmtTime(epoch: number) {
  return new Date(epoch * 1000).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: '2-digit',
  });
}

function changeColor(v: number) {
  if (v >= 5)  return '#00e676';
  if (v >= 2)  return '#69f0ae';
  if (v >= 0)  return '#ffd740';
  if (v >= -2) return '#ff9100';
  return '#ff1744';
}

function healthBadge(h: 'strong' | 'moderate' | 'weak') {
  const map = {
    strong:   { emoji: '✅', label: 'Mạnh',        bg: '#00c85322', color: '#00e676' },
    moderate: { emoji: '🟡', label: 'Trung bình',   bg: '#ffd74022', color: '#ffd740' },
    weak:     { emoji: '⚠️', label: 'Yếu',          bg: '#ff174422', color: '#ff5252' },
  };
  return map[h];
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function NarrativeCard({ n, onSelectCoin }: { n: NarrativeResult; onSelectCoin: (s: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const change4hColor = changeColor(n.change4h);

  return (
    <div style={{
      background: '#0d1422', border: '1px solid #1e293b',
      borderRadius: 10, marginBottom: 10, overflow: 'hidden',
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(p => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          gap: 10, padding: '12px 14px', background: 'none',
          border: 'none', cursor: 'pointer', color: '#f1f5f9', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 18 }}>{n.emoji}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{n.name}</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: change4hColor }}>
          {n.change4h >= 0 ? '+' : ''}{n.change4h.toFixed(1)}%
        </span>
        <span style={{ color: '#64748b', fontSize: 12, marginLeft: 6 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid #1e293b' }}>
          {/* Top gainers 1h */}
          {n.topGainers1h.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>🔥 Top tăng mạnh 1h</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {n.topGainers1h.map(g => (
                  <button
                    key={g.symbol}
                    onClick={() => onSelectCoin(g.symbol)}
                    style={{
                      background: '#1e293b', border: '1px solid #334155',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                      fontSize: 12, color: changeColor(g.change), fontWeight: 600,
                    }}
                  >
                    #{sym(g.symbol)} {g.change >= 0 ? '+' : ''}{g.change.toFixed(1)}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Potential tokens */}
          {n.potentialTokens.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>💎 Token tiềm năng</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {n.potentialTokens.map(t => (
                  <button
                    key={t}
                    onClick={() => onSelectCoin(t)}
                    style={{
                      background: '#fbbf2415', border: '1px solid #fbbf2440',
                      borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                      fontSize: 12, color: '#fbbf24', fontWeight: 600,
                    }}
                  >
                    #{sym(t)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: 11, color: '#475569' }}>
            {n.coinCount} coin đã scan
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ item }: { item: HistoryItem }) {
  const hb = healthBadge(item.marketHealth);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 12px', borderBottom: '1px solid #1e293b', fontSize: 12,
    }}>
      <span style={{ color: '#64748b', minWidth: 95 }}>{fmtTime(item.scanTime)}</span>
      <span style={{
        padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
        background: hb.bg, color: hb.color,
      }}>
        {hb.emoji} {hb.label}
      </span>
      <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {item.topNarratives.map(n => (
          <span key={n.name} style={{ color: changeColor(n.change4h), fontWeight: 600 }}>
            {n.name.split(' ')[0]} {n.change4h >= 0 ? '+' : ''}{n.change4h}%
          </span>
        ))}
      </div>
      <span style={{ color: '#fbbf24', minWidth: 60, textAlign: 'right' }}>
        💎 {item.potentialCount}
      </span>
    </div>
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────────

interface Props {
  /** Khi user click vào 1 coin tiềm năng → switch sang chart tab với coin đó */
  onSelectCoin?: (symbol: string) => void;
}

export default function NarrativePanel({ onSelectCoin }: Props) {
  const [scan, setScan]       = useState<NarrativeScanData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeView, setActiveView] = useState<'latest' | 'all' | 'history'>('latest');
  const [error, setError]     = useState<string | null>(null);

  const loadLatest = useCallback(async () => {
    try {
      const r = await fetch('/api/narrative-scan?action=latest');
      const j = await r.json();
      if (j.ok && j.data) setScan(j.data as NarrativeScanData);
    } catch (e) {
      setError('Không thể tải dữ liệu narrative');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/narrative-scan?action=history');
      const j = await r.json();
      if (j.ok) setHistory(j.history ?? []);
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    loadLatest();
    loadHistory();
  }, [loadLatest, loadHistory]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    try {
      const r = await fetch('/api/narrative-scan', { method: 'POST' });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error ?? 'Scan failed');
      await loadLatest();
      await loadHistory();
    } catch (e: any) {
      setError(e.message ?? 'Scan thất bại');
    } finally {
      setScanning(false);
    }
  };

  const handleSelectCoin = (symbol: string) => {
    onSelectCoin?.(symbol);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const displayNarratives = activeView === 'latest'
    ? (scan?.topNarratives ?? [])
    : (scan?.narratives ?? []).filter(n => n.change4h > 0);

  return (
    <div style={{ padding: '0 4px', color: '#f1f5f9' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📊 Narrative Alert</div>
          {scan && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Cập nhật: {fmtTime(scan.scanTime)}
            </div>
          )}
        </div>

        {scan && (
          <div style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: healthBadge(scan.marketHealth).bg,
            color: healthBadge(scan.marketHealth).color,
            border: `1px solid ${healthBadge(scan.marketHealth).color}40`,
          }}>
            {healthBadge(scan.marketHealth).emoji} Market {healthBadge(scan.marketHealth).label}
          </div>
        )}

        <button
          onClick={handleScan}
          disabled={scanning}
          style={{
            marginLeft: 'auto', padding: '6px 14px', borderRadius: 8,
            background: scanning ? '#1e293b' : '#3b82f6',
            color: '#fff', border: 'none', cursor: scanning ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {scanning ? (
            <><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span> Đang scan...</>
          ) : '🔄 Scan ngay'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#7f1d1d', color: '#fca5a5', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── View tabs ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {([ ['latest', 'Top 3 Mạnh'], ['all', 'Tất cả Tích cực'], ['history', '📅 Lịch sử'] ] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
              background: activeView === v ? '#3b82f6' : '#1e293b',
              color: activeView === v ? '#fff' : '#94a3b8',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Loading ─────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
          ⏳ Đang tải dữ liệu narrative...
        </div>
      )}

      {/* ── No data ─────────────────────────────────────────────────────────── */}
      {!loading && !scan && activeView !== 'history' && (
        <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
          <div style={{ marginBottom: 8 }}>Chưa có dữ liệu scan</div>
          <div style={{ fontSize: 12 }}>Nhấn "Scan ngay" để phân tích narrative đầu tiên</div>
        </div>
      )}

      {/* ── Narrative cards (latest / all) ────────────────────────────────── */}
      {!loading && scan && activeView !== 'history' && (
        <>
          {/* All potential coins summary */}
          {scan.allPotentialCoins.length > 0 && (
            <div style={{
              background: '#fbbf2410', border: '1px solid #fbbf2430',
              borderRadius: 10, padding: '10px 14px', marginBottom: 14,
            }}>
              <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 8, fontWeight: 600 }}>
                💎 Token tiềm năng từ top narratives ({scan.allPotentialCoins.length} coins)
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {scan.allPotentialCoins.map(c => (
                  <button
                    key={c}
                    onClick={() => handleSelectCoin(c)}
                    style={{
                      background: '#fbbf2418', border: '1px solid #fbbf2450',
                      borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
                      fontSize: 12, color: '#fde68a', fontWeight: 700,
                    }}
                  >
                    #{sym(c)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Narrative cards */}
          {displayNarratives.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#64748b', fontSize: 13 }}>
              Không có narrative tích cực trong chu kỳ này
            </div>
          ) : (
            displayNarratives.map(n => (
              <NarrativeCard key={n.id} n={n} onSelectCoin={handleSelectCoin} />
            ))
          )}
        </>
      )}

      {/* ── History ─────────────────────────────────────────────────────────── */}
      {activeView === 'history' && (
        <div style={{ background: '#0d1422', border: '1px solid #1e293b', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #1e293b', fontSize: 12, color: '#64748b', display: 'flex', gap: 10 }}>
            <span style={{ minWidth: 95 }}>Thời gian</span>
            <span style={{ minWidth: 90 }}>Market</span>
            <span style={{ flex: 1 }}>Top Narratives</span>
            <span style={{ minWidth: 60, textAlign: 'right' }}>Tiềm năng</span>
          </div>
          {history.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Chưa có lịch sử
            </div>
          ) : (
            history.map((item, i) => <HistoryRow key={i} item={item} />)
          )}
        </div>
      )}

      {/* spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
