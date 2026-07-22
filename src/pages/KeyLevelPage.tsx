/**
 * Key Level Trading Page
 * - 📊 Chart: TradingView widget (EMA sẵn)
 * - 🔍 Scanner: Quét multi-coin
 * - 🎯 Tín hiệu: Engine tự tính, nút "Lưu tín hiệu"
 * - 📓 Journal: Lịch sử + auto-track TP/SL + analytics + export
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData, SeriesMarker, Time } from 'lightweight-charts';
import { fetchCandles, connectWebSocket } from '../utils/dataService';
import type { LiveCandle } from '../utils/dataService';
import {
  calculateKeyLevelSystem,
  type KeyLevelResult,
  type KeyLevelSignal,
  type TrendDirection,
} from '../utils/keyLevelEngine';
import {
  getAllSignals, loadAllSignals, addSignal, updateSignal, deleteSignal,
  calculateStats, checkSignalOutcome, exportAsCSV, exportForTraining,
  createTrackedSignal,
  type TrackedSignal, type TrackingStats, type SignalOutcome,
} from '../utils/signalTracker';
import type { Candle } from '../types/index';
import { analyzeNewSignal, analyzePostMortem, analyzeScanResults } from '../utils/aiService';

const GMT7_OFFSET = 7 * 3600;
function fmtDate(ts: number) {
  return new Date(ts).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}
function fmtPrice(p: number) {
  return p > 100 ? p.toFixed(2) : p.toFixed(4);
}

const COIN_LIST = [
  { value: 'BTCUSDT', label: 'BTC', tv: 'BINANCE:BTCUSDT', category: 'top10' },
  { value: 'ETHUSDT', label: 'ETH', tv: 'BINANCE:ETHUSDT', category: 'top10' },
  { value: 'BNBUSDT', label: 'BNB', tv: 'BINANCE:BNBUSDT', category: 'top10' },
  { value: 'SOLUSDT', label: 'SOL', tv: 'BINANCE:SOLUSDT', category: 'top10' },
  { value: 'XRPUSDT', label: 'XRP', tv: 'BINANCE:XRPUSDT', category: 'top10' },
  { value: 'ADAUSDT', label: 'ADA', tv: 'BINANCE:ADAUSDT', category: 'top10' },
  { value: 'DOGEUSDT', label: 'DOGE', tv: 'BINANCE:DOGEUSDT', category: 'top10' },
  { value: 'AVAXUSDT', label: 'AVAX', tv: 'BINANCE:AVAXUSDT', category: 'top10' },
  { value: 'DOTUSDT', label: 'DOT', tv: 'BINANCE:DOTUSDT', category: 'top10' },
  { value: 'LINKUSDT', label: 'LINK', tv: 'BINANCE:LINKUSDT', category: 'top10' },
  { value: 'MATICUSDT', label: 'MATIC', tv: 'BINANCE:MATICUSDT', category: 'top20' },
  { value: 'NEARUSDT', label: 'NEAR', tv: 'BINANCE:NEARUSDT', category: 'top20' },
  { value: 'LTCUSDT', label: 'LTC', tv: 'BINANCE:LTCUSDT', category: 'top20' },
  { value: 'UNIUSDT', label: 'UNI', tv: 'BINANCE:UNIUSDT', category: 'top20' },
  { value: 'ATOMUSDT', label: 'ATOM', tv: 'BINANCE:ATOMUSDT', category: 'top20' },
  { value: 'APTUSDT', label: 'APT', tv: 'BINANCE:APTUSDT', category: 'top20' },
  { value: 'FILUSDT', label: 'FIL', tv: 'BINANCE:FILUSDT', category: 'top20' },
  { value: 'ARBUSDT', label: 'ARB', tv: 'BINANCE:ARBUSDT', category: 'top20' },
  { value: 'OPUSDT', label: 'OP', tv: 'BINANCE:OPUSDT', category: 'top20' },
  { value: 'INJUSDT', label: 'INJ', tv: 'BINANCE:INJUSDT', category: 'top20' },
  { value: 'SUIUSDT', label: 'SUI', tv: 'BINANCE:SUIUSDT', category: 'top30' },
  { value: 'SEIUSDT', label: 'SEI', tv: 'BINANCE:SEIUSDT', category: 'top30' },
  { value: 'TIAUSDT', label: 'TIA', tv: 'BINANCE:TIAUSDT', category: 'top30' },
  { value: 'JUPUSDT', label: 'JUP', tv: 'BINANCE:JUPUSDT', category: 'top30' },
  { value: 'WLDUSDT', label: 'WLD', tv: 'BINANCE:WLDUSDT', category: 'top30' },
  { value: 'FETUSDT', label: 'FET', tv: 'BINANCE:FETUSDT', category: 'top30' },
  { value: 'RENDERUSDT', label: 'RENDER', tv: 'BINANCE:RENDERUSDT', category: 'top30' },
  { value: 'RUNEUSDT', label: 'RUNE', tv: 'BINANCE:RUNEUSDT', category: 'top30' },
  { value: 'PENDLEUSDT', label: 'PENDLE', tv: 'BINANCE:PENDLEUSDT', category: 'top30' },
  { value: 'WIFUSDT', label: 'WIF', tv: 'BINANCE:WIFUSDT', category: 'top30' },
  { value: 'AAVEUSDT', label: 'AAVE', tv: 'BINANCE:AAVEUSDT', category: 'eth' },
  { value: 'MKRUSDT', label: 'MKR', tv: 'BINANCE:MKRUSDT', category: 'eth' },
  { value: 'LDOUSDT', label: 'LDO', tv: 'BINANCE:LDOUSDT', category: 'eth' },
  { value: 'CRVUSDT', label: 'CRV', tv: 'BINANCE:CRVUSDT', category: 'eth' },
  { value: 'ENSUSDT', label: 'ENS', tv: 'BINANCE:ENSUSDT', category: 'eth' },
  { value: 'SSVUSDT', label: 'SSV', tv: 'BINANCE:SSVUSDT', category: 'eth' },
  { value: 'RPLUSDT', label: 'RPL', tv: 'BINANCE:RPLUSDT', category: 'eth' },
  { value: 'COMPUSDT', label: 'COMP', tv: 'BINANCE:COMPUSDT', category: 'eth' },
];

const TIMEFRAMES_KL = [
  { value: '15m', label: '15m', tv: '15' },
  { value: '1h', label: '1H', tv: '60' },
  { value: '2h', label: '2H', tv: '120' },
  { value: '4h', label: '4H', tv: '240' },
  { value: '1d', label: '1D', tv: 'D' },
];

const PRESET_TAGS = ['📰 Tin tức', '💥 Fakeout', '✅ Setup chuẩn', '⚡ Breakout', '🔄 Sideway', '🎯 TP sớm', '📉 SL nhỏ'];
const OUTCOME_COLORS: Record<SignalOutcome, string> = {
  pending: '#eab308', tp: '#22c55e', sl: '#ef4444',
  partial: '#3b82f6', breakeven: '#94a3b8', manual_close: '#a855f7',
};
const OUTCOME_LABELS: Record<SignalOutcome, string> = {
  pending: '⏳ Đang chờ', tp: '✅ Take Profit', sl: '❌ Stop Loss',
  partial: '📊 Partial', breakeven: '➕ Breakeven', manual_close: '🖐 Đóng tay',
};

// ============================================================
// Chart Component: lightweight-charts with Key Levels + Patterns drawn directly
// ============================================================
interface ChartToggles {
  showEma: boolean;
  showKeyLevels: boolean;
  showPatterns: boolean;
  showSignals: boolean;
}

function MainChart({ candles, result, symbol, toggles }: { candles: Candle[]; result: KeyLevelResult | null; symbol: string; toggles: ChartToggles }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    // Cleanup old chart
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch { /* disposed */ }
      chartRef.current = null;
    }

    const container = containerRef.current;
    const chart = createChart(container, {
      layout: { background: { type: ColorType.Solid, color: '#0a0e17' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } },
      width: container.clientWidth,
      height: container.clientHeight > 0 ? container.clientHeight : window.innerHeight - 140,
      crosshair: { mode: 0 },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    // Candle series
    const cs = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    candleSeriesRef.current = cs;

    const toT = (t: number): Time => (t + 7 * 3600) as unknown as Time;

    cs.setData(candles.map(c => ({ time: toT(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));

    // Volume
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    vol.setData(candles.map(c => ({ time: toT(c.time), value: c.volume, color: c.close > c.open ? '#22c55e40' : '#ef444440' })));

    if (result) {
      // EMA lines
      if (toggles.showEma) {
        const ema34 = chart.addLineSeries({ color: '#f97316', lineWidth: 2 });
        ema34.setData(result.emaData.ema34.slice(34).map((v, i) => ({ time: toT(candles[i + 34].time), value: v })));
        const ema89 = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2 });
        ema89.setData(result.emaData.ema89.slice(89).map((v, i) => ({ time: toT(candles[i + 89].time), value: v })));
        const ema200 = chart.addLineSeries({ color: '#a855f7', lineWidth: 2 });
        ema200.setData(result.emaData.ema200.slice(200).map((v, i) => ({ time: toT(candles[i + 200].time), value: v })));
      }

      // Key Level lines (horizontal)
      if (toggles.showKeyLevels) {
        for (const lv of result.keyLevels) {
          cs.createPriceLine({
            price: lv.price,
            color: lv.type === 'support' ? '#22c55e' : '#ef4444',
            lineWidth: 1,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: `${lv.type === 'support' ? 'S' : 'R'} ${lv.touches}t`,
          });
        }
      }

      // Markers (patterns + signals)
      const markers: SeriesMarker<Time>[] = [];

      if (toggles.showPatterns) {
        for (const p of result.patterns) {
          if (p.direction === 'neutral') continue;
          markers.push({
            time: toT(p.time),
            position: p.direction === 'bullish' ? 'belowBar' : 'aboveBar',
            color: p.direction === 'bullish' ? '#22c55e' : '#ef4444',
            shape: p.direction === 'bullish' ? 'arrowUp' : 'arrowDown',
            text: p.name,
          });
        }
      }

      if (toggles.showSignals) {
        for (const sig of result.signals.slice(0, 10)) {
          markers.push({
            time: toT(sig.time),
            position: sig.side === 'buy' ? 'belowBar' : 'aboveBar',
            color: sig.side === 'buy' ? '#4ade80' : '#f87171',
            shape: sig.side === 'buy' ? 'arrowUp' : 'arrowDown',
            text: `${sig.side.toUpperCase()} ${sig.confidence}%`,
          });
        }
      }

      if (markers.length > 0) {
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        cs.setMarkers(markers);
      }
    }

    // Resize
    const handleResize = () => {
      if (container) chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || window.innerHeight - 140 });
    };
    window.addEventListener('resize', handleResize);
    requestAnimationFrame(handleResize);

    return () => { window.removeEventListener('resize', handleResize); try { chart.remove(); } catch {} chartRef.current = null; };
  }, [candles, result, symbol, toggles]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// TVChart kept as fallback (unused - MainChart draws key levels directly)
