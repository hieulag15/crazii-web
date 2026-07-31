/**
 * CRAZII Trading System Page
 * Hệ thống CRAZII + FVG/OB + Signal Call tự động
 * Cặp giao dịch: XAU/USD (Vàng OANDA - Spot)
 * Logic hợp lưu: Tam Điểm Hội Tụ + Nhấn Chìm + FVG/OB
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, Time, SeriesMarker } from 'lightweight-charts';
import { fetchCandles, connectWebSocket, fetchDailyCandles } from '../utils/dataService';
import type { LiveCandle } from '../utils/dataService';
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
// CONFIDENCE BADGE COMPONENT
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
// SIGNAL CARD COMPONENT
// ============================================================
function SignalCard({ signal, isLatest }: { signal: EnhancedSignal; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = signal.side === 'buy';
  const borderColor = isBuy ? '#22c55e' : '#ef4444';
  const bgColor = isBuy ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        border: `1px solid ${borderColor}`,
        borderLeft: `4px solid ${borderColor}`,
        background: bgColor,
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 8,
        cursor: 'pointer',
        animation: isLatest ? 'pulse 2s infinite' : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ color: borderColor, fontWeight: 700, fontSize: 16 }}>
            {isBuy ? '🟢 BUY' : '🔴 SELL'}
          </span>
          <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 12 }}>{signal.source}</span>
        </div>
        <ConfidenceBadge value={signal.confidence} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 8, fontSize: 12 }}>
        <div><span style={{ color: '#64748b' }}>Entry</span><br /><b style={{ color: '#e2e8f0' }}>{fmtPrice(signal.entry)}</b></div>
        <div><span style={{ color: '#64748b' }}>SL</span><br /><b style={{ color: '#ef4444' }}>{fmtPrice(signal.sl)}</b></div>
        <div><span style={{ color: '#64748b' }}>TP1</span><br /><b style={{ color: '#22c55e' }}>{fmtPrice(signal.tp1)}</b></div>
        <div><span style={{ color: '#64748b' }}>R:R</span><br /><b style={{ color: '#fbbf24' }}>1:{signal.rr.toFixed(1)}</b></div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid #1e293b', paddingTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, marginBottom: 8 }}>
            <div><span style={{ color: '#64748b' }}>TP2:</span> <b style={{ color: '#22c55e' }}>{fmtPrice(signal.tp2)}</b></div>
            <div><span style={{ color: '#64748b' }}>TP3:</span> <b style={{ color: '#22c55e' }}>{fmtPrice(signal.tp3)}</b></div>
            <div><span style={{ color: '#64748b' }}>Rủi ro:</span> <b style={{ color: signal.riskLevel === 'Low' ? '#22c55e' : signal.riskLevel === 'High' ? '#ef4444' : '#eab308' }}>{signal.riskLevel}</b></div>
            <div><span style={{ color: '#64748b' }}>Thời gian:</span> <span style={{ color: '#cbd5e1' }}>{fmtTime(signal.time)}</span></div>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            <b style={{ color: '#cbd5e1' }}>Hợp lưu:</b>
            {signal.confluences.map((c, idx) => (
              <div key={idx} style={{ marginLeft: 8, marginTop: 2 }}>
                {c.passed ? '✅' : '❌'} {c.name}: {c.detail}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, padding: 8, background: '#0f172a', borderRadius: 6, fontSize: 11, color: '#94a3b8', whiteSpace: 'pre-wrap' }}>
            {signal.reason}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STATUS PANEL COMPONENT
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
  const mlpRule = mlp ? (currentPrice > mlp ? 'BUY' : 'SELL') : '—';

  return (
    <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <h4 style={{ color: '#fbbf24', margin: '0 0 8px', fontSize: 13 }}>📊 Trạng Thái Hệ Thống</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
        <div>
          <span style={{ color: '#64748b' }}>Giá hiện tại</span><br />
          <b style={{ color: '#e2e8f0' }}>{fmtPrice(currentPrice)}</b>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>OP (5h)</span><br />
          <b style={{ color: opRule === 'BUY' ? '#22c55e' : '#ef4444' }}>{op ? fmtPrice(op) : '—'}</b>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>MLP</span><br />
          <b style={{ color: mlpRule === 'BUY' ? '#22c55e' : '#ef4444' }}>{mlp ? fmtPrice(mlp) : '—'}</b>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Luật OP</span><br />
          <b style={{ color: opRule === 'BUY' ? '#22c55e' : '#ef4444' }}>{opRule}</b>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>Nến HA</span><br />
          <b style={{ color: lastHA?.isBull ? '#fbbf24' : '#ef4444' }}>{lastHA?.isBull ? '🟡 Vàng' : '🔴 Đỏ'}</b>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>KSI</span><br />
          <b style={{ color: ksi?.isBullish ? '#22c55e' : '#ef4444' }}>{ksi?.isBullish ? '🐋 Mua' : '🐋 Bán'}</b>
        </div>
        <div>
          <span style={{ color: '#64748b' }}>KCX</span><br />
          <b style={{ color: kcx?.state === 'retailBuy' ? '#1e293b' : kcx?.state === 'retailSell' ? '#3b82f6' : '#22c55e' }}>
            {kcx?.state === 'retailBuy' ? '⬛ Đen' : kcx?.state === 'retailSell' ? '🔵 Xanh dương' : '💚 Xanh lá'}
          </b>
        </div>
        {ktr && (
          <>
            <div><span style={{ color: '#64748b' }}>KTR+1</span><br /><b style={{ color: '#22c55e' }}>{fmtPrice(ktr.plus1)}</b></div>
            <div><span style={{ color: '#64748b' }}>KTR-1</span><br /><b style={{ color: '#ef4444' }}>{fmtPrice(ktr.minus1)}</b></div>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CHART COMPONENT
// ============================================================
function CraziiChart({ candles, result }: { candles: Candle[]; result: CraziiResult | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch { /* ok */ }
      chartRef.current = null;
    }

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

    // Candlestick series
    const cs = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    });
    cs.setData(candles.map(c => ({ time: toT(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));

    // Volume
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    vol.setData(candles.map(c => ({ time: toT(c.time), value: c.volume, color: c.close > c.open ? '#22c55e30' : '#ef444430' })));

    if (result) {
      // EMA 200 line
      const ema200Data = candles.map((c, i) => {
        const closes = candles.slice(0, i + 1).map(x => x.close);
        if (closes.length < 200) return null;
        const k = 2 / 201;
        let emaVal = closes.slice(0, 200).reduce((a, b) => a + b, 0) / 200;
        for (let j = 200; j < closes.length; j++) {
          emaVal = closes[j] * k + emaVal * (1 - k);
        }
        return { time: toT(c.time), value: emaVal };
      }).filter(Boolean) as { time: Time; value: number }[];

      if (ema200Data.length > 0) {
        const emaLine = chart.addLineSeries({ color: '#ff9800', lineWidth: 2, title: 'EMA200' });
        emaLine.setData(ema200Data);
      }

      // OP line (price line on candlestick)
      const lastOP = result.ops[result.ops.length - 1]?.op;
      if (lastOP) {
        cs.createPriceLine({ price: lastOP, color: '#fbbf24', lineWidth: 2, lineStyle: 0, axisLabelVisible: true, title: 'OP' });
      }

      // MLP line
      const lastMLP = result.mlps[result.mlps.length - 1]?.mlp;
      if (lastMLP) {
        cs.createPriceLine({ price: lastMLP, color: '#a855f7', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'MLP' });
      }

      // KTR levels
      const lastKTR = result.ktrs[result.ktrs.length - 1]?.levels;
      if (lastKTR) {
        cs.createPriceLine({ price: lastKTR.plus1, color: '#22c55e', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: 'KTR+1' });
        cs.createPriceLine({ price: lastKTR.plus2, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: 'KTR+2' });
        cs.createPriceLine({ price: lastKTR.minus1, color: '#ef4444', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: 'KTR-1' });
        cs.createPriceLine({ price: lastKTR.minus2, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: 'KTR-2' });
      }

      // Markers for signals
      const markers: SeriesMarker<Time>[] = [];

      // Enhanced signals (main calls)
      for (const sig of result.enhancedSignals.slice(-15)) {
        markers.push({
          time: toT(sig.time),
          position: sig.side === 'buy' ? 'belowBar' : 'aboveBar',
          color: sig.side === 'buy' ? '#4ade80' : '#f87171',
          shape: sig.side === 'buy' ? 'arrowUp' : 'arrowDown',
          text: `${sig.side.toUpperCase()} ${sig.confidence}%`,
        });
      }

      // Diamond signals
      for (const d of result.diamonds.slice(-10)) {
        markers.push({
          time: toT(d.time),
          position: 'belowBar',
          color: d.type === 'blue' ? '#00bcd4' : d.type === 'broken' ? '#ff9800' : '#e91e63',
          shape: 'circle',
          text: `◆ ${d.type}`,
        });
      }

      if (markers.length > 0) {
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        cs.setMarkers(markers);
      }
    }

    const handleResize = () => {
      if (container) chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 500 });
    };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); try { chart.remove(); } catch {} chartRef.current = null; };
  }, [candles, result]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 450 }} />;
}

