/**
 * API: Auto-scan H4 - Chạy bởi cron-job.org mỗi 4h
 * Scan tất cả coin bằng CÙNG engine với client (keyLevelEngine)
 * Phát hiện signal → lưu vào MongoDB
 * Đồng thời check TP/SL cho pending signals
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';

// Import engine chính (cùng logic với frontend)
import {
  calculateKeyLevelSystem,
  type KeyLevelSignal,
} from '../src/utils/keyLevelEngine.js';
import type { Candle } from '../src/types/index.js';

const BINANCE_API = 'https://fapi.binance.com/fapi/v1';

const DEFAULT_COIN_LIST = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT','ADAUSDT','DOGEUSDT',
  'AVAXUSDT','DOTUSDT','LINKUSDT','MATICUSDT','NEARUSDT','LTCUSDT','UNIUSDT',
  'ATOMUSDT','APTUSDT','FILUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
  'SEIUSDT','TIAUSDT','JUPUSDT','WLDUSDT','FETUSDT','RENDERUSDT','RUNEUSDT',
  'PENDLEUSDT','WIFUSDT','AAVEUSDT','MKRUSDT','LDOUSDT','CRVUSDT','ENSUSDT',
  'SSVUSDT','RPLUSDT','COMPUSDT',
];

async function getWatchlist(db: any): Promise<string[]> {
  try {
    // Priority 1: User manual watchlist
    const userDoc = await db.collection('settings').findOne({ _id: 'watchlist' as any });
    if (userDoc?.coins && userDoc.coins.length > 0) {
      // Priority 2: Merge with narrative watchlist (token tiềm năng từ narrative scan)
      const narrativeDoc = await db.collection('settings').findOne({ _id: 'narrative_watchlist' as any });
      if (narrativeDoc?.coins && narrativeDoc.coins.length > 0) {
        const merged = [...new Set([...userDoc.coins, ...narrativeDoc.coins])];
        console.log(`[Auto-Scan] Watchlist: ${userDoc.coins.length} user + ${narrativeDoc.coins.length} narrative → ${merged.length} total`);
        return merged;
      }
      return userDoc.coins;
    }
    // Priority 3: Only narrative watchlist (no manual watchlist set)
    const narrativeDoc = await db.collection('settings').findOne({ _id: 'narrative_watchlist' as any });
    if (narrativeDoc?.coins && narrativeDoc.coins.length > 0) {
      console.log(`[Auto-Scan] Using narrative watchlist: ${narrativeDoc.coins.length} coins`);
      return [...new Set([...DEFAULT_COIN_LIST, ...narrativeDoc.coins])];
    }
  } catch { /* fallback */ }
  return DEFAULT_COIN_LIST;
}

