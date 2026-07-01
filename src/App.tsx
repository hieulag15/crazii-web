import { useState, useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData, SeriesMarker, Time } from 'lightweight-charts';
import { calculateAll, calculatePivot, getGTHStatus, calculateEMA200, calculateADR } from './utils/craziiEngine';
import { fetchCandles, fetchDailyCandles, connectWebSocket, SYMBOLS, TIMEFRAMES } from './utils/dataService';
import type { LiveCandle } from './utils/dataService';
import { notifyEnhancedSignals, seedEnhancedSent } from './utils/telegramNotifier';
import type { CraziiSettings, SystemStatus, SignalDisplay } from './types';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import AcademyPage from './pages/AcademyPage';
import './App.css';

// GMT+7 offset in seconds (Việt Nam timezone)
const GMT7_OFFSET = 7 * 3600;

/** Shift UTC timestamp to GMT+7 for chart display */
function toGMT7(utcTimestamp: number): Time {
  return (utcTimestamp + GMT7_OFFSET) as unknown as Time;
}

export default function App() {
  const { user, isLoggedIn, loading: authLoading, logout, updateSettings: saveSettings } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [showAcademy, setShowAcademy] = useState(false);

  // Auth guard
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060d1a', color: '#ffd700' }}>
        ⏳ Đang tải...
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage />;
  }

  if (showSettings) {
    return <SettingsPage onBack={() => setShowSettings(false)} />;
  }

  if (showAcademy) {
    return <AcademyPage onBack={() => setShowAcademy(false)} />;
  }

  return <ChartApp user={user} onOpenSettings={() => setShowSettings(true)} onOpenAcademy={() => setShowAcademy(true)} onLogout={logout} saveSettings={saveSettings} />;
}

// ===== Main Chart App (extracted to separate component) =====

