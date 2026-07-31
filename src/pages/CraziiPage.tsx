/**
 * CRAZII Trading System Page
 * Hệ thống CRAZII + FVG/OB + Signal Call tự động
 * Cặp giao dịch: OANDA:XAUUSD (Vàng / Đô la Mỹ - Forex Spot)
 * Logic hợp lưu: Tam Điểm Hội Tụ + Nhấn Chìm + FVG/OB
 * TÁCH BIỆT hoàn toàn với Key Level (crypto)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, Time, SeriesMarker } from 'lightweight-charts';
import { fetchOandaGoldCandles, fetchOandaGoldDaily, connectGoldWebSocket } from '../utils/craziiDataService';
import type { LiveGoldCandle } from '../utils/craziiDataService';
import { calculateAll, calculateADR, calculatePivot } from '../utils/craziiEngine';
import type { Candle, CraziiResult, EnhancedSignal } from '../types/index';

const GMT7_OFFSET = 7 * 3600;

function fmtPrice(p: number): string {
  if (p >= 100) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(6);
}

function fmtTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// ============================================================
// SIGNAL OUTCOME: Tính trạng thái signal (đang chờ / TP / SL)
// ============================================================
type SignalOutcome = 'pending' | 'tp1' | 'tp2' | 'tp3' | 'sl';

function getSignalOutcome(signal: EnhancedSignal, candles: Candle[]): { outcome: SignalOutcome; hitPrice: number | null; hitTime: number | null } {
  // Tìm vị trí nến signal
  const sigIdx = candles.findIndex(c => c.time === signal.time);
  if (sigIdx < 0 || sigIdx >= candles.length - 1) return { outcome: 'pending', hitPrice: null, hitTime: null };

  const isBuy = signal.side === 'buy';

  for (let i = sigIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    // Check SL first (worst case)
    if (isBuy && c.low <= signal.sl) {
      return { outcome: 'sl', hitPrice: signal.sl, hitTime: c.time };
    }
    if (!isBuy && c.high >= signal.sl) {
      return { outcome: 'sl', hitPrice: signal.sl, hitTime: c.time };
    }
    // Check TP3
    if (isBuy && c.high >= signal.tp3) {
      return { outcome: 'tp3', hitPrice: signal.tp3, hitTime: c.time };
    }
    if (!isBuy && c.low <= signal.tp3) {
      return { outcome: 'tp3', hitPrice: signal.tp3, hitTime: c.time };
    }
    // Check TP2
    if (isBuy && c.high >= signal.tp2) {
      return { outcome: 'tp2', hitPrice: signal.tp2, hitTime: c.time };
    }
    if (!isBuy && c.low <= signal.tp2) {
      return { outcome: 'tp2', hitPrice: signal.tp2, hitTime: c.time };
    }
    // Check TP1
    if (isBuy && c.high >= signal.tp1) {
      return { outcome: 'tp1', hitPrice: signal.tp1, hitTime: c.time };
    }
    if (!isBuy && c.low <= signal.tp1) {
      return { outcome: 'tp1', hitPrice: signal.tp1, hitTime: c.time };
    }
  }
  return { outcome: 'pending', hitPrice: null, hitTime: null };
}

const OUTCOME_COLORS: Record<SignalOutcome, string> = {
  pending: '#eab308', tp1: '#22c55e', tp2: '#10b981', tp3: '#059669', sl: '#ef4444',
};
const OUTCOME_LABELS: Record<SignalOutcome, string> = {
  pending: '⏳ Đang chờ', tp1: '✅ TP1', tp2: '✅✅ TP2', tp3: '🏆 TP3', sl: '❌ SL',
};

// ============================================================
// CONFIDENCE BADGE
// ============================================================
function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 80 ? '#22c55e' : value >= 65 ? '#eab308' : '#f97316';
  const label = value >= 80 ? 'STRONG' : value >= 65 ? 'GOOD' : 'MODERATE';
  return (
    <span style={{ background: color, color: '#000', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
      {value}% {label}
    </span>
  );
}

// ============================================================
// SIGNAL CARD with Outcome tracking
// ============================================================
function SignalCard({ signal, candles, isLatest }: { signal: EnhancedSignal; candles: Candle[]; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = signal.side === 'buy';
  const borderColor = isBuy ? '#22c55e' : '#ef4444';
  const bgColor = isBuy ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';

  const { outcome, hitTime } = getSignalOutcome(signal, candles);
  const outcomeColor = OUTCOME_COLORS[outcome];
  const outcomeLabel = OUTCOME_LABELS[outcome];

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        border: `1px solid ${borderColor}`,
        borderLeft: `4px solid ${borderColor}`,
        background: bgColor,
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 8,
        cursor: 'pointer',
        opacity: outcome === 'sl' ? 0.7 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: borderColor, fontWeight: 700, fontSize: 14 }}>
            {isBuy ? '🟢 BUY' : '🔴 SELL'}
          </span>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>{signal.source}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ background: outcomeColor, color: '#000', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700 }}>
            {outcomeLabel}
          </span>
          <ConfidenceBadge value={signal.confidence} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 8, fontSize: 11 }}>
        <div><span style={{ color: '#64748b' }}>Entry</span><br /><b style={{ color: '#e2e8f0' }}>{fmtPrice(signal.entry)}</b></div>
        <div><span style={{ color: '#64748b' }}>SL</span><br /><b style={{ color: '#ef4444' }}>{fmtPrice(signal.sl)}</b></div>
        <div><span style={{ color: '#64748b' }}>TP1</span><br /><b style={{ color: '#22c55e' }}>{fmtPrice(signal.tp1)}</b></div>
        <div><span style={{ color: '#64748b' }}>R:R</span><br /><b style={{ color: '#fbbf24' }}>1:{signal.rr.toFixed(1)}</b></div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 11, marginBottom: 6 }}>
            <div><span style={{ color: '#64748b' }}>TP2:</span> <b style={{ color: '#22c55e' }}>{fmtPrice(signal.tp2)}</b></div>
            <div><span style={{ color: '#64748b' }}>TP3:</span> <b style={{ color: '#22c55e' }}>{fmtPrice(signal.tp3)}</b></div>
            <div><span style={{ color: '#64748b' }}>Rủi ro:</span> <b style={{ color: signal.riskLevel === 'Low' ? '#22c55e' : signal.riskLevel === 'High' ? '#ef4444' : '#eab308' }}>{signal.riskLevel}</b></div>
          </div>
          {hitTime && (
            <div style={{ fontSize: 10, color: outcomeColor, marginBottom: 4 }}>
              ⏱️ Kết quả lúc: {fmtTime(hitTime)}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#94a3b8' }}>
            {signal.confluences.map((c, idx) => (
              <div key={idx}>{c.passed ? '✅' : '❌'} {c.name}: {c.detail}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STATUS PANEL
// ============================================================
function StatusPanel({ result, currentPrice }: { result: CraziiResult | null; currentPrice: number }) {
  if (!result) return null;
  const lastIdx = result.ops.length - 1;
  const op = result.ops[lastIdx]?.op;
  const mlp = result.mlps[lastIdx]?.mlp;
  const ktr = result.ktrs[lastIdx]?.levels;
  const ksi = result.ksi[lastIdx];
  const kcx = result.kcx[lastIdx];
  const lastHA = result.haCandles[lastIdx];
  const opRule = op ? (currentPrice > op ? 'BUY' : 'SELL') : '—';

  return (
    <div style={{ background: '#0f172a', borderRadius: 8, padding: 10, marginBottom: 10 }}>
      <h4 style={{ color: '#fbbf24', margin: '0 0 6px', fontSize: 12 }}>📊 Trạng Thái Hệ Thống</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 10 }}>
        <div><span style={{ color: '#64748b' }}>Giá</span><br /><b style={{ color: '#e2e8f0' }}>{fmtPrice(currentPrice)}</b></div>
        <div><span style={{ color: '#64748b' }}>OP</span><br /><b style={{ color: opRule === 'BUY' ? '#22c55e' : '#ef4444' }}>{op ? fmtPrice(op) : '—'}</b></div>
        <div><span style={{ color: '#64748b' }}>MLP</span><br /><b style={{ color: mlp && currentPrice > mlp ? '#22c55e' : '#ef4444' }}>{mlp ? fmtPrice(mlp) : '—'}</b></div>
        <div><span style={{ color: '#64748b' }}>Luật OP</span><br /><b style={{ color: opRule === 'BUY' ? '#22c55e' : '#ef4444' }}>{opRule}</b></div>
        <div><span style={{ color: '#64748b' }}>Nến</span><br /><b style={{ color: lastHA?.isBull ? '#fbbf24' : '#ef4444' }}>{lastHA?.isBull ? '🟡 Vàng' : '🔴 Đỏ'}</b></div>
        <div><span style={{ color: '#64748b' }}>KSI</span><br /><b style={{ color: ksi?.isBullish ? '#22c55e' : '#ef4444' }}>{ksi?.isBullish ? '🐋 Mua' : '🐋 Bán'}</b></div>
        <div><span style={{ color: '#64748b' }}>KCX</span><br /><b style={{ color: kcx?.state === 'retailSell' ? '#3b82f6' : kcx?.state === 'exhaustion' ? '#22c55e' : '#94a3b8' }}>
          {kcx?.state === 'retailBuy' ? '⬛' : kcx?.state === 'retailSell' ? '🔵' : '💚'}
        </b></div>
        {ktr && <div><span style={{ color: '#64748b' }}>KTR+1</span><br /><b style={{ color: '#22c55e' }}>{fmtPrice(ktr.plus1)}</b></div>}
        {ktr && <div><span style={{ color: '#64748b' }}>KTR-1</span><br /><b style={{ color: '#ef4444' }}>{fmtPrice(ktr.minus1)}</b></div>}
      </div>
    </div>
  );
}

// ============================================================
// CHART COMPONENT - Real-time update không rebuild
// ============================================================
function CraziiChart({ candles, result }: { candles: Candle[]; result: CraziiResult | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const csRef = useRef<any>(null);
  const volRef = useRef<any>(null);
  const initializedRef = useRef(false);
  const lastCandleCountRef = useRef(0);

  // Effect 1: Tạo chart 1 lần
  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    // Chỉ rebuild chart nếu chưa có hoặc khi cần reset
    if (chartRef.current && initializedRef.current) return;

    if (chartRef.current) { try { chartRef.current.remove(); } catch {} chartRef.current = null; }

    const container = containerRef.current;
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: '#060d1a' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      width: container.clientWidth,
      height: container.clientHeight > 0 ? container.clientHeight : 500,
      crosshair: { mode: 0 },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;
    const toT = (t: number): Time => (t + GMT7_OFFSET) as unknown as Time;

    const cs = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    csRef.current = cs;
    cs.setData(candles.map(c => ({ time: toT(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));

    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volRef.current = vol;
    vol.setData(candles.map(c => ({ time: toT(c.time), value: c.volume, color: c.close > c.open ? '#22c55e30' : '#ef444430' })));

    lastCandleCountRef.current = candles.length;
    initializedRef.current = true;

    const handleResize = () => { if (container) chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 500 }); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); try { chart.remove(); } catch {} chartRef.current = null; csRef.current = null; volRef.current = null; initializedRef.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles.length > 0]);

  // Effect 2: Update nến real-time (không destroy chart)
  useEffect(() => {
    if (!csRef.current || !volRef.current || candles.length === 0) return;
    const toT = (t: number): Time => (t + GMT7_OFFSET) as unknown as Time;
    const last = candles[candles.length - 1];

    // Update hoặc thêm nến mới nhất
    csRef.current.update({ time: toT(last.time), open: last.open, high: last.high, low: last.low, close: last.close });
    volRef.current.update({ time: toT(last.time), value: last.volume, color: last.close > last.open ? '#22c55e30' : '#ef444430' });

    // Nếu có nến mới (count tăng), setData lại toàn bộ
    if (candles.length > lastCandleCountRef.current + 1) {
      csRef.current.setData(candles.map((c: Candle) => ({ time: toT(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
      volRef.current.setData(candles.map((c: Candle) => ({ time: toT(c.time), value: c.volume, color: c.close > c.open ? '#22c55e30' : '#ef444430' })));
      lastCandleCountRef.current = candles.length;
    }
  }, [candles]);

  // Effect 3: Vẽ price lines + markers khi result thay đổi
  useEffect(() => {
    if (!csRef.current || !result) return;
    const cs = csRef.current;
    const toT = (t: number): Time => (t + GMT7_OFFSET) as unknown as Time;

    // OP line
    const lastOP = result.ops[result.ops.length - 1]?.op;
    if (lastOP) cs.createPriceLine({ price: lastOP, color: '#fbbf24', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'OP' });

    // MLP line
    const lastMLP = result.mlps[result.mlps.length - 1]?.mlp;
    if (lastMLP) cs.createPriceLine({ price: lastMLP, color: '#a855f7', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'MLP' });

    // KTR levels
    const lastKTR = result.ktrs[result.ktrs.length - 1]?.levels;
    if (lastKTR) {
      cs.createPriceLine({ price: lastKTR.plus1, color: '#22c55e', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: 'KTR+1' });
      cs.createPriceLine({ price: lastKTR.plus2, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: 'KTR+2' });
      cs.createPriceLine({ price: lastKTR.minus1, color: '#ef4444', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: 'KTR-1' });
      cs.createPriceLine({ price: lastKTR.minus2, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: 'KTR-2' });
    }

    // Signal markers
    const markers: SeriesMarker<Time>[] = [];
    for (const sig of result.enhancedSignals.slice(-20)) {
      markers.push({
        time: toT(sig.time),
        position: sig.side === 'buy' ? 'belowBar' : 'aboveBar',
        color: sig.side === 'buy' ? '#4ade80' : '#f87171',
        shape: sig.side === 'buy' ? 'arrowUp' : 'arrowDown',
        text: `${sig.side.toUpperCase()} ${sig.confidence}%`,
      });
    }
    for (const d of result.diamonds.slice(-10)) {
      markers.push({
        time: toT(d.time),
        position: 'belowBar',
        color: d.type === 'blue' ? '#00bcd4' : '#ff9800',
        shape: 'circle',
        text: `◆`,
      });
    }
    if (markers.length > 0) {
      markers.sort((a, b) => (a.time as number) - (b.time as number));
      cs.setMarkers(markers);
    }
  }, [result]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 450 }} />;
}

// ============================================================
// MAIN PAGE
// ============================================================
interface CraziiPageProps { onBack: () => void; onLogout?: () => void; }

export default function CraziiPage({ onBack, onLogout }: CraziiPageProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [result, setResult] = useState<CraziiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('5m');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('');
  const [minConfidence, setMinConfidence] = useState(55);
  const minConfRef = useRef(minConfidence);
  minConfRef.current = minConfidence;

  // Stable loadData: không phụ thuộc minConfidence (dùng ref)
  const loadData = useCallback(async (tf: string) => {
    try {
      const [candleData, dailyData] = await Promise.all([
        fetchOandaGoldCandles(tf, 1000),
        fetchOandaGoldDaily(10),
      ]);
      if (candleData.length > 0) {
        setCandles(candleData);
        setCurrentPrice(candleData[candleData.length - 1].close);
        const pivot = calculatePivot(dailyData);
        const adr = calculateADR(dailyData, 5);
        const craziiResult = calculateAll(candleData, {
          opHour: 5, ktrMultiplier: 1.0, haSmooth: 6,
          dailyRange: adr, pivot, minConfidence: minConfRef.current,
        });
        setResult(craziiResult);
        setLastUpdate(new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
      }
    } catch (err) {
      console.error('[CRAZII] Load error:', err);
    }
    setLoading(false);
  }, []);

  // Initial load + khi đổi timeframe
  useEffect(() => {
    setLoading(true);
    loadData(timeframe);
  }, [timeframe, loadData]);

  // WebSocket real-time: cập nhật nến mới nhất liên tục
  useEffect(() => {
    const wsConn = connectGoldWebSocket(timeframe, (liveCandle: LiveGoldCandle) => {
      setCurrentPrice(liveCandle.close);
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (copy[lastIdx].time === liveCandle.time) {
          // Update nến hiện tại (chưa đóng)
          copy[lastIdx] = { time: liveCandle.time, open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close, volume: liveCandle.volume };
        } else if (liveCandle.time > copy[lastIdx].time) {
          // Nến mới xuất hiện
          copy.push({ time: liveCandle.time, open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close, volume: liveCandle.volume });
          // Khi nến đóng → recalc engine
          if (liveCandle.isClosed) {
            loadData(timeframe);
          }
        }
        return copy;
      });
      setLastUpdate(new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    });

    return () => { wsConn.close(); };
  }, [timeframe, loadData]);

  // Re-calculate khi đổi minConfidence (không fetch lại, chỉ re-run engine)
  useEffect(() => {
    if (candles.length === 0) return;
    fetchOandaGoldDaily(10).then(dailyData => {
      const pivot = calculatePivot(dailyData);
      const adr = calculateADR(dailyData, 5);
      const craziiResult = calculateAll(candles, {
        opHour: 5, ktrMultiplier: 1.0, haSmooth: 6,
        dailyRange: adr, pivot, minConfidence,
      });
      setResult(craziiResult);
    });
  }, [minConfidence]);

  // Backup polling: recalc engine mỗi 60s (phòng WS chết)
  useEffect(() => {
    const timer = setInterval(() => { loadData(timeframe); }, 60000);
    return () => clearInterval(timer);
  }, [timeframe, loadData]);

  // Signals with outcomes
  const activeSignals = result?.enhancedSignals?.filter(s => s.confidence >= minConfidence) || [];
  const latestSignal = activeSignals.length > 0 ? activeSignals[activeSignals.length - 1] : null;

  // Stats
  const activeFVGs = result?.fvgs?.filter(f => !f.filled).length || 0;
  const activeOBs = result?.orderBlocks?.filter(ob => !ob.mitigated).length || 0;

  // Win rate calculation
  const outcomes = activeSignals.map(s => getSignalOutcome(s, candles));
  const closedSignals = outcomes.filter(o => o.outcome !== 'pending');
  const wins = closedSignals.filter(o => o.outcome.startsWith('tp'));
  const winRate = closedSignals.length > 0 ? Math.round((wins.length / closedSignals.length) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#060d1a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid #1e293b', background: '#0a0e17' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>← Key Level</button>
          <h1 style={{ margin: 0, fontSize: 16, color: '#fbbf24', fontWeight: 800 }}>🏆 CRAZII SYSTEM</h1>
          <span style={{ fontSize: 11, color: '#64748b' }}>OANDA:XAUUSD (Vàng/USD)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>⏱️ {lastUpdate}</span>
          {closedSignals.length > 0 && (
            <span style={{ fontSize: 11, color: winRate >= 60 ? '#22c55e' : '#eab308' }}>
              WR: {winRate}% ({wins.length}/{closedSignals.length})
            </span>
          )}
          {onLogout && <button onClick={onLogout} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Logout</button>}
        </div>
      </header>

      {/* TOOLBAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderBottom: '1px solid #1e293b', flexWrap: 'wrap' }}>
        {['1m', '5m', '15m', '1h', '4h'].map(tf => (
          <button key={tf} onClick={() => setTimeframe(tf)}
            style={{ background: timeframe === tf ? '#fbbf24' : '#1e293b', color: timeframe === tf ? '#000' : '#94a3b8', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
          >{tf.toUpperCase()}</button>
        ))}
        <span style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>Conf:</span>
        <input type="range" min={30} max={90} value={minConfidence} onChange={e => setMinConfidence(Number(e.target.value))} style={{ width: 60 }} />
        <span style={{ color: '#fbbf24', fontSize: 11 }}>{minConfidence}%</span>
        <button onClick={() => loadData(timeframe)} style={{ marginLeft: 'auto', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>🔄 Refresh</button>
        <span style={{ fontSize: 10, color: '#22c55e' }}>FVG:{activeFVGs}</span>
        <span style={{ fontSize: 10, color: '#3b82f6' }}>OB:{activeOBs}</span>
        <span style={{ fontSize: 10, color: '#fbbf24' }}>Sig:{activeSignals.length}</span>
      </div>

      {loading && candles.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fbbf24' }}>⏳ Đang tải...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', height: 'calc(100vh - 95px)' }}>
          {/* CHART */}
          <div style={{ borderRight: '1px solid #1e293b', overflow: 'hidden' }}>
            <CraziiChart candles={candles} result={result} />
          </div>

          {/* RIGHT PANEL */}
          <div style={{ overflow: 'auto', padding: 10 }}>
            {/* Price */}
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 24, fontWeight: 800, color: currentPrice > (result?.ops[result.ops.length - 1]?.op || 0) ? '#22c55e' : '#ef4444' }}>
                {fmtPrice(currentPrice)}
              </span>
              <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>OANDA:XAUUSD</span>
            </div>

            <StatusPanel result={result} currentPrice={currentPrice} />

            {/* Latest Signal */}
            {latestSignal && (
              <div style={{ marginBottom: 10, padding: 8, background: latestSignal.side === 'buy' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: 6, border: `2px solid ${latestSignal.side === 'buy' ? '#22c55e' : '#ef4444'}` }}>
                <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 800, color: latestSignal.side === 'buy' ? '#22c55e' : '#ef4444', marginBottom: 4 }}>
                  🔥 {latestSignal.side.toUpperCase()} — {latestSignal.source}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 10, textAlign: 'center' }}>
                  <div>Entry<br /><b>{fmtPrice(latestSignal.entry)}</b></div>
                  <div>SL<br /><b style={{ color: '#ef4444' }}>{fmtPrice(latestSignal.sl)}</b></div>
                  <div>TP1<br /><b style={{ color: '#22c55e' }}>{fmtPrice(latestSignal.tp1)}</b></div>
                </div>
              </div>
            )}

            {/* Signals list */}
            <h4 style={{ color: '#cbd5e1', margin: '0 0 6px', fontSize: 12 }}>📋 Tín Hiệu ({activeSignals.length})</h4>
            {activeSignals.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 11, textAlign: 'center', padding: 16 }}>Chưa có tín hiệu đạt {minConfidence}%</div>
            ) : (
              activeSignals.slice().reverse().slice(0, 12).map((sig, idx) => (
                <SignalCard key={sig.time + sig.side} signal={sig} candles={candles} isLatest={idx === 0} />
              ))
            )}

            {/* FVG/OB */}
            {result && (activeFVGs > 0 || activeOBs > 0) && (
              <div style={{ marginTop: 10, background: '#0f172a', borderRadius: 6, padding: 8 }}>
                <h4 style={{ color: '#3b82f6', margin: '0 0 4px', fontSize: 11 }}>🔲 FVG & OB Active</h4>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>
                  {result.fvgs.filter(f => !f.filled).slice(-4).map((fvg, i) => (
                    <div key={i}>{fvg.type === 'bullish' ? '🟢' : '🔴'} FVG: {fmtPrice(fvg.bottom)}-{fmtPrice(fvg.top)}</div>
                  ))}
                  {result.orderBlocks.filter(ob => !ob.mitigated).slice(-4).map((ob, i) => (
                    <div key={i}>{ob.type === 'bullish' ? '🟩' : '🟥'} OB: {fmtPrice(ob.bottom)}-{fmtPrice(ob.top)}</div>
                  ))}
                </div>
              </div>
            )}

            {/* Rules */}
            <div style={{ marginTop: 10, background: '#0f172a', borderRadius: 6, padding: 8 }}>
              <h4 style={{ color: '#fbbf24', margin: '0 0 4px', fontSize: 11 }}>📖 Quy Tắc</h4>
              <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1.5 }}>
                • <b style={{ color: '#fbbf24' }}>OP</b>: Trên→BUY | Dưới→SELL<br/>
                • <b style={{ color: '#22c55e' }}>Tam Điểm</b>: 3 nến+OP+KSI+KCX<br/>
                • <b style={{ color: '#3b82f6' }}>Nhấn Chìm</b>: Engulfing+OP<br/>
                • <b style={{ color: '#ff9800' }}>KTR</b>: TP1 70% | TP2 20% | TP3 10%
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