async function fetchCandles(symbol: string): Promise<Candle[]> {
  const url = `${BINANCE_API}/klines?symbol=${symbol}&interval=4h&limit=500`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((k: any[]) => ({
    time: Math.floor(k[0] / 1000),
    open: parseFloat(k[1]), high: parseFloat(k[2]),
    low: parseFloat(k[3]), close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

/** Lấy BTC.D và USDT.D từ CoinGecko global market data */
interface MacroData {
  btcDominance: number;   // % BTC.D hiện tại
  usdtDominance: number;  // % USDT.D hiện tại
  totalMarketCap: number; // USD
  marketCapChange24h: number; // % thay đổi 24h của tổng thị trường
}

async function fetchMacroData(): Promise<MacroData | null> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/global', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const data = json.data;
    const btcDom = data?.market_cap_percentage?.btc ?? 0;
    const usdtDom = data?.market_cap_percentage?.usdt ?? 0;
    const totalMcap = data?.total_market_cap?.usd ?? 0;
    const mcapChange = data?.market_cap_change_percentage_24h_usd ?? 0;
    return { btcDominance: btcDom, usdtDominance: usdtDom, totalMarketCap: totalMcap, marketCapChange24h: mcapChange };
  } catch { return null; }
}

/**
 * Đánh giá macro environment — trả về điểm môi trường tốt/xấu cho BUY/SELL altcoin.
 * Dựa trên BTC.D + USDT.D + marketCap trend.
 * score > 0 = thuận lợi cho BUY alt, < 0 = thuận lợi cho SELL alt
 */
function evaluateMacroEnvironment(macro: MacroData | null): {
  favorsBuyAlt: boolean;
  favorsSellAlt: boolean;
  btcDomRising: boolean | null;
  usdtDomRising: boolean | null;
  description: string;
} {
  if (!macro) return { favorsBuyAlt: true, favorsSellAlt: true, btcDomRising: null, usdtDomRising: null, description: 'Macro unavailable' };

  // BTC.D > 60% = BTC season (yếu tố bất lợi cho alt buy)
  // BTC.D < 50% = Altseason (tốt cho alt buy)
  const btcDomHigh = macro.btcDominance > 60;
  const btcDomLow = macro.btcDominance < 50;

  // USDT.D > 6% = tiền "sợ hãi" (bất lợi cho mọi long)
  // USDT.D < 4% = tiền đang vào thị trường (tốt cho long)
  const usdtDomHigh = macro.usdtDominance > 6;
  const usdtDomLow = macro.usdtDominance < 4;

  // Market cap giảm mạnh 24h = bearish environment
  const marketFalling = macro.marketCapChange24h < -3;
  const marketRising = macro.marketCapChange24h > 2;

  const favorsBuyAlt = !btcDomHigh && !usdtDomHigh && !marketFalling;
  const favorsSellAlt = (btcDomHigh || usdtDomHigh || marketFalling);

  const desc = [
    `BTC.D: ${macro.btcDominance.toFixed(1)}% (${btcDomHigh ? 'BTC season ⚠️' : btcDomLow ? 'Alt favorable ✅' : 'neutral'})`,
    `USDT.D: ${macro.usdtDominance.toFixed(1)}% (${usdtDomHigh ? 'fear ⚠️' : usdtDomLow ? 'greedy ✅' : 'neutral'})`,
    `MCap 24h: ${macro.marketCapChange24h.toFixed(1)}% (${marketFalling ? 'falling ⚠️' : marketRising ? 'rising ✅' : 'stable'})`,
  ].join(' | ');

  return { favorsBuyAlt, favorsSellAlt, btcDomRising: btcDomHigh, usdtDomRising: usdtDomHigh, description: desc };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const db = await getDB();
    const col = db.collection('kl_signals');
    const newSignals: string[] = [];
    const trackResults: string[] = [];

    // PHASE 1: Check TP/SL cho pending signals
    const pending = await col.find({ outcome: 'pending' }).toArray();
    const pendingSymbols = [...new Set(pending.map(s => s.symbol as string))];

    for (const sym of pendingSymbols) {
      try {
        const candles = await fetchCandles(sym);
        if (candles.length === 0) continue;
        const symSignals = pending.filter(s => s.symbol === sym);

        for (const sig of symSignals) {
          // Chỉ check nến SAU entry
          const entryTime = Math.floor((sig.createdAt as number) / 1000);
          const after = candles.filter(c => c.time > entryTime);
          if (after.length === 0) continue;

          let hit = false;
          for (const c of after) {
            if (sig.side === 'buy') {
              if (c.low <= sig.sl) {
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'sl', rAchieved: -1, closedAt: c.time * 1000, closePrice: sig.sl } });
                trackResults.push(`${sym}: SL`); hit = true; break;
              }
              if (c.high >= sig.tp) {
                const r = Math.abs(sig.tp - sig.entry) / Math.abs(sig.entry - sig.sl);
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'tp', rAchieved: r, closedAt: c.time * 1000, closePrice: sig.tp } });
                trackResults.push(`${sym}: TP (${r.toFixed(1)}R)`); hit = true; break;
              }
            } else {
              if (c.high >= sig.sl) {
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'sl', rAchieved: -1, closedAt: c.time * 1000, closePrice: sig.sl } });
                trackResults.push(`${sym}: SL`); hit = true; break;
              }
              if (c.low <= sig.tp) {
                const r = Math.abs(sig.entry - sig.tp) / Math.abs(sig.sl - sig.entry);
                await col.updateOne({ _id: sig._id }, { $set: { outcome: 'tp', rAchieved: r, closedAt: c.time * 1000, closePrice: sig.tp } });
                trackResults.push(`${sym}: TP (${r.toFixed(1)}R)`); hit = true; break;
              }
            }
          }

          // Update max favorable/adverse
          if (!hit && after.length > 0) {
            const updates: Record<string, number> = {};
            if (sig.side === 'buy') {
              const maxH = Math.max(...after.map(c => c.high));
              const minL = Math.min(...after.map(c => c.low));
              if (maxH > (sig.maxFavorable || sig.entry)) updates.maxFavorable = maxH;
              if (minL < (sig.maxAdverse || sig.entry)) updates.maxAdverse = minL;
            } else {
              const minL = Math.min(...after.map(c => c.low));
              const maxH = Math.max(...after.map(c => c.high));
              if (minL < (sig.maxFavorable || sig.entry)) updates.maxFavorable = minL;
              if (maxH > (sig.maxAdverse || sig.entry)) updates.maxAdverse = maxH;
            }
            if (Object.keys(updates).length > 0) await col.updateOne({ _id: sig._id }, { $set: updates });
          }
        }
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 50));
    }

    // PHASE 2: Scan signal mới bằng engine chính
    // Đọc watchlist từ MongoDB (nếu user đã setup)
    const COIN_LIST = await getWatchlist(db);
    let btcTrend = 'sideway';

    // Fetch macro data (BTC.D, USDT.D) từ CoinGecko song song với BTC candles
    const macroData = await fetchMacroData().catch(() => null);
    const macroEnv = evaluateMacroEnvironment(macroData);
    console.log('[Macro]', macroEnv.description);

    // BTC context nâng cao: check vị trí BTC so với key levels + momentum
    let btcNearResistance = false;
    let btcNearSupport = false;
    let btcMomentum: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    try {
      const btcCandles = await fetchCandles('BTCUSDT');
      if (btcCandles.length >= 50) {
        const btcResult = calculateKeyLevelSystem(btcCandles);
        btcTrend = btcResult.trend.direction;
        const btcPrice = btcCandles[btcCandles.length - 1].close;
        // Check BTC gần key level nào (trong 1.5%)
        for (const lv of btcResult.keyLevels) {
          const dist = Math.abs(btcPrice - lv.price) / btcPrice * 100;
          if (dist < 1.5) {
            if (lv.type === 'resistance') btcNearResistance = true;
            if (lv.type === 'support') btcNearSupport = true;
          }
        }
        // BTC momentum: so sánh 3 nến H4 gần nhất để biết BTC đang push hay retrace
        // Backtest cho thấy: BTC giảm liên tiếp → sell alt rất hiệu quả
        const last3 = btcCandles.slice(-4, -1); // 3 nến đóng gần nhất (trừ nến đang chạy)
        if (last3.length === 3) {
          const allDown = last3.every(c => c.close < c.open);
          const allUp = last3.every(c => c.close > c.open);
          if (allDown) btcMomentum = 'bearish';
          else if (allUp) btcMomentum = 'bullish';
        }
      }
    } catch { /* skip */ }

    // ETH context: check ETH gần support/resistance (ảnh hưởng ETH ecosystem)
    const ETH_ECOSYSTEM = ['AAVEUSDT','MKRUSDT','LDOUSDT','CRVUSDT','ENSUSDT','SSVUSDT','RPLUSDT','COMPUSDT','UNIUSDT','LINKUSDT'];
    let ethNearSupport = false;
    let ethNearResistance = false;
    let ethTrend = 'sideway';
    try {
      const ethCandles = await fetchCandles('ETHUSDT');
      if (ethCandles.length >= 50) {
        const ethResult = calculateKeyLevelSystem(ethCandles);
        ethTrend = ethResult.trend.direction;
        const ethPrice = ethCandles[ethCandles.length - 1].close;
        for (const lv of ethResult.keyLevels) {
          const dist = Math.abs(ethPrice - lv.price) / ethPrice * 100;
          if (dist < 1.5) {
            if (lv.type === 'support') ethNearSupport = true;
            if (lv.type === 'resistance') ethNearResistance = true;
          }
        }
      }
    } catch { /* skip */ }

    // V3: Limit signals per side per H4 cycle (backtest: 18/8 có 4 SL sell liên tiếp)
    // Khi market đảo chiều, engine tạo quá nhiều signal cùng chiều → tất cả SL cùng lúc
    // Giới hạn tối đa 2 signal mỗi chiều mỗi chu kỳ scan
    let buySignalsThisCycle = 0;
    let sellSignalsThisCycle = 0;
    const MAX_SIGNALS_PER_SIDE = 2;

    // Sort watchlist theo confidence tiềm năng: BTC/ETH scan trước để làm anchor
    const priorityCoins = ['BTCUSDT', 'ETHUSDT'];
    const sortedCoinList = [
      ...priorityCoins.filter(c => COIN_LIST.includes(c)),
      ...COIN_LIST.filter(c => !priorityCoins.includes(c)),
    ];

    for (const symbol of sortedCoinList) {
      try {
        const candles = await fetchCandles(symbol);
        if (candles.length < 50) continue;

        const result = calculateKeyLevelSystem(candles);
        if (result.signals.length === 0) continue;

        // Lấy signal đầu tiên (mới nhất, confidence cao nhất)
        const sig = result.signals[0];

        // V3: Skip nếu đã đủ signal cùng chiều trong chu kỳ này
        // Ưu tiên BTC/ETH + coin có confidence cao (đã sort ở trên)
        if (sig.side === 'buy' && buySignalsThisCycle >= MAX_SIGNALS_PER_SIDE) {
          console.log(`[Auto-Scan] Skip ${symbol} BUY — đã có ${buySignalsThisCycle} lệnh BUY trong chu kỳ`);
          continue;
        }
        if (sig.side === 'sell' && sellSignalsThisCycle >= MAX_SIGNALS_PER_SIDE) {
          console.log(`[Auto-Scan] Skip ${symbol} SELL — đã có ${sellSignalsThisCycle} lệnh SELL trong chu kỳ`);
          continue;
        }

        // Filter theo BTC context (smart + momentum):
        // Backtest insight: Khi BTC giảm liên tục → sell alt win rate cao nhất
        // Khi BTC tăng liên tục → buy alt win rate cao
        if (symbol !== 'BTCUSDT') {
          if (btcTrend === 'downtrend' && sig.side === 'buy' && !btcNearSupport) continue;
          if (btcTrend === 'uptrend' && sig.side === 'sell' && !btcNearResistance) continue;

          // Momentum boost/penalty: BTC đang push mạnh cùng hướng → tăng confidence
          // BTC đang push ngược hướng → giảm threshold (chặt hơn)
          if (btcMomentum === 'bearish' && sig.side === 'buy' && sig.confidence < 80) continue;
          if (btcMomentum === 'bullish' && sig.side === 'sell' && sig.confidence < 80) continue;

          // ===== MACRO FILTER (BTC.D + USDT.D) =====
          // Khi USDT.D cao (tiền sợ hãi) → chỉ nhận BUY nếu confidence rất cao (>= 85%)
          // Khi BTC.D đang ở vùng cao (>60%) → BUY altcoin cần confidence cao hơn
          // Điều này tránh vào lệnh buy alt trong môi trường macro bất lợi
          if (macroData) {
            if (sig.side === 'buy') {
              // USDT.D > 6%: tiền đang "sợ" → cần tín hiệu rất mạnh mới buy alt
              if (macroData.usdtDominance > 6 && sig.confidence < 85) continue;
              // BTC.D > 62%: BTC đang hút tiền → chỉ buy alt khi confidence cao
              if (macroData.btcDominance > 62 && sig.confidence < 82) continue;
              // Market đang giảm mạnh 24h (> 3%) → không buy alt (chờ ổn định)
              if (macroData.marketCapChange24h < -3 && sig.confidence < 90) continue;
            }
            if (sig.side === 'sell') {
              // USDT.D > 7%: thị trường đang hoảng loạn → sell alt dễ win hơn, hạ threshold
              // Không filter sell khi macro bearish — đây là lúc sell hiệu quả nhất
              // Nhưng nếu market đang tăng mạnh (2%+) và USDT.D thấp → cẩn trọng hơn với sell
              if (macroData.marketCapChange24h > 4 && macroData.usdtDominance < 4 && sig.confidence < 80) continue;
            }
          }
        }

        // Filter theo ETH context (cho ETH ecosystem coins):
        // ETH đang giảm + gần support → cho phép BUY ETH eco (ETH sắp bounce → eco bounce theo)
        // ETH đang tăng + gần resistance → cho phép SELL ETH eco (ETH sắp hồi → eco hồi theo)
        if (ETH_ECOSYSTEM.includes(symbol)) {
          if (ethTrend === 'downtrend' && sig.side === 'buy' && !ethNearSupport) continue;
          if (ethTrend === 'uptrend' && sig.side === 'sell' && !ethNearResistance) continue;
        }

        // Check duplicate: cùng symbol + cùng side trong 2 ngày gần nhất
        // Data: FILUSDT/LTCUSDT SL 3-4 lần → engine generate lại cùng setup
        const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
        const exists = await col.findOne({ 
          symbol, 
          side: sig.side, 
          timeframe: '4h',
          createdAt: { $gt: twoDaysAgo },
          outcome: { $in: ['pending', 'sl'] } // không block nếu đã TP (có thể vào lại)
        });
        if (exists) continue;

        // Build document để lưu (format giống client TrackedSignal)
        const lastIdx = candles.length - 1;
        // Thời gian signal = thời gian nến HIỆN TẠI (lúc scan), KHÔNG phải nến pattern gốc
        const signalTime = candles[lastIdx].time;
        const prevCandles = candles.slice(Math.max(0, lastIdx - 9), lastIdx + 1)
          .map(c => [c.open, c.high, c.low, c.close, c.volume]);

        const doc = {
          symbol,
          timeframe: '4h',
          time: signalTime,
          side: sig.side,
          entry: sig.entry,
          sl: sig.sl,
          tp: sig.tp,
          confidence: sig.confidence,
          pattern: sig.pattern.name,
          trend: sig.trend,
          volumeConfirm: sig.volumeConfirm,
          nearLevelPrice: sig.nearLevel.price,
          nearLevelType: sig.nearLevel.type,
          reason: sig.reason,
          rr: sig.rr,
          createdAt: Date.now(),
          outcome: 'pending',
          closedAt: null,
          closePrice: null,
          rAchieved: null,
          maxFavorable: sig.entry,
          maxAdverse: sig.entry,
          notes: '',
          tags: [],
          marketContext: {
            ema34: result.emaData.ema34[lastIdx] ?? 0,
            ema89: result.emaData.ema89[lastIdx] ?? 0,
            ema200: result.emaData.ema200[lastIdx] ?? 0,
            volumeRatio: result.volumeAnalysis[lastIdx]?.volumeRatio ?? 0,
            prevCandles,
            // Macro snapshot tại thời điểm signal
            macro: macroData ? {
              btcDominance: macroData.btcDominance,
              usdtDominance: macroData.usdtDominance,
              marketCapChange24h: macroData.marketCapChange24h,
              btcTrend,
              btcMomentum,
            } : null,
          },
        };

        await col.insertOne(doc);
        newSignals.push(`${symbol}: ${sig.side.toUpperCase()} ${sig.pattern.name} (${sig.confidence}%) E:${sig.entry} SL:${sig.sl.toFixed(4)} TP:${sig.tp.toFixed(4)} R:R ${sig.rr.toFixed(1)}`);

        // V3: Increment same-side counter sau khi save thành công
        if (sig.side === 'buy') buySignalsThisCycle++;
        else sellSignalsThisCycle++;

        // AI đánh giá signal mới (nếu có GROQ_API_KEY)
        if (process.env.GROQ_API_KEY) {
          try {
            const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
              body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                messages: [
                  { role: 'system', content: 'Bạn là AI trading assistant. Đánh giá nhanh signal trading bằng tiếng Việt (2-3 câu). Dựa trên phương pháp Key Level + Nến đảo chiều + EMA 34/89/200. Trả lời: NÊN VÀO / CẨN TRỌNG / KHÔNG NÊN + lý do ngắn.' },
                  { role: 'user', content: `${symbol} ${sig.side.toUpperCase()} | Pattern: ${sig.pattern.name} | Trend: ${sig.trend} | Entry: $${sig.entry} | SL: $${sig.sl.toFixed(4)} | TP: $${sig.tp.toFixed(4)} | R:R: ${sig.rr.toFixed(1)} | Volume: ${sig.volumeConfirm ? 'Xác nhận' : 'Thấp'} | Confidence: ${sig.confidence}%\nBTC trend: ${btcTrend} | BTC momentum: ${btcMomentum}\nMacro: ${macroEnv.description}\nLý do: ${sig.reason}` },
                ],
                temperature: 0.3, max_tokens: 200,
              }),
            });
            if (aiRes.ok) {
              const aiData = await aiRes.json();
              const aiText = aiData.choices?.[0]?.message?.content || '';
              if (aiText) {
                await col.updateOne({ symbol, side: sig.side, entry: sig.entry, timeframe: '4h' }, { $set: { notes: `🤖 ${aiText}` } });
              }
            }
          } catch { /* AI fail silently */ }
        }
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 100));
    }

    return res.json({
      ok: true,
      scanned: COIN_LIST.length,
      newSignals: newSignals.length,
      tracked: trackResults.length,
      signals: newSignals,
      trackDetails: trackResults,
      macro: macroData ? {
        btcDominance: macroData.btcDominance.toFixed(1) + '%',
        usdtDominance: macroData.usdtDominance.toFixed(1) + '%',
        marketCapChange24h: macroData.marketCapChange24h.toFixed(1) + '%',
        environment: macroEnv.description,
      } : null,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