// ============================================================
// MAIN CRAZII PAGE COMPONENT
// ============================================================
interface CraziiPageProps {
  onBack: () => void;
  onLogout?: () => void;
}

export default function CraziiPage({ onBack, onLogout }: CraziiPageProps) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [result, setResult] = useState<CraziiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('5m');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [lastUpdate, setLastUpdate] = useState('');
  const [minConfidence, setMinConfidence] = useState(55);
  const wsRef = useRef<WebSocket | null>(null);

  // OANDA Gold symbol on Binance Futures
  const SYMBOL = 'XAUUSDT';

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [candleData, dailyData] = await Promise.all([
        fetchCandles(SYMBOL, timeframe, 1000),
        fetchDailyCandles(SYMBOL, 10),
      ]);

      if (candleData.length > 0) {
        setCandles(candleData);
        setCurrentPrice(candleData[candleData.length - 1].close);

        // Calculate Pivot from daily candles
        const pivot = calculatePivot(dailyData);
        // Calculate ADR for KTR
        const adr = calculateADR(dailyData, 5);

        // Run CRAZII engine
        const craziiResult = calculateAll(candleData, {
          opHour: 5,
          ktrMultiplier: 1.0,
          haSmooth: 6,
          dailyRange: adr,
          pivot,
          minConfidence,
        });

        setResult(craziiResult);
        setLastUpdate(new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
      }
    } catch (err) {
      console.error('Error loading CRAZII data:', err);
    }
    setLoading(false);
  }, [timeframe, minConfidence]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // WebSocket real-time
  useEffect(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    const ws = connectWebSocket(SYMBOL, timeframe, (liveCandle: LiveCandle) => {
      setCurrentPrice(liveCandle.close);
      setCandles(prev => {
        if (prev.length === 0) return prev;
        const copy = [...prev];
        const lastIdx = copy.length - 1;

        if (copy[lastIdx].time === liveCandle.time) {
          copy[lastIdx] = { ...liveCandle };
        } else if (liveCandle.isClosed) {
          copy.push({ time: liveCandle.time, open: liveCandle.open, high: liveCandle.high, low: liveCandle.low, close: liveCandle.close, volume: liveCandle.volume });
          // Recalculate on new candle close
          loadData();
        }
        return copy;
      });
      setLastUpdate(new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
    });

    wsRef.current = ws;
    return () => { ws.close(); };
  }, [timeframe, loadData]);

  // Polling fallback: nếu WS không hoạt động, refresh mỗi 30s
  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Active signals (filtered by confidence)
  const activeSignals = result?.enhancedSignals?.filter(s => s.confidence >= minConfidence) || [];
  const latestSignal = activeSignals.length > 0 ? activeSignals[activeSignals.length - 1] : null;

  // FVG/OB counts
  const activeFVGs = result?.fvgs?.filter(f => !f.filled).length || 0;
  const activeOBs = result?.orderBlocks?.filter(ob => !ob.mitigated).length || 0;

  return (
    <div style={{ minHeight: '100vh', background: '#060d1a', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* HEADER */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid #1e293b', background: '#0a0e17' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>← Key Level</button>
          <h1 style={{ margin: 0, fontSize: 18, color: '#fbbf24', fontWeight: 800 }}>🏆 CRAZII SYSTEM</h1>
          <span style={{ fontSize: 12, color: '#64748b' }}>XAU/USD (Vàng OANDA)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Cập nhật: {lastUpdate}</span>
          {onLogout && <button onClick={onLogout} style={{ background: '#1e293b', border: 'none', color: '#94a3b8', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Đăng xuất</button>}
        </div>
      </header>

      {/* TOOLBAR */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid #1e293b', flexWrap: 'wrap' }}>
        <span style={{ color: '#64748b', fontSize: 12 }}>Khung:</span>
        {['1m', '5m', '15m', '1h', '4h'].map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            style={{
              background: timeframe === tf ? '#fbbf24' : '#1e293b',
              color: timeframe === tf ? '#000' : '#94a3b8',
              border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >{tf.toUpperCase()}</button>
        ))}
        <span style={{ color: '#64748b', fontSize: 12, marginLeft: 12 }}>Min Confidence:</span>
        <input
          type="range" min={30} max={90} value={minConfidence}
          onChange={e => setMinConfidence(Number(e.target.value))}
          style={{ width: 80 }}
        />
        <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 700 }}>{minConfidence}%</span>

        <button onClick={loadData} style={{ marginLeft: 'auto', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
          🔄 Refresh
        </button>

        {/* Quick Stats */}
        <div style={{ display: 'flex', gap: 12, marginLeft: 12 }}>
          <span style={{ fontSize: 11, color: '#22c55e' }}>FVG: {activeFVGs}</span>
          <span style={{ fontSize: 11, color: '#3b82f6' }}>OB: {activeOBs}</span>
          <span style={{ fontSize: 11, color: '#fbbf24' }}>Signals: {activeSignals.length}</span>
        </div>
      </div>

      {loading && candles.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#fbbf24' }}>
          ⏳ Đang tải dữ liệu CRAZII...
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', height: 'calc(100vh - 110px)' }}>
          {/* LEFT: CHART */}
          <div style={{ borderRight: '1px solid #1e293b', overflow: 'hidden' }}>
            <CraziiChart candles={candles} result={result} />
          </div>

          {/* RIGHT: PANEL */}
          <div style={{ overflow: 'auto', padding: 12 }}>
            {/* Current Price */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: currentPrice > (result?.ops[result.ops.length - 1]?.op || 0) ? '#22c55e' : '#ef4444' }}>
                {fmtPrice(currentPrice)}
              </span>
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>XAU/USD</span>
            </div>

            {/* Status Panel */}
            <StatusPanel result={result} currentPrice={currentPrice} />

            {/* Latest Signal Highlight */}
            {latestSignal && (
              <div style={{ marginBottom: 12, padding: 10, background: latestSignal.side === 'buy' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: 8, border: `2px solid ${latestSignal.side === 'buy' ? '#22c55e' : '#ef4444'}` }}>
                <div style={{ textAlign: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: latestSignal.side === 'buy' ? '#22c55e' : '#ef4444' }}>
                    🔥 TÍN HIỆU MỚI NHẤT: {latestSignal.side.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, fontSize: 11, textAlign: 'center' }}>
                  <div><span style={{ color: '#64748b' }}>Entry</span><br /><b>{fmtPrice(latestSignal.entry)}</b></div>
                  <div><span style={{ color: '#64748b' }}>SL</span><br /><b style={{ color: '#ef4444' }}>{fmtPrice(latestSignal.sl)}</b></div>
                  <div><span style={{ color: '#64748b' }}>TP1</span><br /><b style={{ color: '#22c55e' }}>{fmtPrice(latestSignal.tp1)}</b></div>
                </div>
              </div>
            )}

            {/* All Signals */}
            <h4 style={{ color: '#cbd5e1', margin: '0 0 8px', fontSize: 13 }}>
              📋 Tín Hiệu ({activeSignals.length})
            </h4>
            {activeSignals.length === 0 ? (
              <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: 20 }}>
                Chưa có tín hiệu đạt ngưỡng {minConfidence}%
              </div>
            ) : (
              <div>
                {activeSignals.slice().reverse().slice(0, 10).map((sig, idx) => (
                  <SignalCard key={sig.time + sig.side} signal={sig} isLatest={idx === 0} />
                ))}
              </div>
            )}

            {/* FVG & OB Info */}
            {result && (result.fvgs.length > 0 || result.orderBlocks.length > 0) && (
              <div style={{ marginTop: 12, background: '#0f172a', borderRadius: 8, padding: 10 }}>
                <h4 style={{ color: '#3b82f6', margin: '0 0 6px', fontSize: 12 }}>🔲 FVG & Order Block</h4>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {result.fvgs.filter(f => !f.filled).slice(-5).map((fvg, i) => (
                    <div key={i} style={{ marginBottom: 2 }}>
                      {fvg.type === 'bullish' ? '🟢' : '🔴'} FVG {fvg.type}: {fmtPrice(fvg.bottom)} - {fmtPrice(fvg.top)}
                    </div>
                  ))}
                  {result.orderBlocks.filter(ob => !ob.mitigated).slice(-5).map((ob, i) => (
                    <div key={i} style={{ marginBottom: 2 }}>
                      {ob.type === 'bullish' ? '🟩' : '🟥'} OB {ob.type}: {fmtPrice(ob.bottom)} - {fmtPrice(ob.top)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legend / Rules */}
            <div style={{ marginTop: 12, background: '#0f172a', borderRadius: 8, padding: 10 }}>
              <h4 style={{ color: '#fbbf24', margin: '0 0 6px', fontSize: 12 }}>📖 Quy Tắc CRAZII</h4>
              <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.6 }}>
                • <b style={{ color: '#fbbf24' }}>Luật OP</b>: Trên OP → BUY | Dưới OP → SELL<br />
                • <b style={{ color: '#a855f7' }}>MLP</b>: OP trên MLP = uptrend mạnh<br />
                • <b style={{ color: '#22c55e' }}>Tam Điểm</b>: 3 nến + OP + KSI + KCX cùng hướng<br />
                • <b style={{ color: '#3b82f6' }}>Nhấn Chìm</b>: Nến đổi màu engulfing + OP rule<br />
                • <b style={{ color: '#00bcd4' }}>Kim Cương</b>: Tín hiệu đảo chiều / biến động<br />
                • <b style={{ color: '#ff9800' }}>KTR</b>: Chốt lời theo mốc +-1,2,3<br />
                • <b style={{ color: '#e91e63' }}>FVG/OB</b>: Hợp lưu ICT nâng confidence
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