// function TVWidgetInner / TVChart removed - using MainChart instead

// ============================================================
// MAIN PAGE
// ============================================================
interface ScanResult { symbol: string; label: string; trend: TrendDirection; signals: KeyLevelSignal[]; lastPrice: number; loading: boolean; }

export default function KeyLevelPage({ onBack, onOpenAcademy, onOpenSettings, onLogout }: { onBack?: () => void; onOpenAcademy?: () => void; onOpenSettings?: () => void; onLogout?: () => void }) {
  // Restore saved settings from localStorage
  const savedSettings = (() => {
    try {
      const raw = localStorage.getItem('kl_chart_settings');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();

  const [activeTab, setActiveTab] = useState<'chart' | 'scanner' | 'signals' | 'journal'>('chart');
  const [symbol, setSymbol] = useState(savedSettings?.symbol || 'BTCUSDT');
  const [timeframe, setTimeframe] = useState(savedSettings?.timeframe || '1h');
  const [result, setResult] = useState<KeyLevelResult | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanFilter, setScanFilter] = useState<'all' | 'top10' | 'top20' | 'top30' | 'eth'>('all');

  // Chart overlay toggles (restored from localStorage)
  const [overlayOpen, setOverlayOpen] = useState(savedSettings?.overlayOpen ?? true);
  const [showEma, setShowEma] = useState(savedSettings?.showEma ?? true);
  const [showKeyLevels, setShowKeyLevels] = useState(savedSettings?.showKeyLevels ?? true);
  const [showPatterns, setShowPatterns] = useState(savedSettings?.showPatterns ?? true);
  const [showSignals, setShowSignals] = useState(savedSettings?.showSignals ?? true);

  // Persist settings to localStorage whenever they change
  useEffect(() => {
    const settings = { symbol, timeframe, overlayOpen, showEma, showKeyLevels, showPatterns, showSignals };
    localStorage.setItem('kl_chart_settings', JSON.stringify(settings));
  }, [symbol, timeframe, overlayOpen, showEma, showKeyLevels, showPatterns, showSignals]);

  // Journal state
  const [trackedSignals, setTrackedSignals] = useState<TrackedSignal[]>([]);
  const [stats, setStats] = useState<TrackingStats | null>(null);
  const [journalFilter, setJournalFilter] = useState<'all' | SignalOutcome>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);

  const [savedSignalIds, setSavedSignalIds] = useState<Set<string>>(() => {
    // Load existing signal keys từ cache để tránh duplicate khi page reload
    try {
      const cached = JSON.parse(localStorage.getItem('crazii_kl_signals_cache') || '[]');
      const keys = new Set<string>();
      for (const s of cached) {
        // Key format dùng trong scanner: symbol_time_side
        // time trong TrackedSignal được lưu qua signal.time (unix seconds)
        // Tuy nhiên TrackedSignal không lưu signal.time, chỉ lưu createdAt (ms)
        // Nên dùng combo symbol + side + pattern là đủ unique per session
        if (s.symbol && s.side) {
          // Dùng createdAt (rounded to nearest 4h) để match
          const rounded = Math.floor((s.createdAt || 0) / (4 * 3600 * 1000));
          keys.add(`${s.symbol}_${rounded}_${s.side}`);
        }
      }
      return keys;
    } catch { return new Set<string>(); }
  });
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiScanSummary, setAiScanSummary] = useState<string>('');

  // Load signals from MongoDB (+ cache fallback)
  const refreshJournal = useCallback(async () => {
    const all = await loadAllSignals();
    setTrackedSignals(all);
    setStats(calculateStats(all));
  }, []);

  useEffect(() => { refreshJournal(); }, [refreshJournal]);

  // Load candle data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCandles(symbol, timeframe, 500);
        if (!cancelled && data.length > 0) {
          setCandles(data);
          setResult(calculateKeyLevelSystem(data));
        }
      } catch { /* skip */ }
    })();
    return () => { cancelled = true; };
  }, [symbol, timeframe]);

  // Auto-save tín hiệu mới vào Journal (chỉ signal mới nhất, đã validated bởi engine)
  useEffect(() => {
    if (!result || candles.length === 0) return;
    // Engine đã filter signal: chỉ 3 nến gần nhất + entry gần giá hiện tại <= 1.5%
    // Nên ở đây chỉ cần save tất cả signals từ engine (đã validated)
    for (const sig of result.signals) {
      const sigKey = `${symbol}_${sig.time}_${sig.side}`;
      if (savedSignalIds.has(sigKey)) continue;

      const tracked = createTrackedSignal(
        sig, symbol, timeframe, candles, result.emaData,
        result.volumeAnalysis[candles.length - 1]?.volumeRatio ?? 1
      );
      addSignal(tracked);
      setSavedSignalIds(prev => new Set([...prev, sigKey]));
    }
    if (result.signals.length > 0) refreshJournal();
  }, [result, symbol, timeframe, candles, savedSignalIds, refreshJournal]);

  // Manual check TP/SL (thay thế auto-track 30s)
  const [checking, setChecking] = useState(false);
  const handleCheckTPSL = useCallback(async () => {
    setChecking(true);
    const pending = getAllSignals().filter(s => s.outcome === 'pending');
    if (pending.length === 0) { setChecking(false); return; }

    const symbols = [...new Set(pending.map(s => s.symbol))];
    let updatedCount = 0;
    for (const sym of symbols) {
      try {
        const data = await fetchCandles(sym, '4h', 10);
        if (data.length === 0) continue;
        const symSignals = pending.filter(s => s.symbol === sym);
        for (const sig of symSignals) {
          // Check tất cả nến từ lúc entry đến giờ
          for (const candle of data) {
            const result = checkSignalOutcome(sig, candle.close, candle.high, candle.low);
            if (result) { updateSignal(sig.id, result); updatedCount++; break; }
          }
        }
      } catch { /* skip */ }
    }
    await refreshJournal();
    setChecking(false);
    if (updatedCount > 0) alert(`✅ Đã cập nhật ${updatedCount} signal (TP/SL)`);
    else alert('Không có signal nào chạm TP/SL mới');
  }, [refreshJournal]);

  // Clean duplicates (xóa cả trên MongoDB)
  const handleCleanDuplicates = useCallback(async () => {
    const all = trackedSignals;
    const seen = new Map<string, string>(); // key → id (keep first)
    const toDelete: string[] = [];

    for (const sig of all) {
      const key = `${sig.symbol}_${sig.side}_${sig.entry}_${sig.timeframe}`;
      if (seen.has(key)) {
        toDelete.push(sig.id);
      } else {
        seen.set(key, sig.id);
      }
    }

    if (toDelete.length === 0) { alert('Không có signal trùng'); return; }

    for (const id of toDelete) {
      await deleteSignal(id);
    }
    await refreshJournal();
    alert(`🧹 Đã xóa ${toDelete.length} signal trùng`);
  }, [trackedSignals, refreshJournal]);

  // Scanner - Cache-based dashboard
  // Kết quả scan lưu vào localStorage, auto-scan H4 tự cập nhật
  const SCAN_CACHE_KEY = 'kl_scan_results';

  const loadCachedScanResults = useCallback((): ScanResult[] => {
    try {
      const raw = localStorage.getItem(SCAN_CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }, []);


  const runScanner = useCallback(async () => {
    setScanning(true);
    const coins = COIN_LIST; // Luôn scan tất cả coin
    const results: ScanResult[] = [];
    for (const coin of coins) {
      try {
        const data = await fetchCandles(coin.value, '4h', 500);
        if (data.length > 50) {
          const analysis = calculateKeyLevelSystem(data);
          const topSignal = analysis.signals[0];
          results.push({ symbol: coin.value, label: coin.label, trend: analysis.trend.direction, signals: analysis.signals.slice(0, 1), lastPrice: data[data.length - 1].close, loading: false });

          // Auto-save signal mới vào Journal nếu có
          if (topSignal) {
            const sigKey = `${coin.value}_${topSignal.time}_${topSignal.side}`;
            if (!savedSignalIds.has(sigKey)) {
              const tracked = createTrackedSignal(
                topSignal, coin.value, '4h', data, analysis.emaData,
                analysis.volumeAnalysis[data.length - 1]?.volumeRatio ?? 1
              );
              addSignal(tracked);
              setSavedSignalIds(prev => new Set([...prev, sigKey]));
            }
          }
        }
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 150));
    }
    const sorted = results.sort((a, b) => (b.signals[0]?.confidence ?? 0) - (a.signals[0]?.confidence ?? 0));
    setScanResults(sorted);
    localStorage.setItem(SCAN_CACHE_KEY, JSON.stringify(sorted));
    localStorage.setItem('kl_last_autoscan_time', String(Date.now()));
    setLastAutoScan(Date.now());
    setScanning(false);
    refreshJournal();

    // AI đánh giá tổng hợp sau scan
    const signalsForAI = sorted.filter(sr => sr.signals.length > 0).map(sr => {
      const sig = sr.signals[0];
      return { symbol: sr.symbol, side: sig.side, entry: sig.entry, sl: sig.sl, tp: sig.tp, pattern: sig.pattern.name, trend: sig.trend, confidence: sig.confidence, volumeConfirm: sig.volumeConfirm };
    });
    if (signalsForAI.length > 0) {
      const history = trackedSignals.filter(s => s.outcome !== 'pending').slice(0, 10)
        .map(s => ({ pattern: s.pattern, trend: s.trend, outcome: s.outcome, side: s.side }));
      analyzeScanResults(signalsForAI, history).then(summary => {
        if (summary) setAiScanSummary(summary);
      });
    }
  }, [savedSignalIds, refreshJournal, trackedSignals]);

  // Load cached results on mount
  useEffect(() => {
    const cached = loadCachedScanResults();
    if (cached.length > 0) {
      setScanResults(cached);
    }
    const lastTime = localStorage.getItem('kl_last_autoscan_time');
    if (lastTime) setLastAutoScan(Number(lastTime));
  }, [loadCachedScanResults]);

  // Auto-scan scheduler: Tự scan tất cả coin khi H4 đóng nến (7h, 11h, 15h, 19h, 23h, 3h GMT+7)
  const [lastAutoScan, setLastAutoScan] = useState<number>(0);
  const [autoScanEnabled, setAutoScanEnabled] = useState(() => {
    try { return localStorage.getItem('kl_auto_scan') !== 'false'; } catch { return true; }
  });

  useEffect(() => {
    if (!autoScanEnabled) return;

    const checkH4Close = () => {
      const now = new Date();
      const gmt7Hour = (now.getUTCHours() + 7) % 24;
      const h4Hours = [3, 7, 11, 15, 19, 23]; // H4 đóng nến tại các giờ này (GMT+7)
      const minute = now.getMinutes();

      // Chạy trong 10 phút đầu sau khi H4 đóng nến (mở rộng window)
      if (h4Hours.includes(gmt7Hour) && minute <= 10) {
        const scanKey = `${now.toDateString()}_${gmt7Hour}`;
        const lastKey = localStorage.getItem('kl_last_autoscan');
        if (lastKey !== scanKey) {
          localStorage.setItem('kl_last_autoscan', scanKey);
          runScanner(); // Auto-scan tất cả coin
        }
      }

      // Fallback: Nếu đã quá lâu chưa scan (> 5h), scan ngay khi mở tab
      const lastTime = Number(localStorage.getItem('kl_last_autoscan_time') || '0');
      if (Date.now() - lastTime > 5 * 60 * 60 * 1000) {
        runScanner();
      }
    };

    checkH4Close(); // Check ngay khi mount
    const interval = setInterval(checkH4Close, 60000); // Check mỗi phút
    return () => clearInterval(interval);
  }, [autoScanEnabled, runScanner]);

  // Multi-timeframe context cho coin hiện tại
  const [mtfContext, setMtfContext] = useState<{ daily: { trend: string; volumeTrend: string; avgVolRatio: number } | null; weekly: { trend: string; structure: string } | null }>({ daily: null, weekly: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dailyData, weeklyData] = await Promise.all([
          fetchCandles(symbol, '1d', 50),
          fetchCandles(symbol, '1w', 20),
        ]);
        if (cancelled) return;
        const { analyzeMultiTimeframe } = await import('../utils/keyLevelEngine');
        const ctx = analyzeMultiTimeframe(dailyData, weeklyData);
        setMtfContext(ctx);
      } catch { /* skip */ }
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  const coinLabel = COIN_LIST.find(c => c.value === symbol)?.label || symbol;

  // Save signal to journal
  const handleSaveSignal = useCallback((sig: KeyLevelSignal) => {
    const sigKey = `${symbol}_${sig.time}_${sig.side}`;
    if (savedSignalIds.has(sigKey)) return;

    const tracked = createTrackedSignal(
      sig, symbol, timeframe, candles, result!.emaData,
      result!.volumeAnalysis[candles.length - 1]?.volumeRatio ?? 1
    );
    addSignal(tracked);
    setSavedSignalIds(prev => new Set([...prev, sigKey]));
    refreshJournal();
  }, [symbol, timeframe, candles, result, savedSignalIds, refreshJournal]);

  // AI Analysis
  const handleAIAnalyze = useCallback(async (sig: KeyLevelSignal) => {
    const sigKey = `${symbol}_${sig.time}_${sig.side}`;
    if (aiAnalysis[sigKey] || aiLoading) return;
    setAiLoading(sigKey);
    const history = trackedSignals.filter(s => s.outcome !== 'pending').slice(0, 10)
      .map(s => ({ pattern: s.pattern, trend: s.trend, outcome: s.outcome, side: s.side }));
    const candleData = candles.slice(-10).map(c => [c.open, c.high, c.low, c.close, c.volume]);
    const analysis = await analyzeNewSignal(
      { symbol, side: sig.side, entry: sig.entry, sl: sig.sl, tp: sig.tp, pattern: sig.pattern.name, trend: sig.trend, confidence: sig.confidence, volumeConfirm: sig.volumeConfirm, reason: sig.reason },
      candleData, history
    );
    setAiAnalysis(prev => ({ ...prev, [sigKey]: analysis || '❌ Không thể kết nối AI' }));
    setAiLoading(null);
  }, [symbol, candles, trackedSignals, aiAnalysis, aiLoading]);

  const handleAIPostMortem = useCallback(async (sig: TrackedSignal) => {
    if (aiAnalysis[sig.id] || aiLoading) return;
    setAiLoading(sig.id);
    const analysis = await analyzePostMortem({
      symbol: sig.symbol, side: sig.side, entry: sig.entry, sl: sig.sl, tp: sig.tp,
      pattern: sig.pattern, trend: sig.trend, confidence: sig.confidence,
      volumeConfirm: sig.volumeConfirm, reason: sig.reason,
      outcome: sig.outcome, rAchieved: sig.rAchieved,
    });
    setAiAnalysis(prev => ({ ...prev, [sig.id]: analysis || '❌ Không thể kết nối AI' }));
    setAiLoading(null);
  }, [aiAnalysis, aiLoading]);

  // Edit signal notes/tags
  const handleStartEdit = (sig: TrackedSignal) => {
    setEditingId(sig.id);
    setEditNotes(sig.notes);
    setEditTags(sig.tags);
  };
  const handleSaveEdit = () => {
    if (!editingId) return;
    updateSignal(editingId, { notes: editNotes, tags: editTags });
    setEditingId(null);
    refreshJournal();
  };

  // Manual outcome override
  const handleSetOutcome = (id: string, outcome: SignalOutcome) => {
    const sig = trackedSignals.find(s => s.id === id);
    if (!sig) return;
    let rAchieved = sig.rAchieved;
    if (outcome === 'tp') rAchieved = Math.abs(sig.tp - sig.entry) / Math.abs(sig.entry - sig.sl);
    else if (outcome === 'sl') rAchieved = -1;
    else if (outcome === 'breakeven') rAchieved = 0;
    updateSignal(id, { outcome, closedAt: Date.now(), rAchieved });
    refreshJournal();
  };

  // Export helpers
  const handleExportCSV = () => {
    const csv = exportAsCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `kl_journal_${Date.now()}.csv`; a.click();
  };
  const handleExportJSONL = () => {
    const jsonl = exportForTraining();
    const blob = new Blob([jsonl], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `kl_training_${Date.now()}.jsonl`; a.click();
  };


  const trendBadge = (dir: TrendDirection) => {
    const c: Record<TrendDirection, string> = { uptrend: '#22c55e', downtrend: '#ef4444', sideway: '#eab308' };
    const l: Record<TrendDirection, string> = { uptrend: '⬆️ TĂNG', downtrend: '⬇️ GIẢM', sideway: '↔️ SIDEWAY' };
    return <span style={{ color: c[dir], fontWeight: 'bold', fontSize: '0.85rem' }}>{l[dir]}</span>;
  };

  const filteredJournal = journalFilter === 'all' ? trackedSignals : trackedSignals.filter(s => s.outcome === journalFilter);

  return (
    <div style={S.container}>
      {/* Header */}
      <header style={S.header}>
        <div style={S.headerLeft}>
          <h1 style={S.title}>🔑 Key Level Trading System</h1>
        </div>
        <div style={S.headerRight}>
          {result && trendBadge(result.trend.direction)}
          <span style={S.price}>{coinLabel}: {candles.length > 0 ? fmtPrice(candles[candles.length - 1].close) : '---'}</span>
          {onOpenAcademy && <button onClick={onOpenAcademy} style={S.navBtn}>📖 Học viện</button>}
          {onOpenSettings && <button onClick={onOpenSettings} style={S.navBtn}>⚙️ Cài đặt</button>}
          {onLogout && <button onClick={onLogout} style={{ ...S.navBtn, color: '#ef4444', borderColor: '#ef444440' }}>Đăng xuất</button>}
        </div>
      </header>

      {/* Controls */}
      <div style={S.controls}>
        <div style={S.controlGroup}>
          <select value={symbol} onChange={e => setSymbol(e.target.value)} style={S.select}>
            <optgroup label="Top 10">{COIN_LIST.filter(c => c.category === 'top10').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>
            <optgroup label="Top 11-20">{COIN_LIST.filter(c => c.category === 'top20').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>
            <optgroup label="Top 21-30">{COIN_LIST.filter(c => c.category === 'top30').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>
            <optgroup label="ETH Ecosystem">{COIN_LIST.filter(c => c.category === 'eth').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</optgroup>
          </select>
          <div style={S.tfGroup}>
            {TIMEFRAMES_KL.map(tf => (
              <button key={tf.value} onClick={() => setTimeframe(tf.value)} style={{ ...S.tfBtn, ...(timeframe === tf.value ? S.tfBtnActive : {}) }}>{tf.label}</button>
            ))}
          </div>
        </div>
        <div style={S.tabs}>
          <button onClick={() => setActiveTab('chart')} style={{ ...S.tabBtn, ...(activeTab === 'chart' ? S.tabActive : {}) }}>📊 Chart</button>
          <button onClick={() => setActiveTab('scanner')} style={{ ...S.tabBtn, ...(activeTab === 'scanner' ? S.tabActive : {}) }}>🔍 Scanner</button>
          <button onClick={() => setActiveTab('signals')} style={{ ...S.tabBtn, ...(activeTab === 'signals' ? S.tabActive : {}) }}>🎯 Tín hiệu ({result?.signals.length ?? 0})</button>
          <button onClick={() => { setActiveTab('journal'); refreshJournal(); }} style={{ ...S.tabBtn, ...(activeTab === 'journal' ? S.tabActiveJournal : {}) }}>
            📓 Journal ({trackedSignals.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={S.content}>

        {/* ===== CHART ===== */}
        {activeTab === 'chart' && (
          <div style={S.chartWrapper}>
            <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
              {/* Full-width chart with Key Levels drawn directly */}
              <div style={{ width: '100%', height: '100%' }}>
                <MainChart candles={candles} result={result} symbol={symbol} toggles={{ showEma, showKeyLevels, showPatterns, showSignals }} />
              </div>
              {/* Overlay panel - top left corner on chart */}
              {result && (
                <div style={{ ...S.chartOverlay, ...(overlayOpen ? {} : { width: 'auto', padding: '4px 8px' }) }}>
                  {/* Header with collapse toggle */}
                  <div style={S.overlayHeader}>
                    <span style={{ color: '#94a3b8', fontSize: '0.72rem', fontWeight: 'bold' }}>{overlayOpen ? '📋 Panel' : ''}</span>
                    <button onClick={() => setOverlayOpen(!overlayOpen)} style={S.collapseBtn} title={overlayOpen ? 'Thu gọn' : 'Mở rộng'}>
                      {overlayOpen ? '◀' : '▶'}
                    </button>
                  </div>

                  {overlayOpen && (
                    <>
                      {/* Toggle checkboxes */}
                      <div style={S.overlayToggles}>
                        <label style={S.toggleLabel}>
                          <input type="checkbox" checked={showEma} onChange={e => setShowEma(e.target.checked)} style={S.toggleCheckbox} />
                          <span style={{ color: '#f97316' }}>📐 EMA</span>
                        </label>
                        <label style={S.toggleLabel}>
                          <input type="checkbox" checked={showKeyLevels} onChange={e => setShowKeyLevels(e.target.checked)} style={S.toggleCheckbox} />
                          <span style={{ color: '#22c55e' }}>🔑 Key Levels</span>
                        </label>
                        <label style={S.toggleLabel}>
                          <input type="checkbox" checked={showPatterns} onChange={e => setShowPatterns(e.target.checked)} style={S.toggleCheckbox} />
                          <span style={{ color: '#eab308' }}>🕯️ Patterns</span>
                        </label>
                        <label style={S.toggleLabel}>
                          <input type="checkbox" checked={showSignals} onChange={e => setShowSignals(e.target.checked)} style={S.toggleCheckbox} />
                          <span style={{ color: '#3b82f6' }}>🎯 Signals</span>
                        </label>
                        <label style={S.toggleLabel}>
                          <input type="checkbox" checked={autoScanEnabled} onChange={e => { setAutoScanEnabled(e.target.checked); localStorage.setItem('kl_auto_scan', String(e.target.checked)); }} style={S.toggleCheckbox} />
                          <span style={{ color: '#a855f7' }}>⏰ Auto-scan H4</span>
                        </label>
                      </div>

                      {/* Multi-timeframe Context */}
                      {mtfContext.daily && (
                        <div style={S.overlaySection}>
                          <div style={S.overlayTitle}>🔍 MTF Context</div>
                          <div style={S.overlayEmaRow}>
                            <span>D1:</span>
                            <span style={{ color: mtfContext.daily.trend === 'uptrend' ? '#22c55e' : mtfContext.daily.trend === 'downtrend' ? '#ef4444' : '#eab308' }}>
                              {mtfContext.daily.trend === 'uptrend' ? '⬆️' : mtfContext.daily.trend === 'downtrend' ? '⬇️' : '↔️'}
                            </span>
                          </div>
                          <div style={S.overlayEmaRow}>
                            <span>Vol:</span>
                            <span style={{ color: mtfContext.daily.volumeTrend === 'buying' ? '#22c55e' : mtfContext.daily.volumeTrend === 'selling' ? '#ef4444' : '#94a3b8' }}>
                              {mtfContext.daily.volumeTrend === 'buying' ? '🟢 Mua' : mtfContext.daily.volumeTrend === 'selling' ? '🔴 Bán' : '⚪ Cân bằng'}
                            </span>
                          </div>
                          {mtfContext.weekly && (
                            <>
                              <div style={S.overlayEmaRow}>
                                <span>W1:</span>
                                <span style={{ color: mtfContext.weekly.trend === 'uptrend' ? '#22c55e' : mtfContext.weekly.trend === 'downtrend' ? '#ef4444' : '#eab308' }}>
                                  {mtfContext.weekly.trend === 'uptrend' ? '⬆️' : mtfContext.weekly.trend === 'downtrend' ? '⬇️' : '↔️'}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '2px' }}>
                                {mtfContext.weekly.structure === 'double_top_risk' ? '⚠️ 2 đỉnh (rủi ro)' :
                                 mtfContext.weekly.structure === 'double_bottom_potential' ? '💡 2 đáy (tiềm năng)' :
                                 mtfContext.weekly.structure === 'triple_top_risk' ? '🚨 3 đỉnh' :
                                 mtfContext.weekly.structure === 'triple_bottom_potential' ? '💎 3 đáy' :
                                 mtfContext.weekly.structure === 'higher_highs_lows' ? '📈 HH + HL' :
                                 mtfContext.weekly.structure === 'lower_highs_lows' ? '📉 LH + LL' : '— Trending'}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Key Levels */}
                      <div style={S.overlaySection}>
                        <div style={S.overlayTitle}>🔑 Key Levels</div>
                        {result.keyLevels.length > 0 ? result.keyLevels.map((lv, i) => (
                          <div key={i} style={S.overlayLevelRow}>
                            <span style={{ color: lv.type === 'support' ? '#22c55e' : '#ef4444', fontSize: '0.72rem' }}>
                              {lv.type === 'support' ? '🟢S' : '🔴R'}
                            </span>
                            <span style={{ color: '#f1f5f9', fontSize: '0.8rem', fontWeight: 'bold' }}>{fmtPrice(lv.price)}</span>
                            <span style={{ color: '#64748b', fontSize: '0.65rem' }}>{lv.touches}t</span>
                          </div>
                        )) : <div style={{ color: '#475569', fontSize: '0.7rem' }}>Đang tính...</div>}
                      </div>
                      {/* EMA + Trend */}
                      <div style={S.overlaySection}>
                        <div style={S.overlayTitle}>📐 EMA</div>
                        <div style={S.overlayEmaRow}><span style={{ color: '#f97316' }}>34:</span> <span>{fmtPrice(result.trend.ema34)}</span></div>
                        <div style={S.overlayEmaRow}><span style={{ color: '#3b82f6' }}>89:</span> <span>{fmtPrice(result.trend.ema89)}</span></div>
                        <div style={S.overlayEmaRow}><span style={{ color: '#a855f7' }}>200:</span> <span>{fmtPrice(result.trend.ema200)}</span></div>
                        <div style={{ fontSize: '0.75rem', marginTop: '3px', fontWeight: 'bold', color: result.trend.direction === 'uptrend' ? '#22c55e' : result.trend.direction === 'downtrend' ? '#ef4444' : '#eab308' }}>
                          {result.trend.direction === 'uptrend' ? '⬆️ Tăng' : result.trend.direction === 'downtrend' ? '⬇️ Giảm' : '↔️ Sideway'}
                        </div>
                      </div>
                      {/* Recent Patterns */}
                      <div style={S.overlaySection}>
                        <div style={S.overlayTitle}>🕯️ Mô hình nến</div>
                        {result.patterns.filter(p => p.direction !== 'neutral').length > 0 ? (
                          result.patterns
                            .filter(p => p.direction !== 'neutral')
                            .slice(-5).reverse()
                            .map((p, i) => (
                              <div key={i} style={S.overlayPatternRow}>
                                <span style={{ color: p.direction === 'bullish' ? '#22c55e' : '#ef4444', fontSize: '0.7rem' }}>
                                  {p.direction === 'bullish' ? '▲' : '▼'}
                                </span>
                                <span style={{ color: '#cbd5e1', fontSize: '0.72rem', flex: 1 }}>{p.name}</span>
                                <span style={{ color: '#475569', fontSize: '0.6rem' }}>
                                  {new Date((p.time + GMT7_OFFSET) * 1000).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            ))
                        ) : <div style={{ color: '#475569', fontSize: '0.7rem' }}>Chưa phát hiện</div>}
                      </div>
                      {/* Volume */}
                      <div style={{ ...S.overlaySection, borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>
                        <div style={S.overlayTitle}>📊 Volume</div>
                        {result.volumeAnalysis.length > 0 && (() => {
                          const lastVol = result.volumeAnalysis[result.volumeAnalysis.length - 1];
                          return (
                            <>
                              <div style={S.overlayEmaRow}><span>Ratio:</span> <span style={{ color: lastVol.isHighVolume ? '#22c55e' : '#94a3b8' }}>{lastVol.volumeRatio.toFixed(2)}x</span></div>
                              <div style={S.overlayEmaRow}><span>Status:</span> <span style={{ color: lastVol.isVeryHighVolume ? '#22c55e' : lastVol.isHighVolume ? '#eab308' : '#64748b' }}>
                                {lastVol.isVeryHighVolume ? '🔥 Rất cao' : lastVol.isHighVolume ? '📈 Cao' : '📉 Thấp'}
                              </span></div>
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div style={S.chartHintBar}>
              <p style={S.chartHint}>📊 Chart tự vẽ Key Levels, EMA 34/89/200, Pattern markers & Signal arrows. Tín hiệu mới tự lưu vào Journal.</p>
            </div>
          </div>
        )}

        {/* ===== SCANNER (Dashboard) ===== */}
        {activeTab === 'scanner' && (
          <div style={S.panel}>
            <div style={S.scannerHeader}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '0.9rem' }}>📡 Dashboard H4 Scan</span>
                  {lastAutoScan > 0 && <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Cập nhật: {new Date(lastAutoScan).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</span>}
                </div>
                <div style={S.filterGroup}>
                  {(['all', 'top10', 'top20', 'top30', 'eth'] as const).map(f => (
                    <button key={f} onClick={() => setScanFilter(f)} style={{ ...S.filterBtn, ...(scanFilter === f ? S.filterBtnActive : {}) }}>
                      {f === 'all' ? `Tất cả (${scanResults.length})` : f === 'eth' ? 'ETH Eco' : f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                <button onClick={runScanner} disabled={scanning} style={S.primaryBtn}>{scanning ? '⏳ Đang scan...' : '� Scan lại'}</button>
                <span style={{ fontSize: '0.68rem', color: '#475569' }}>Auto-scan mỗi H4 close: {autoScanEnabled ? '✅ Bật' : '❌ Tắt'}</span>
              </div>
            </div>
            {aiScanSummary && (
              <div style={{ margin: '0 0 14px', padding: '12px 16px', background: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: '10px', fontSize: '0.82rem', color: '#c4b5fd', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                <div style={{ fontWeight: 'bold', color: '#a78bfa', marginBottom: '6px' }}>🤖 AI Đánh giá sau scan:</div>
                {aiScanSummary}
              </div>
            )}
            {scanResults.length === 0 && !scanning && (
              <div style={S.emptyState}>
                <p>Chưa có dữ liệu scan.</p>
                <p style={{ fontSize: '0.8rem', color: '#475569', marginTop: '8px' }}>Auto-scan sẽ chạy khi H4 đóng nến (7h, 11h, 15h, 19h, 23h, 3h).<br/>Hoặc nhấn "Scan lại" để scan ngay.</p>
              </div>
            )}
            <div style={S.scanGrid}>
              {(scanFilter === 'all' ? scanResults : scanResults.filter(sr => COIN_LIST.find(c => c.value === sr.symbol)?.category === scanFilter)).map(sr => (
                <div key={sr.symbol} style={S.scanCard} onClick={() => { setSymbol(sr.symbol); setActiveTab('chart'); }}>
                  <div style={S.scanCardHeader}><span style={S.scanCoinName}>{sr.label}</span>{trendBadge(sr.trend)}</div>
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '6px' }}>${fmtPrice(sr.lastPrice)}</div>
                  {sr.signals.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {sr.signals.slice(0, 1).map((sig, i) => (
                        <div key={i} style={{ background: sig.side === 'buy' ? '#22c55e08' : '#ef444408', border: `1px solid ${sig.side === 'buy' ? '#22c55e30' : '#ef444430'}`, borderRadius: '6px', padding: '6px 8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ color: sig.side === 'buy' ? '#22c55e' : '#ef4444', fontWeight: 'bold', fontSize: '0.82rem' }}>{sig.side === 'buy' ? '🟢 BUY' : '🔴 SELL'}</span>
                            <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>{sig.confidence}% | R:R {sig.rr.toFixed(1)}</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2px', fontSize: '0.7rem', color: '#94a3b8' }}>
                            <span>E: <strong style={{ color: '#e2e8f0' }}>{fmtPrice(sig.entry)}</strong></span>
                            <span>SL: <strong style={{ color: '#ef4444' }}>{fmtPrice(sig.sl)}</strong></span>
                            <span>TP: <strong style={{ color: '#22c55e' }}>{fmtPrice(sig.tp)}</strong></span>
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '3px' }}>{sig.pattern.name}</div>
                        </div>
                      ))}
                    </div>
                  ) : <div style={{ color: '#475569', fontSize: '0.8rem', fontStyle: 'italic' }}>Chưa có tín hiệu</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== SIGNALS ===== */}
        {activeTab === 'signals' && (
          <div style={S.panel}>
            <h3 style={S.sectionTitle}>🎯 Tín hiệu - {coinLabel} ({timeframe})</h3>
            {result && result.signals.length > 0 ? result.signals.slice(0, 15).map((sig, idx) => {
              const sigKey = `${symbol}_${sig.time}_${sig.side}`;
              const isSaved = savedSignalIds.has(sigKey);
              return (
                <div key={idx} style={{ ...S.signalCard, borderLeft: `4px solid ${sig.side === 'buy' ? '#22c55e' : '#ef4444'}` }}>
                  <div style={S.signalHeader}>
                    <span style={{ color: sig.side === 'buy' ? '#22c55e' : '#ef4444', fontWeight: 'bold', fontSize: '1.1rem' }}>
                      {sig.side === 'buy' ? '🟢 BUY' : '🔴 SELL'}
                    </span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Confidence: <strong>{sig.confidence}%</strong></span>
                      <button
                        onClick={() => handleAIAnalyze(sig)}
                        disabled={!!aiAnalysis[sigKey] || aiLoading === sigKey}
                        style={{ ...S.saveBtn, background: '#8b5cf610', color: '#c4b5fd', borderColor: '#8b5cf640' }}
                      >
                        {aiLoading === sigKey ? '⏳...' : aiAnalysis[sigKey] ? '✅ AI' : '🤖 AI Đánh giá'}
                      </button>
                      <button
                        onClick={() => result && handleSaveSignal(sig)}
                        disabled={isSaved || !result}
                        style={{ ...S.saveBtn, ...(isSaved ? S.saveBtnDone : {}) }}
                      >
                        {isSaved ? '✅ Đã lưu' : '📓 Lưu vào Journal'}
                      </button>
                    </div>
                  </div>
                  <div style={S.signalBody}>
                    <div style={S.signalRow}><span>📍 Entry:</span> <strong>${fmtPrice(sig.entry)}</strong></div>
                    <div style={S.signalRow}><span>🛑 SL:</span> <strong style={{ color: '#ef4444' }}>${fmtPrice(sig.sl)}</strong></div>
                    <div style={S.signalRow}><span>🎯 TP:</span> <strong style={{ color: '#22c55e' }}>${fmtPrice(sig.tp)}</strong></div>
                    <div style={S.signalRow}><span>📊 R:R:</span> <strong>{sig.rr.toFixed(1)}</strong></div>
                    <div style={S.signalRow}><span>📈 Vol:</span> <strong>{sig.volumeConfirm ? '✅ Xác nhận' : '⚠️ Chưa'}</strong></div>
                    <div style={S.signalRow}><span>📐 Pattern:</span> <strong>{sig.pattern.name}</strong></div>
                  </div>
                  <div style={S.signalReason}>{sig.reason}</div>
                  <div style={S.signalTime}>{fmtDate((sig.time + GMT7_OFFSET) * 1000)}</div>
                  {aiAnalysis[sigKey] && (
                    <div style={{ marginTop: '8px', padding: '10px', background: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: '8px', fontSize: '0.82rem', color: '#c4b5fd', lineHeight: '1.5' }}>
                      <span style={{ fontWeight: 'bold', color: '#a78bfa' }}>🤖 AI:</span> {aiAnalysis[sigKey]}
                    </div>
                  )}
                </div>
              );
            }) : <div style={S.emptyState}>Chưa có tín hiệu nào đủ điều kiện (≥55% confidence, R:R ≥ 1.5)</div>}
          </div>
        )}

        {/* ===== JOURNAL ===== */}
        {activeTab === 'journal' && (
          <div style={S.panel}>
            {/* Stats overview */}
            {stats && stats.totalSignals > 0 && (
              <div style={S.statsRow}>
                <div style={S.statCard}><div style={S.statLabel}>Tổng tín hiệu</div><div style={S.statValue}>{stats.totalSignals}</div></div>
                <div style={{ ...S.statCard, borderColor: '#22c55e40' }}>
                  <div style={S.statLabel}>Win Rate</div>
                  <div style={{ ...S.statValue, color: '#22c55e' }}>{stats.winRate.toFixed(1)}%</div>
                </div>
                <div style={{ ...S.statCard, borderColor: '#3b82f640' }}>
                  <div style={S.statLabel}>Avg R</div>
                  <div style={{ ...S.statValue, color: stats.avgR >= 0 ? '#22c55e' : '#ef4444' }}>{stats.avgR.toFixed(2)}R</div>
                </div>
                <div style={{ ...S.statCard, borderColor: '#22c55e40' }}>
                  <div style={S.statLabel}>✅ TP</div>
                  <div style={{ ...S.statValue, color: '#22c55e' }}>{stats.wins}</div>
                </div>
                <div style={{ ...S.statCard, borderColor: '#ef444440' }}>
                  <div style={S.statLabel}>❌ SL</div>
                  <div style={{ ...S.statValue, color: '#ef4444' }}>{stats.losses}</div>
                </div>
                <div style={{ ...S.statCard, borderColor: '#eab30840' }}>
                  <div style={S.statLabel}>⏳ Pending</div>
                  <div style={{ ...S.statValue, color: '#eab308' }}>{stats.pending}</div>
                </div>
              </div>
            )}

            {/* Pattern analytics */}
            {stats && Object.keys(stats.byPattern).length > 0 && (
              <div style={S.analyticsRow}>
                <div style={S.analyticsBox}>
                  <div style={S.analyticsTitle}>📊 Theo Pattern</div>
                  {Object.entries(stats.byPattern).sort((a, b) => b[1].total - a[1].total).map(([pat, data]) => (
                    <div key={pat} style={S.analyticsItem}>
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1', flex: 1 }}>{pat}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{data.total} lệnh</span>
                      <span style={{ fontSize: '0.75rem', color: data.winRate >= 50 ? '#22c55e' : '#ef4444', minWidth: '45px', textAlign: 'right' }}>{data.winRate.toFixed(0)}%</span>
                      <span style={{ fontSize: '0.75rem', color: data.avgR >= 0 ? '#22c55e' : '#ef4444', minWidth: '45px', textAlign: 'right' }}>{data.avgR.toFixed(1)}R</span>
                    </div>
                  ))}
                </div>
                <div style={S.analyticsBox}>
                  <div style={S.analyticsTitle}>⏱ Theo Timeframe</div>
                  {Object.entries(stats.byTimeframe).map(([tf, data]) => (
                    <div key={tf} style={S.analyticsItem}>
                      <span style={{ fontSize: '0.8rem', color: '#cbd5e1', flex: 1 }}>{tf}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{data.total} lệnh</span>
                      <span style={{ fontSize: '0.75rem', color: data.winRate >= 50 ? '#22c55e' : '#ef4444', minWidth: '45px', textAlign: 'right' }}>{data.winRate.toFixed(0)}%</span>
                      <span style={{ fontSize: '0.75rem', color: data.avgR >= 0 ? '#22c55e' : '#ef4444', minWidth: '45px', textAlign: 'right' }}>{data.avgR.toFixed(1)}R</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={S.journalActions}>
              <div style={S.filterGroup}>
                {(['all', 'pending', 'tp', 'sl', 'partial', 'breakeven', 'manual_close'] as const).map(f => (
                  <button key={f} onClick={() => setJournalFilter(f)}
                    style={{ ...S.filterBtn, ...(journalFilter === f ? { background: OUTCOME_COLORS[f === 'all' ? 'pending' : f] + '30', color: '#f1f5f9', borderColor: OUTCOME_COLORS[f === 'all' ? 'pending' : f] } : {}) }}>
                    {f === 'all' ? `Tất cả (${trackedSignals.length})` : OUTCOME_LABELS[f]}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={handleCleanDuplicates} style={{ ...S.exportBtn, color: '#f59e0b', borderColor: '#f59e0b40' }}>🧹 Clean trùng</button>
                <button onClick={handleCheckTPSL} disabled={checking} style={{ ...S.exportBtn, color: '#22c55e', borderColor: '#22c55e40' }}>{checking ? '⏳ Đang check...' : '🔄 Check TP/SL'}</button>
                <button onClick={handleExportCSV} style={S.exportBtn}>📊 Export CSV</button>
                <button onClick={handleExportJSONL} style={S.exportBtn}>🤖 Export AI (JSONL)</button>
              </div>
            </div>

            {/* Signal list */}
            {filteredJournal.length === 0
              ? <div style={S.emptyState}>Chưa có tín hiệu nào. Vào tab "Tín hiệu" và nhấn "Lưu vào Journal" để bắt đầu.</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredJournal.map(sig => (
                    <div key={sig.id} style={{ ...S.journalCard, borderLeft: `4px solid ${OUTCOME_COLORS[sig.outcome]}` }}>
                      <div style={S.journalCardHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ color: sig.side === 'buy' ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                            {sig.side === 'buy' ? '🟢' : '🔴'} {sig.side.toUpperCase()}
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{sig.symbol} · {sig.timeframe}</span>
                          <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{sig.pattern}</span>
                          <span style={{ background: OUTCOME_COLORS[sig.outcome] + '20', color: OUTCOME_COLORS[sig.outcome], padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', border: `1px solid ${OUTCOME_COLORS[sig.outcome]}40` }}>
                            {OUTCOME_LABELS[sig.outcome]}
                          </span>
                          {sig.rAchieved !== null && (
                            <span style={{ color: sig.rAchieved >= 0 ? '#22c55e' : '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>
                              {sig.rAchieved >= 0 ? '+' : ''}{sig.rAchieved.toFixed(2)}R
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {sig.outcome === 'pending' && (
                            <>
                              <button onClick={() => handleSetOutcome(sig.id, 'tp')} style={{ ...S.outcomeBtn, background: '#22c55e20', color: '#22c55e', borderColor: '#22c55e40' }}>✅ TP</button>
                              <button onClick={() => handleSetOutcome(sig.id, 'sl')} style={{ ...S.outcomeBtn, background: '#ef444420', color: '#ef4444', borderColor: '#ef444440' }}>❌ SL</button>
                              <button onClick={() => handleSetOutcome(sig.id, 'breakeven')} style={{ ...S.outcomeBtn, background: '#94a3b820', color: '#94a3b8', borderColor: '#94a3b840' }}>➕ BE</button>
                            </>
                          )}
                          <button onClick={() => handleStartEdit(sig)} style={S.editBtn}>✏️</button>
                          {sig.outcome !== 'pending' && (
                            <button onClick={() => handleAIPostMortem(sig)} disabled={!!aiAnalysis[sig.id] || aiLoading === sig.id}
                              style={{ ...S.editBtn, color: '#a78bfa', borderColor: '#4c1d9540' }}>
                              {aiLoading === sig.id ? '⏳' : '🤖'}
                            </button>
                          )}
                          <button onClick={() => { deleteSignal(sig.id); refreshJournal(); }} style={S.deleteBtn}>🗑</button>
                        </div>
                      </div>

                      <div style={S.journalCardBody}>
                        <span>Entry: <strong>${fmtPrice(sig.entry)}</strong></span>
                        <span>SL: <strong style={{ color: '#ef4444' }}>${fmtPrice(sig.sl)}</strong></span>
                        <span>TP: <strong style={{ color: '#22c55e' }}>${fmtPrice(sig.tp)}</strong></span>
                        <span>Conf: <strong>{sig.confidence}%</strong></span>
                        <span>Vol: <strong>{sig.volumeConfirm ? '✅' : '⚠️'}</strong></span>
                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{fmtDate(sig.createdAt)}</span>
                      </div>

                      {sig.tags.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {sig.tags.map(tag => <span key={tag} style={S.tag}>{tag}</span>)}
                        </div>
                      )}

                      {sig.notes && <div style={{ ...S.signalReason, marginTop: '6px' }}>📝 {sig.notes}</div>}

                      {aiAnalysis[sig.id] && (
                        <div style={{ marginTop: '6px', padding: '8px 10px', background: '#1e1b4b', border: '1px solid #4c1d95', borderRadius: '6px', fontSize: '0.78rem', color: '#c4b5fd', lineHeight: '1.5' }}>
                          <span style={{ fontWeight: 'bold', color: '#a78bfa' }}>🤖 AI:</span> {aiAnalysis[sig.id]}
                        </div>
                      )}

                      {/* Edit panel */}
                      {editingId === sig.id && (
                        <div style={S.editPanel}>
                          <textarea
                            value={editNotes}
                            onChange={e => setEditNotes(e.target.value)}
                            placeholder="Ghi chú (lý do TP/SL, tin tức ảnh hưởng...)"
                            style={S.textarea}
                          />
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                            {PRESET_TAGS.map(t => (
                              <button key={t} onClick={() => setEditTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                style={{ ...S.tag, cursor: 'pointer', opacity: editTags.includes(t) ? 1 : 0.4, border: `1px solid ${editTags.includes(t) ? '#3b82f6' : '#334155'}` }}>
                                {t}
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button onClick={handleSaveEdit} style={S.primaryBtn}>💾 Lưu</button>
                            <button onClick={() => setEditingId(null)} style={S.exportBtn}>Hủy</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const S: Record<string, React.CSSProperties> = {
  container: { height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#060d1a', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px', borderBottom: '1px solid #1e2d4a', background: '#0a1628', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '16px' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  backBtn: { background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' },
  navBtn: { background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  title: { margin: 0, fontSize: '1.2rem', color: '#fbbf24' },
  price: { color: '#f1f5f9', fontWeight: 'bold', fontSize: '1rem' },
  controls: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 20px', borderBottom: '1px solid #1e2d4a', flexWrap: 'wrap', gap: '8px', flexShrink: 0 },
  controlGroup: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  select: { background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' },
  tfGroup: { display: 'flex', gap: '3px' },
  tfBtn: { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' },
  tfBtnActive: { background: '#fbbf24', color: '#0a0e17', borderColor: '#fbbf24' },
  tabs: { display: 'flex', gap: '3px' },
  tabBtn: { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  tabActive: { background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' },
  tabActiveJournal: { background: '#8b5cf6', color: '#fff', borderColor: '#8b5cf6' },
  content: { flex: 1, overflow: 'auto', padding: '0' },
  chartWrapper: { height: '100%', display: 'flex', flexDirection: 'column' },
  chartOverlay: { position: 'absolute', top: '8px', left: '8px', width: '190px', background: 'rgba(10, 22, 40, 0.92)', backdropFilter: 'blur(6px)', border: '1px solid #1e2d4a', borderRadius: '8px', padding: '8px', overflowY: 'auto', maxHeight: 'calc(100% - 16px)', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' },
  overlayHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid #1e2d4a60' },
  collapseBtn: { background: 'none', border: '1px solid #334155', color: '#94a3b8', width: '22px', height: '22px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  overlayToggles: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #1e2d4a40' },
  toggleLabel: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.75rem', color: '#cbd5e1' },
  toggleCheckbox: { width: '14px', height: '14px', accentColor: '#3b82f6', cursor: 'pointer' },
  overlaySection: { marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #1e2d4a40' },
  overlayTitle: { color: '#94a3b8', fontSize: '0.68rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' },
  overlayLevelRow: { display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 0' },
  overlayEmaRow: { display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', padding: '1px 0' },
  overlayPatternRow: { display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0' },
  chartHintBar: { padding: '5px 12px', background: '#0a1628', borderTop: '1px solid #1e2d4a', flexShrink: 0 },
  chartHint: { margin: 0, fontSize: '0.78rem', color: '#64748b' },
  panel: { padding: '12px 16px' },
  emptyState: { textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '0.9rem', background: '#0f172a', borderRadius: '8px', border: '1px solid #1e2d4a', marginTop: '8px' },
  sectionTitle: { margin: '0 0 12px 0', color: '#fbbf24', fontSize: '1rem' },
  // Scanner
  scannerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' },
  filterGroup: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  filterBtn: { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' },
  filterBtnActive: { background: '#8b5cf640', color: '#f1f5f9', borderColor: '#8b5cf6' },
  primaryBtn: { background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' },
  exportBtn: { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', padding: '7px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.82rem' },
  scanGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '10px', marginTop: '4px' },
  scanCard: { background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: '8px', padding: '12px', cursor: 'pointer' },
  scanCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' },
  scanCoinName: { fontWeight: 'bold', fontSize: '0.95rem', color: '#f1f5f9' },
  scanSigItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 7px', background: '#1e293b40', borderRadius: '4px', borderWidth: '1px', borderStyle: 'solid', marginBottom: '3px' },
  // Signal card
  signalCard: { background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: '8px', padding: '14px', marginBottom: '10px' },
  signalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' },
  signalBody: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px 12px', marginBottom: '8px' },
  signalRow: { display: 'flex', justifyContent: 'space-between', color: '#cbd5e1', fontSize: '0.85rem' },
  signalReason: { color: '#64748b', fontSize: '0.78rem', padding: '7px', background: '#1e293b40', borderRadius: '4px' },
  signalTime: { color: '#475569', fontSize: '0.73rem', marginTop: '5px', textAlign: 'right' },
  saveBtn: { background: '#8b5cf620', color: '#a78bfa', border: '1px solid #8b5cf640', padding: '4px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '0.78rem' },
  saveBtnDone: { background: '#22c55e20', color: '#86efac', borderColor: '#22c55e40', cursor: 'default' },
  // Journal
  statsRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' },
  statCard: { flex: 1, minWidth: '90px', background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: '8px', padding: '10px 12px', textAlign: 'center' },
  statLabel: { color: '#64748b', fontSize: '0.73rem', marginBottom: '4px' },
  statValue: { fontSize: '1.3rem', fontWeight: 'bold', color: '#f1f5f9' },
  analyticsRow: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' },
  analyticsBox: { flex: 1, minWidth: '260px', background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: '8px', padding: '10px' },
  analyticsTitle: { color: '#94a3b8', fontSize: '0.78rem', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase' },
  analyticsItem: { display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #1e2d4a20' },
  journalActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' },
  journalCard: { background: '#0f172a', border: '1px solid #1e2d4a', borderRadius: '8px', padding: '12px' },
  journalCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' },
  journalCardBody: { display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '0.83rem', color: '#94a3b8' },
  tag: { background: '#1e293b', color: '#94a3b8', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', border: '1px solid #334155' },
  outcomeBtn: { padding: '3px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', border: '1px solid' },
  editBtn: { background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' },
  deleteBtn: { background: '#ef444410', color: '#ef4444', border: '1px solid #ef444430', padding: '3px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem' },
  editPanel: { marginTop: '10px', padding: '10px', background: '#0a1628', borderRadius: '6px', border: '1px solid #1e2d4a' },
  textarea: { width: '100%', minHeight: '70px', background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155', borderRadius: '6px', padding: '8px', fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' },
};