function ChartApp({ user, onOpenSettings, onOpenAcademy, onLogout, saveSettings }: {
  user: import('./utils/apiClient').AuthUser | null;
  onOpenSettings: () => void;
  onOpenAcademy: () => void;
  onLogout: () => void;
  saveSettings: (s: Record<string, unknown>) => Promise<void>;
}) {
  const [symbol, setSymbol] = useState(user?.settings?.symbol || 'BTCUSDT');
  const [timeframe, setTimeframe] = useState(user?.settings?.timeframe || '5m');
  const [settings, setSettings] = useState<CraziiSettings>(() => {
    const s = user?.settings;
    return {
      showOP: s?.showOP ?? true,
      showMLP: s?.showMLP ?? true,
      showKTR: s?.showKTR ?? true,
      showPivot: s?.showPivot ?? true,
      showDiamond: s?.showDiamond ?? true,
      showCandles: true,
      opHour: 5,
      ktrMultiplier: 1.0,
      haSmooth: 6,
      showEMA200: s?.showEMA200 ?? true,
      showFVG: s?.showFVG ?? false,
      showOB: s?.showOB ?? false,
      minConfidence: s?.minConfidence ?? 55,
    };
  });
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [signals, setSignals] = useState<SignalDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [popupSignal, setPopupSignal] = useState<SignalDisplay | null>(null);
  const [tgEnabled, setTgEnabled] = useState(false);
  const [tgCount, setTgCount] = useState(0);

  // Auto-save settings to DB khi thay đổi (debounced 2 giây)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  useEffect(() => {
    // Skip lần render đầu tiên (load từ DB, không cần save lại)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSettings({ symbol, timeframe, minConfidence: settings.minConfidence, showOP: settings.showOP, showMLP: settings.showMLP, showKTR: settings.showKTR, showPivot: settings.showPivot, showDiamond: settings.showDiamond, showEMA200: settings.showEMA200, showFVG: settings.showFVG, showOB: settings.showOB }).catch(() => {});
    }, 2000);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [symbol, timeframe, settings]);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const ksiContainerRef = useRef<HTMLDivElement>(null);
  const kcxContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const ksiChartRef = useRef<IChartApi | null>(null);
  const kcxChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  // Hệ số zoom trục giá (Ctrl + lăn chuột). 1 = vừa khít nến.
  // >1 = thu nhỏ nến (thấy KTR xa hơn), <1 = phóng to nến.
  const priceZoomRef = useRef(1);

  // Refs phục vụ phát hiện tín hiệu mới khi nến đóng (Telegram)
  const candlesRef = useRef<import('./types').Candle[]>([]);
  const dailyRef = useRef<import('./types').Candle[]>([]);
  const tgEnabledRef = useRef(false);

  // Đồng bộ ref với state để dùng trong WebSocket callback
  useEffect(() => { tgEnabledRef.current = tgEnabled; }, [tgEnabled]);

  useEffect(() => {
    let disposed = false;

    function cleanup() {
      disposed = true;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
      if (ksiChartRef.current) {
        ksiChartRef.current.remove();
        ksiChartRef.current = null;
      }
      if (kcxChartRef.current) {
        kcxChartRef.current.remove();
        kcxChartRef.current = null;
      }
      candleSeriesRef.current = null;
    }

    async function loadChart() {
      if (!chartContainerRef.current) return;
      setLoading(true);

      // Cleanup previous instances
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
      if (ksiChartRef.current) { ksiChartRef.current.remove(); ksiChartRef.current = null; }
      if (kcxChartRef.current) { kcxChartRef.current.remove(); kcxChartRef.current = null; }
      candleSeriesRef.current = null;

      // Fetch data
      const [candles, dailyCandles] = await Promise.all([
        fetchCandles(symbol, timeframe, 500),
        fetchDailyCandles(symbol, 20),
      ]);

      // Check if disposed while fetching
      if (disposed || !chartContainerRef.current) return;

      if (candles.length === 0) { setLoading(false); return; }

      // Calculate CRAZII
      const pivot = calculatePivot(dailyCandles);
      const dailyRange = calculateADR(dailyCandles);
      const crazii = calculateAll(candles, { ...settings, dailyRange, pivot, minConfidence: 0 });

      // Lưu data cho việc phát hiện tín hiệu mới khi nến đóng
      candlesRef.current = candles;
      dailyRef.current = dailyCandles;

      // Seed tất cả tín hiệu lịch sử là "đã gửi" để không spam khi mở app
      seedEnhancedSent(symbol, timeframe, crazii.enhancedSignals);

      // Update status
      const last = candles[candles.length - 1];
      const lastOp = crazii.ops[crazii.ops.length - 1];
      const lastMlp = crazii.mlps[crazii.mlps.length - 1];
      const lastKsi = crazii.ksi[crazii.ksi.length - 1];
      const lastKcx = crazii.kcx[crazii.kcx.length - 1];
      const lastHa = crazii.haCandles[crazii.haCandles.length - 1];

      setStatus({
        price: last.close,
        op: lastOp?.op ?? null,
        mlp: lastMlp?.mlp ?? null,
        opRule: last.close > (lastOp?.op ?? 0) ? 'BUY' : 'SELL',
        mlpRule: (lastOp?.op ?? 0) > (lastMlp?.mlp ?? 0) ? 'BUY' : 'SELL',
        candle: lastHa?.isBull ? 'VÀNG ▲' : 'ĐỎ ▼',
        candleBull: lastHa?.isBull ?? false,
        ksi: lastKsi?.isBullish ? 'Cá mập MUA 🟢' : 'Cá mập BÁN 🔴',
        ksiBull: lastKsi?.isBullish ?? false,
        kcx: lastKcx?.state === 'exhaustion' ? '💚 Xtreme' :
             lastKcx?.state === 'retailSell' ? '🔵 Nhỏ lẻ bán' : '⚫ Nhỏ lẻ mua',
        kcxState: lastKcx?.state ?? 'neutral',
        gth: getGTHStatus(last.time) === 'good' ? '✓ TỐT' : '✗ CẨN THẬN',
        gthGood: getGTHStatus(last.time) === 'good',
      });
      setLivePrice(last.close);

      // Signals nâng cao (A+B+C+D): confidence, TP/SL, R:R, hợp lưu FVG/OB
      const allSignals: SignalDisplay[] = crazii.enhancedSignals.map((e) => {
        const arrow = e.side === 'buy' ? '▲' : '▼';
        const fullReason =
          `${e.label}\n` +
          `💰 Entry: ${e.entry.toFixed(2)}\n` +
          `🛑 SL: ${e.sl.toFixed(2)}\n` +
          `🎯 TP1: ${e.tp1.toFixed(2)} | TP2: ${e.tp2.toFixed(2)} | TP3: ${e.tp3.toFixed(2)}\n` +
          `📊 Confidence: ${e.confidence}% | R:R = 1:${e.rr.toFixed(1)}\n` +
          `━━━━━━━━━━━━\n` +
          e.confluences.map((c) => `${c.passed ? '✅' : '❌'} ${c.name}: ${c.detail}`).join('\n');
        return {
          time: e.time,
          type: `${arrow} ${e.label} · ${e.confidence}%`,
          color: e.side === 'buy' ? '#00ff88' : '#ff4444',
          reason: fullReason,
          enhanced: e,
        };
      });
      setSignals(allSignals.sort((a, b) => b.time - a.time));

      // Double check not disposed after state updates
      if (disposed || !chartContainerRef.current) return;

      // === MAIN CHART ===
      const chartHeight = chartContainerRef.current.clientHeight || 500;
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: chartHeight,
        layout: { background: { type: ColorType.Solid, color: '#0a1628' }, textColor: '#d1d4dc' },
        grid: { vertLines: { color: '#1e2d4a' }, horzLines: { color: '#1e2d4a' } },
        crosshair: { mode: 0 },
        rightPriceScale: { borderColor: '#2a3f5f', scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: {
          borderColor: '#2a3f5f',
          timeVisible: true,
          secondsVisible: false,
          barSpacing: 10,
          minBarSpacing: 2,
          rightOffset: 8,
        },
        handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
      });
      chartRef.current = chart;

      // Nến CRAZII (vàng/đỏ)
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#ffd700', downColor: '#ff4444',
        borderUpColor: '#ffd700', borderDownColor: '#ff4444',
        wickUpColor: '#ffd700', wickDownColor: '#ff4444',
        // Trục giá fit theo nến, có thể nới rộng bằng Ctrl + lăn chuột
        autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } | null } | null) => {
          const res = original();
          if (!res || !res.priceRange) return res;
          const zoom = priceZoomRef.current;
          if (zoom === 1) return res;
          const { minValue, maxValue } = res.priceRange;
          const mid = (minValue + maxValue) / 2;
          const half = ((maxValue - minValue) / 2) * zoom;
          return {
            ...res,
            priceRange: { minValue: mid - half, maxValue: mid + half },
          };
        },
      });
      const haData: CandlestickData[] = crazii.haCandles.map((c) => ({
        time: toGMT7(c.time), open: c.open, high: c.high, low: c.low, close: c.close,
      }));
      candleSeries.setData(haData);
      candleSeriesRef.current = candleSeries;

      // OP Line
      if (settings.showOP) {
        const opData: LineData[] = crazii.ops
          .filter((o) => o.op !== null)
          .map((o) => ({ time: toGMT7(o.time), value: o.op as number }));
        if (opData.length > 0) {
          chart.addLineSeries({ color: '#ff8c00', lineWidth: 2, title: 'OP' }).setData(opData);
        }
      }

      // MLP Line
      if (settings.showMLP) {
        const mlpData: LineData[] = crazii.mlps
          .filter((m) => m.mlp !== null)
          .map((m) => ({ time: toGMT7(m.time), value: m.mlp as number }));
        if (mlpData.length > 0) {
          chart.addLineSeries({ color: '#9b59b6', lineWidth: 2, lineStyle: 2, title: 'MLP' }).setData(mlpData);
        }
      }

      // KTR Levels
      if (settings.showKTR) {
        const ktrData = crazii.ktrs.filter((k) => k.levels !== null);
        if (ktrData.length > 0) {
          const ktrConfig: { key: keyof NonNullable<typeof ktrData[0]['levels']>; color: string; label: string }[] = [
            { key: 'plus1', color: '#ffd700', label: 'KTR+1' },
            { key: 'plus2', color: '#ffd700', label: 'KTR+2' },
            { key: 'plus3', color: '#ffd700', label: 'KTR+3' },
            { key: 'minus1', color: '#ffd700', label: 'KTR-1' },
            { key: 'minus2', color: '#ffd700', label: 'KTR-2' },
            { key: 'minus3', color: '#ffd700', label: 'KTR-3' },
          ];
          ktrConfig.forEach(({ key, color, label }) => {
            chart.addLineSeries({
              color, lineWidth: 1, lineStyle: 2, title: label,
              autoscaleInfoProvider: () => null, // không kéo giãn trục giá
            })
              .setData(ktrData.map((k) => ({ time: toGMT7(k.time), value: k.levels![key] })));
          });
        }
      }

      // Pivot
      if (settings.showPivot && pivot) {
        [
          { val: pivot.pp, col: '#ff00ff', t: 'Pivot' },
          { val: pivot.r1, col: '#00ff88', t: 'R1' },
          { val: pivot.s1, col: '#ff6666', t: 'S1' },
        ].forEach(({ val, col, t }) => {
          chart.addLineSeries({
            color: col, lineWidth: 1, lineStyle: 2, title: t,
            autoscaleInfoProvider: () => null, // không kéo giãn trục giá
          })
            .setData(candles.slice(-100).map((c) => ({ time: toGMT7(c.time), value: val })));
        });
      }

      // EMA200
      if (settings.showEMA200) {
        const ema200Data = calculateEMA200(candles);
        chart.addLineSeries({
          color: '#f59e0b',
          lineWidth: 2,
          lineStyle: 0,
          title: 'EMA200',
          lastValueVisible: true,
          priceLineVisible: false,
        }).setData(ema200Data.map((e) => ({ time: toGMT7(e.time), value: e.value })));
      }

      // FVG - Fair Value Gap (chỉ vẽ gap chưa lấp, gần đây)
      if (settings.showFVG) {
        const recentFvgs = crazii.fvgs.filter((f) => !f.filled).slice(-12);
        recentFvgs.forEach((f) => {
          const col = f.type === 'bullish' ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)';
          [f.top, f.bottom].forEach((val) => {
            chart.addLineSeries({
              color: col, lineWidth: 1, lineStyle: 3,
              lastValueVisible: false, priceLineVisible: false,
              autoscaleInfoProvider: () => null,
            }).setData(candles.slice(-100).map((c) => ({ time: toGMT7(c.time), value: val })));
          });
        });
      }

      // Order Block (chỉ vẽ OB chưa mitigated, gần đây)
      if (settings.showOB) {
        const recentObs = crazii.orderBlocks.filter((o) => !o.mitigated).slice(-8);
        recentObs.forEach((o) => {
          const col = o.type === 'bullish' ? 'rgba(0,229,255,0.5)' : 'rgba(255,107,0,0.5)';
          [o.top, o.bottom].forEach((val) => {
            chart.addLineSeries({
              color: col, lineWidth: 1, lineStyle: 0,
              lastValueVisible: false, priceLineVisible: false,
              autoscaleInfoProvider: () => null,
            }).setData(candles.slice(-100).map((c) => ({ time: toGMT7(c.time), value: val })));
          });
        });
      }

      // Markers
      const markers: SeriesMarker<Time>[] = [];
      // Kim cương (điểm tham khảo, không phải lệnh)
      if (settings.showDiamond) {
        crazii.diamonds.forEach((d) => {
          markers.push({
            time: toGMT7(d.time),
            position: d.type === 'blue' ? 'belowBar' : 'aboveBar',
            color: d.type === 'blue' ? '#00ffff' : '#ff8800',
            shape: 'circle',
            text: d.type === 'blue' ? '💎' : '◇',
          });
        });
      }
      // Tín hiệu giao dịch ĐÃ LỌC (enhanced) - kèm % confidence
      crazii.enhancedSignals.forEach((e) => {
        markers.push({
          time: toGMT7(e.time),
          position: e.side === 'buy' ? 'belowBar' : 'aboveBar',
          color: e.side === 'buy' ? '#00ff88' : '#ff4444',
          shape: e.side === 'buy' ? 'arrowUp' : 'arrowDown',
          text: `${e.side === 'buy' ? 'BUY' : 'SELL'} ${e.confidence}%`,
        });
      });
      if (markers.length > 0) {
        markers.sort((a, b) => (a.time as number) - (b.time as number));
        candleSeries.setMarkers(markers);
      }

      // Hiển thị ~80 nến gần nhất (zoom vừa đủ để thấy rõ nến)
      // thay vì fit toàn bộ 500 nến khiến nến bị bóp nhỏ
      if (haData.length > 0) {
        const visibleBars = 80;
        const total = haData.length;
        const from = Math.max(0, total - visibleBars);
        chart.timeScale().setVisibleLogicalRange({ from, to: total + 6 });
      }

      // === KSI CHART ===
      if (ksiContainerRef.current && !disposed) {
        const ksiChart = createChart(ksiContainerRef.current, {
          width: ksiContainerRef.current.clientWidth,
          height: 140,
          layout: { background: { type: ColorType.Solid, color: '#0d1b2a' }, textColor: '#d1d4dc' },
          grid: { vertLines: { color: '#1e2d4a' }, horzLines: { color: '#1e2d4a' } },
          rightPriceScale: { borderColor: '#2a3f5f' },
          timeScale: { borderColor: '#2a3f5f', timeVisible: true },
        });
        ksiChartRef.current = ksiChart;

        const ksiSeries = ksiChart.addHistogramSeries({ title: 'KSI - Cá Mập' });
        const ksiHist: HistogramData[] = crazii.ksi.map((item) => ({
          time: toGMT7(item.time),
          value: item.value,
          color: item.isBullish ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)',
        }));
        ksiSeries.setData(ksiHist);

        // Sync timescales
        chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (range && ksiChartRef.current && !disposed) {
            ksiChart.timeScale().setVisibleLogicalRange(range);
          }
        });
        ksiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (range && chartRef.current && !disposed) {
            chart.timeScale().setVisibleLogicalRange(range);
          }
        });
      }

      // === KCX CHART (BULLISHNESS) ===
      if (kcxContainerRef.current && !disposed) {
        const kcxChart = createChart(kcxContainerRef.current, {
          width: kcxContainerRef.current.clientWidth,
          height: 100,
          layout: { background: { type: ColorType.Solid, color: '#0d1b2a' }, textColor: '#d1d4dc' },
          grid: { vertLines: { color: '#1e2d4a' }, horzLines: { color: '#1e2d4a' } },
          rightPriceScale: { borderColor: '#2a3f5f' },
          timeScale: { borderColor: '#2a3f5f', timeVisible: true, visible: false },
        });
        kcxChartRef.current = kcxChart;

        const kcxSeries = kcxChart.addHistogramSeries({ title: 'BULLISHNESS' });
        kcxSeries.setData(crazii.kcx.map((item) => ({
          time: toGMT7(item.time),
          value: item.value * 100,
          color: item.state === 'exhaustion' ? '#22c55e' :
                 item.state === 'retailSell' ? '#2563eb' : '#1a1a1a',
        })));

        // Sync timescales
        chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (range && kcxChartRef.current && !disposed) {
            kcxChart.timeScale().setVisibleLogicalRange(range);
          }
        });
      }

      // WebSocket - only update if not disposed
      wsRef.current = connectWebSocket(symbol, timeframe, (candle: LiveCandle) => {
        if (disposed || !candleSeriesRef.current) return;
        try {
          candleSeriesRef.current.update({
            time: toGMT7(candle.time),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
          });
          setLivePrice(candle.close);

          // Cập nhật mảng nến: update nến cuối hoặc thêm nến mới
          const arr = candlesRef.current;
          if (arr.length > 0) {
            const lastC = arr[arr.length - 1];
            const newCandle = {
              time: candle.time, open: candle.open, high: candle.high,
              low: candle.low, close: candle.close, volume: candle.volume,
            };
            if (candle.time === lastC.time) {
              arr[arr.length - 1] = newCandle; // update nến đang chạy
            } else if (candle.time > lastC.time) {
              arr.push(newCandle); // nến mới
              if (arr.length > 600) arr.shift(); // giữ độ dài hợp lý
            }
          }

          // Khi nến ĐÓNG -> recompute tín hiệu & gửi Telegram nếu bật
          if (candle.isClosed && tgEnabledRef.current) {
            const pivotNow = calculatePivot(dailyRef.current);
            const adrNow = calculateADR(dailyRef.current);
            const craziiNow = calculateAll(candlesRef.current, {
              ...settings, dailyRange: adrNow, pivot: pivotNow,
            });
            notifyEnhancedSignals(symbol, timeframe, craziiNow.enhancedSignals).then((n) => {
              if (n > 0) setTgCount((c) => c + n);
            });
          }
        } catch {
          // Chart may have been disposed
        }
      });

      setLoading(false);

      // Resize handler
      const handleResize = () => {
        if (disposed) return;
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight || 500,
          });
        }
        if (ksiContainerRef.current && ksiChartRef.current) {
          ksiChartRef.current.applyOptions({ width: ksiContainerRef.current.clientWidth });
        }
      };
      window.addEventListener('resize', handleResize);

      // Ctrl + lăn chuột = zoom trục GIÁ (chiều dọc) ngay tại chỗ.
      // Lăn chuột thường vẫn zoom thời gian (chiều ngang) như mặc định.
      const chartEl = chartContainerRef.current;
      const handleWheel = (e: WheelEvent) => {
        if (!e.ctrlKey) return; // chỉ xử lý khi giữ Ctrl
        e.preventDefault();
        // Lăn lên (deltaY < 0) -> phóng to nến (zoom nhỏ lại)
        // Lăn xuống (deltaY > 0) -> thu nhỏ nến (thấy KTR xa hơn)
        const factor = e.deltaY > 0 ? 1.1 : 0.9;
        const next = priceZoomRef.current * factor;
        // Giới hạn: 0.3 (phóng rất to) đến 8 (thu nhỏ thấy toàn bộ KTR)
        priceZoomRef.current = Math.min(8, Math.max(0.3, next));
        // Ép chart tính lại autoscale
        candleSeriesRef.current?.applyOptions({});
      };
      chartEl.addEventListener('wheel', handleWheel, { passive: false });

      // Store cleanup for resize + wheel
      return () => {
        window.removeEventListener('resize', handleResize);
        chartEl.removeEventListener('wheel', handleWheel);
      };
    }

    loadChart();
    return cleanup;
  }, [symbol, timeframe, settings]);

  return (
    <div className="app">
      {/* Toolbar */}
      <header className="toolbar">
        <div className="toolbar-left">
          <div className="brand">
            <span className="brand-icon">◆</span>
            <span className="brand-name">CRAZII</span>
            {livePrice && <span className="live-price">{livePrice.toFixed(2)}</span>}
          </div>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="select-ctrl">
            {SYMBOLS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="tf-group">
            {TIMEFRAMES.map((tf) => (
              <button key={tf.value} className={`tf-btn ${timeframe === tf.value ? 'active' : ''}`}
                onClick={() => setTimeframe(tf.value)}>{tf.label}</button>
            ))}
          </div>
        </div>
        <div className="toolbar-right">
          <Toggle label="OP" active={settings.showOP} color="#ff8c00" onClick={() => setSettings((s) => ({ ...s, showOP: !s.showOP }))} />
          <Toggle label="MLP" active={settings.showMLP} color="#9b59b6" onClick={() => setSettings((s) => ({ ...s, showMLP: !s.showMLP }))} />
          <Toggle label="KTR" active={settings.showKTR} color="#22c55e" onClick={() => setSettings((s) => ({ ...s, showKTR: !s.showKTR }))} />
          <Toggle label="Pivot" active={settings.showPivot} color="#ff00ff" onClick={() => setSettings((s) => ({ ...s, showPivot: !s.showPivot }))} />
          <Toggle label="💎" active={settings.showDiamond} color="#00ffff" onClick={() => setSettings((s) => ({ ...s, showDiamond: !s.showDiamond }))} />
          <Toggle label="EMA200" active={settings.showEMA200} color="#f59e0b" onClick={() => setSettings((s) => ({ ...s, showEMA200: !s.showEMA200 }))} />
          <Toggle label="FVG" active={!!settings.showFVG} color="#22c55e" onClick={() => setSettings((s) => ({ ...s, showFVG: !s.showFVG }))} />
          <Toggle label="OB" active={!!settings.showOB} color="#00e5ff" onClick={() => setSettings((s) => ({ ...s, showOB: !s.showOB }))} />
          <Toggle label={`📱 TG${tgCount > 0 ? ` (${tgCount})` : ''}`} active={tgEnabled} color="#229ed9" onClick={() => setTgEnabled((v) => !v)} />
          
          <button className="nav-btn academy-btn" onClick={onOpenAcademy} style={{ marginLeft: '12px' }}>📖 Học viện</button>
          <button className="nav-btn" onClick={onOpenSettings} style={{ marginLeft: '6px' }}>⚙️ Cài đặt</button>
          <button className="nav-btn logout-btn" onClick={onLogout} style={{ marginLeft: '6px' }}>Đăng xuất</button>
        </div>
      </header>

      {/* Main */}
      <main className="main-content">
        <div className="chart-area">
          {loading && <div className="loading">⏳ Đang tải dữ liệu CRAZII...</div>}
          <div ref={chartContainerRef} className="chart-main" />
          <div className="ksi-header">
            <span>BOYS BUYING / SELLING</span>
            <span className="legend"><span style={{ color: '#22c55e' }}>■</span> Buying <span style={{ color: '#ef4444' }}>■</span> Selling</span>
          </div>
          <div ref={ksiContainerRef} className="chart-ksi" />
          <div className="ksi-header">
            <span>BULLISHNESS (KCX)</span>
            <span className="legend"><span style={{ color: '#2563eb' }}>■</span> Retail Sell <span style={{ color: '#22c55e' }}>■</span> Xtreme <span style={{ color: '#1a1a1a' }}>■</span> Retail Buy</span>
          </div>
          <div ref={kcxContainerRef} className="chart-kcx" />
        </div>

        {/* Sidebar */}
        <aside className="sidebar">
          {status && (
            <div className="panel">
              <h3>📊 CRAZII STATUS</h3>
              <div className="status-list">
                <StatusRow label="OP Rule" value={status.opRule} bull={status.opRule === 'BUY'} />
                <StatusRow label="MLP Rule" value={status.mlpRule} bull={status.mlpRule === 'BUY'} />
                <StatusRow label="Nến" value={status.candle} bull={status.candleBull} />
                <StatusRow label="KSI" value={status.ksi} bull={status.ksiBull} />
                <StatusRow label="KCX" value={status.kcx} bull={status.kcxState === 'exhaustion'} />
                <StatusRow label="GTH" value={status.gth} bull={status.gthGood} />
              </div>
              {status.op && (
                <div className="price-box">
                  <div>OP: <strong>{status.op.toFixed(2)}</strong></div>
                  {status.mlp && <div>MLP: <strong>{status.mlp.toFixed(2)}</strong></div>}
                </div>
              )}
            </div>
          )}

          {/* Panel tín hiệu - LUÔN HIỆN để user điều chỉnh confidence */}
          <div className="panel">
            <h3>🔔 Tín Hiệu (đã lọc)</h3>
            <div className="conf-filter">
              <span>Lọc confidence ≥ {settings.minConfidence ?? 55}%</span>
              <input
                type="range" min={0} max={95} step={5}
                value={settings.minConfidence ?? 55}
                onChange={(ev) => setSettings((s) => ({ ...s, minConfidence: Number(ev.target.value) }))}
              />
            </div>
            {(() => {
              const filtered = signals.filter((s) => (s.enhanced?.confidence ?? 0) >= (settings.minConfidence ?? 55));
              return filtered.length > 0 ? (
                filtered.slice(0, 15).map((s, i) => (
                  <div key={i} className="signal-row clickable" style={{ borderLeftColor: s.color }}
                    onClick={() => setPopupSignal(s)}>
                    <div className="sig-main">
                      <span className="sig-type">{s.type}</span>
                      {s.enhanced && (
                        <span className="sig-conf" style={{
                          color: s.enhanced.confidence >= 70 ? '#22c55e' : s.enhanced.confidence >= 60 ? '#f59e0b' : '#ef4444',
                        }}>
                          {s.enhanced.confidence}% · 1:{s.enhanced.rr.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <span className="sig-time">{formatTimeGMT7(s.time)}</span>
                  </div>
                ))
              ) : (
                <div className="no-signals">
                  Chưa có tín hiệu đạt ngưỡng {settings.minConfidence ?? 55}%.
                  <br /><span style={{ fontSize: '10px', color: '#666' }}>Thử giảm confidence hoặc đợi tín hiệu mới. ({signals.length} tín hiệu tổng)</span>
                </div>
              );
            })()}
          </div>

          {/* Popup */}
          {popupSignal && (
            <SignalPopup signal={popupSignal} onClose={() => setPopupSignal(null)} />
          )}

          <div className="panel">
            <h3>📋 Luật CRAZII</h3>
            <ul className="rules">
              <li>Giá trên OP → <strong className="bull">BUY</strong></li>
              <li>Giá dưới OP → <strong className="bear">SELL</strong></li>
              <li>CCRY: Đỏ→Vàng (trên OP) = BUY</li>
              <li>CCYR: Vàng→Đỏ (dưới OP) = SELL</li>
              <li>KTR±1,2,3: TP chốt lời theo bậc</li>
              <li>GTH tốt: <strong>11:30 - 22:30</strong> (GMT+7)</li>
              <li>DJDD: Doji nén → phiên sau biến động mạnh</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );
}

// ===== Sub-components =====

function Toggle({ label, active, color, onClick }: { label: string; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      className={`toggle ${active ? 'on' : 'off'}`}
      style={{ borderColor: active ? color : '#333', color: active ? color : '#666' }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function StatusRow({ label, value, bull }: { label: string; value: string; bull: boolean }) {
  return (
    <div className="status-row">
      <span className="sr-label">{label}</span>
      <span className={`sr-value ${bull ? 'bull' : 'bear'}`}>{value}</span>
    </div>
  );
}

/** Format timestamp sang GMT+7 (Việt Nam) */
function formatTimeGMT7(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

/** Popup hiển thị lý do tín hiệu */
function SignalPopup({ signal, onClose }: { signal: SignalDisplay; onClose: () => void }) {
  const timeStr = new Date(signal.time * 1000).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const e = signal.enhanced;

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={(ev) => ev.stopPropagation()}>
        <div className="popup-header" style={{ borderLeftColor: signal.color }}>
          <span className="popup-title">{signal.type}</span>
          <button className="popup-close" onClick={onClose}>✕</button>
        </div>
        <div className="popup-time">🕐 {timeStr} (GMT+7)</div>

        {e && (
          <>
            {/* Confidence bar */}
            <div className="conf-wrap">
              <div className="conf-label">
                <span>Confidence</span>
                <strong style={{ color: e.confidence >= 70 ? '#22c55e' : e.confidence >= 60 ? '#f59e0b' : '#ef4444' }}>
                  {e.confidence}%
                </strong>
              </div>
              <div className="conf-bar">
                <div className="conf-fill" style={{
                  width: `${e.confidence}%`,
                  background: e.confidence >= 70 ? '#22c55e' : e.confidence >= 60 ? '#f59e0b' : '#ef4444',
                }} />
              </div>
              <div className="conf-rr">R:R = <strong>1:{e.rr.toFixed(1)}</strong></div>
            </div>

            {/* Trade plan */}
            <div className="trade-plan">
              <div className="tp-row entry"><span>Entry</span><b>{e.entry.toFixed(2)}</b></div>
              <div className="tp-row sl"><span>🛑 Stop Loss</span><b>{e.sl.toFixed(2)}</b></div>
              <div className="tp-row tp"><span>🎯 TP1</span><b>{e.tp1.toFixed(2)}</b></div>
              <div className="tp-row tp"><span>🎯 TP2</span><b>{e.tp2.toFixed(2)}</b></div>
              <div className="tp-row tp"><span>🎯 TP3</span><b>{e.tp3.toFixed(2)}</b></div>
              {e.riskLevel && e.riskPercent !== undefined && (
                <div className="tp-row risk" style={{ borderTop: '1px dashed #1e2d4a', paddingTop: '6px', marginTop: '4px' }}>
                  <span>🛡️ Mức rủi ro</span>
                  <b style={{ color: e.riskLevel === 'Low' ? '#22c55e' : e.riskLevel === 'Medium' ? '#f59e0b' : '#ef4444' }}>
                    {e.riskLevel === 'Low' ? 'THẤP (An toàn)' : e.riskLevel === 'Medium' ? 'VỪA (Trung bình)' : 'CAO (Cẩn thận)'} ({e.riskPercent.toFixed(2)}%)
                  </b>
                </div>
              )}
            </div>

            {/* Confluence checklist */}
            <div className="confluence-list">
              <div className="cf-title">Hợp lưu ({e.confluences.filter((c) => c.passed).length}/{e.confluences.length})</div>
              {e.confluences.map((c, i) => (
                <div key={i} className={`cf-row ${c.passed ? 'pass' : 'fail'}`}>
                  <span className="cf-icon">{c.passed ? '✅' : '❌'}</span>
                  <span className="cf-name">{c.name}</span>
                  <span className="cf-detail">{c.detail}</span>
                </div>
              ))}
            </div>

            {/* S/R Details */}
            {signal.reason && signal.reason.includes('🏛️ S/R gần nhất:') && (
              <div style={{ padding: '0 18px 12px 18px', borderTop: '1px solid #1e2d4a', paddingTop: '10px', fontSize: '11px', color: '#8892b0' }}>
                {signal.reason.split('\n').filter(line => line.includes('🏛️ S/R gần nhất:')).map((line, i) => (
                  <div key={i} style={{ color: '#00f0ff', fontWeight: 600 }}>{line}</div>
                ))}
              </div>
            )}
          </>
        )}

        {!e && (
          <div className="popup-reason">
            {signal.reason
              ? signal.reason.split('\n').map((line, i) => (
                  <p key={i} className={line.startsWith('→') ? 'reason-conclusion' : ''}>{line}</p>
                ))
              : <p>Không có thông tin chi tiết cho tín hiệu này.</p>}
          </div>
        )}

        <div className="popup-disclaimer">⚠️ Tín hiệu tự động - không phải lời khuyên đầu tư</div>
      </div>
    </div>
  );
}
