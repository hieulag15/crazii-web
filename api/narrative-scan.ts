/**
 * API: Narrative Scan - Phân tích dòng tiền theo narrative/sector
 * Chạy mỗi 4h qua cron-job.org hoặc Vercel Cron
 *
 * Chỉ dùng Binance Futures API (FREE, không cần key)
 *
 * GET  /api/narrative-scan?action=latest    → kết quả scan gần nhất
 * GET  /api/narrative-scan?action=watchlist → token tiềm năng active
 * GET  /api/narrative-scan?action=history   → 7 ngày lịch sử (6 scan/ngày)
 * POST /api/narrative-scan                  → trigger scan mới (không cần auth)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';
import { NARRATIVE_CATEGORIES, type NarrativeCategory } from './_lib/narrativeCategories.js';
import { sendTelegramMessage } from './_lib/telegram.js';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CoinData {
  symbol:     string;
  price:      number;
  change1h:   number;   // % thay đổi trong nến 1h vừa đóng
  change4h:   number;   // % thay đổi trong nến 4h vừa đóng
  volume24h:  number;   // quoteVolume USDT 24h
}

interface TopGainer {
  symbol: string;
  change: number;
}

interface NarrativeResult {
  id:              string;
  name:            string;
  emoji:           string;
  change4h:        number;          // % trung bình có trọng số theo volume
  topGainers1h:    TopGainer[];     // top 3 tăng nhất 1h
  potentialTokens: string[];        // coin chưa pump, volume ổn
  coinCount:       number;
}

interface NarrativeScanResult {
  scanTime:         number;                      // unix epoch (seconds)
  narratives:       NarrativeResult[];           // tất cả narrative đã scan
  topNarratives:    NarrativeResult[];           // top 3 có change4h > 0
  allPotentialCoins: string[];                   // unique, flat list
  marketHealth:     'strong' | 'moderate' | 'weak';
}

// ─── Binance helpers ────────────────────────────────────────────────────────────

const FAPI = 'https://fapi.binance.com/fapi/v1';

/** Bulk 24h ticker — 1 request cho toàn bộ futures */
async function fetchTicker24h(): Promise<Map<string, { price: number; volume: number }>> {
  const map = new Map<string, { price: number; volume: number }>();
  try {
    const r = await fetch(`${FAPI}/ticker/24hr`);
    if (!r.ok) return map;
    const arr: any[] = await r.json();
    for (const t of arr) {
      if (t.symbol?.endsWith('USDT')) {
        map.set(t.symbol, {
          price:  parseFloat(t.lastPrice),
          volume: parseFloat(t.quoteVolume),
        });
      }
    }
  } catch { /* skip */ }
  return map;
}

/** 1h change — lấy 2 klines 1h, tính % nến đã đóng */
async function get1hChange(symbol: string): Promise<number> {
  try {
    const r = await fetch(`${FAPI}/klines?symbol=${symbol}&interval=1h&limit=2`);
    if (!r.ok) return 0;
    const d: any[] = await r.json();
    if (d.length < 1) return 0;
    const c = d[0];  // nến đã đóng
    const o = parseFloat(c[1]), cl = parseFloat(c[4]);
    return o === 0 ? 0 : ((cl - o) / o) * 100;
  } catch { return 0; }
}

/** 4h change — lấy 3 klines 4h, dùng nến thứ 2 từ cuối (đã đóng) */
async function get4hChange(symbol: string): Promise<number> {
  try {
    const r = await fetch(`${FAPI}/klines?symbol=${symbol}&interval=4h&limit=3`);
    if (!r.ok) return 0;
    const d: any[] = await r.json();
    if (d.length < 2) return 0;
    const c = d[d.length - 2];  // nến 4h vừa đóng
    const o = parseFloat(c[1]), cl = parseFloat(c[4]);
    return o === 0 ? 0 : ((cl - o) / o) * 100;
  } catch { return 0; }
}

// ─── Narrative analysis ─────────────────────────────────────────────────────────

async function analyzeNarrative(
  cat: NarrativeCategory,
  ticker: Map<string, { price: number; volume: number }>,
): Promise<NarrativeResult | null> {
  if (cat.coins.length === 0) return null;

  // Fetch 1h + 4h change song song theo từng coin
  const rows: CoinData[] = [];
  await Promise.all(
    cat.coins.map(async (sym) => {
      const t = ticker.get(sym);
      if (!t || t.price === 0) return;

      const [c1h, c4h] = await Promise.all([
        get1hChange(sym),
        get4hChange(sym),
      ]);

      rows.push({ symbol: sym, price: t.price, change1h: c1h, change4h: c4h, volume24h: t.volume });
    })
  );

  if (rows.length === 0) return null;

  // % narrative 4h = weighted average by volume
  const totalVol = rows.reduce((s, r) => s + r.volume24h, 0);
  const narrative4h = totalVol > 0
    ? rows.reduce((s, r) => s + r.change4h * (r.volume24h / totalVol), 0)
    : rows.reduce((s, r) => s + r.change4h, 0) / rows.length;

  // Top 3 gainers 1h
  const topGainers1h = [...rows]
    .sort((a, b) => b.change1h - a.change1h)
    .slice(0, 3)
    .map(r => ({ symbol: r.symbol, change: r.change1h }));

  // Token tiềm năng:
  //   - chưa pump (change1h < 3%)
  //   - không dump (change4h > -5%)
  //   - có thanh khoản (volume > 500k USDT/ngày)
  //   - sort by volume desc → lấy top 5
  const potentialTokens = rows
    .filter(r => r.change1h < 3 && r.change4h > -5 && r.volume24h > 500_000)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 5)
    .map(r => r.symbol);

  return {
    id:   cat.id,
    name: cat.name,
    emoji: cat.emoji,
    change4h:        parseFloat(narrative4h.toFixed(2)),
    topGainers1h,
    potentialTokens,
    coinCount: rows.length,
  };
}

// ─── Market health ──────────────────────────────────────────────────────────────

function evalMarketHealth(narratives: NarrativeResult[]): 'strong' | 'moderate' | 'weak' {
  const pos = narratives.filter(n => n.change4h > 2);
  const avg = narratives.reduce((s, n) => s + n.change4h, 0) / (narratives.length || 1);
  // Nếu chỉ stablecoin narrative nổi → thị trường yếu
  const onlyStable = pos.every(n => n.id === 'stablecoin_infra');
  if (onlyStable && pos.length <= 2) return 'weak';
  if (avg > 3 && pos.length >= 3) return 'strong';
  if (avg > 1) return 'moderate';
  return 'weak';
}

// ─── Telegram format ────────────────────────────────────────────────────────────

function sym(s: string) { return s.replace('USDT', ''); }

function buildTgMessage(scan: NarrativeScanResult): string {
  const time = new Date(scan.scanTime * 1000).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: '2-digit',
  });
  const hEmoji = { strong: '✅', moderate: '🟡', weak: '⚠️' }[scan.marketHealth];

  const lines = [
    `📊 <b>Narrative Analysis (4H Update)</b>`,
    `🕐 ${time} · ${hEmoji} Market: <b>${scan.marketHealth.toUpperCase()}</b>`,
    ``,
  ];

  for (const n of scan.topNarratives) {
    const sign = n.change4h >= 0 ? '+' : '';
    lines.push(`${n.emoji} <b>${n.name}</b> ${sign}${n.change4h}%`);
    lines.push(``);

    if (n.topGainers1h.length > 0) {
      lines.push(`🔥 Top tăng mạnh nhất (1h)`);
      for (const g of n.topGainers1h) {
        const s = g.change >= 0 ? '+' : '';
        lines.push(`#${sym(g.symbol)} ${s}${g.change.toFixed(1)}%`);
      }
      lines.push(``);
    }

    if (n.potentialTokens.length > 0) {
      lines.push(`💎 Token tiềm năng`);
      lines.push(n.potentialTokens.map(t => `#${sym(t)}`).join(' · '));
    }
    lines.push(`─────────────────────────────`);
    lines.push(``);
  }

  if (scan.allPotentialCoins.length > 0) {
    lines.push(`🎯 Tổng token tiềm năng: ${scan.allPotentialCoins.map(c => `#${sym(c)}`).join(' · ')}`);
    lines.push(``);
  }

  lines.push(`🌟 Key Level System`);
  return lines.join('\n');
}

// ─── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db  = await getDB();
  const col = db.collection('narrative_scans');

  // ── READ endpoints ─────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const action = req.query.action as string | undefined;

    if (action === 'latest') {
      const doc = await col.findOne({}, { sort: { scanTime: -1 } });
      return res.json({ ok: true, data: doc ?? null });
    }

    if (action === 'watchlist') {
      const doc = await col.findOne({}, { sort: { scanTime: -1 } });
      return res.json({
        ok: true,
        coins: doc?.allPotentialCoins ?? [],
        scanTime: doc?.scanTime ?? null,
        topNarratives: (doc?.topNarratives ?? []).map((n: NarrativeResult) => n.name),
      });
    }

    if (action === 'history') {
      // Lấy tối đa 42 scan gần nhất (7 ngày × 6 scan/ngày)
      const docs = await col.find({}).sort({ scanTime: -1 }).limit(42).toArray();
      return res.json({
        ok: true,
        history: docs.map(d => ({
          scanTime:      d.scanTime,
          marketHealth:  d.marketHealth,
          topNarratives: (d.topNarratives ?? []).map((n: NarrativeResult) => ({ name: n.name, change4h: n.change4h })),
          potentialCount: d.allPotentialCoins?.length ?? 0,
        })),
      });
    }

    // Default GET: latest
    const doc = await col.findOne({}, { sort: { scanTime: -1 } });
    return res.json({ ok: true, data: doc ?? null });
  }

  // ── SCAN (POST) ─────────────────────────────────────────────────────────────
  // KHÔNG cần authentication — cron-job.org gọi trực tiếp
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const t0 = Date.now();
    console.log('[Narrative] Scan started');

    // 1. Bulk ticker
    const ticker = await fetchTicker24h();

    // 2. Phân tích narratives — batch nhỏ để không bị rate-limit Binance
    const results: NarrativeResult[] = [];
    const BATCH = 3;

    for (let i = 0; i < NARRATIVE_CATEGORIES.length; i += BATCH) {
      const slice = NARRATIVE_CATEGORIES.slice(i, i + BATCH);
      const batch = await Promise.all(slice.map(c => analyzeNarrative(c, ticker).catch(() => null)));
      for (const r of batch) {
        if (r && r.coinCount > 0) results.push(r);
      }
      if (i + BATCH < NARRATIVE_CATEGORIES.length) {
        await new Promise(r => setTimeout(r, 600)); // tránh rate-limit
      }
    }

    // 3. Sort: strongest first
    results.sort((a, b) => b.change4h - a.change4h);
    const topNarratives = results.filter(n => n.change4h > 0).slice(0, 3);

    // 4. All potential coins (deduped)
    const allPotentialCoins = [...new Set(topNarratives.flatMap(n => n.potentialTokens))];

    // 5. Market health
    const marketHealth = evalMarketHealth(results);

    const scan: NarrativeScanResult = {
      scanTime: Math.floor(Date.now() / 1000),
      narratives: results,
      topNarratives,
      allPotentialCoins,
      marketHealth,
    };

    // 6. Lưu MongoDB
    await col.insertOne({ ...scan, createdAt: new Date(), durationMs: Date.now() - t0 });

    // 7. Dọn scan > 7 ngày
    await col.deleteMany({ scanTime: { $lt: scan.scanTime - 7 * 24 * 3600 } });

    // 8. Cập nhật narrative watchlist → auto-scan sẽ merge
    if (allPotentialCoins.length > 0) {
      const settingsCol = db.collection('settings');
      await settingsCol.updateOne(
        { _id: 'narrative_watchlist' as any },
        { $set: { coins: allPotentialCoins.slice(0, 50), updatedAt: new Date(), lastScanTime: scan.scanTime } },
        { upsert: true }
      );
    }

    // 9. Telegram
    let tgSent = false;
    if (topNarratives.length > 0) {
      const r = await sendTelegramMessage(buildTgMessage(scan));
      tgSent = r.ok;
    }

    console.log(`[Narrative] Done in ${Date.now() - t0}ms · health=${marketHealth} · top=${topNarratives.map(n => n.name).join(', ')}`);

    return res.json({
      ok: true,
      scanTime:    scan.scanTime,
      durationMs:  Date.now() - t0,
      marketHealth,
      narrativesAnalyzed: results.length,
      topNarratives: topNarratives.map(n => ({
        name: n.name, change4h: n.change4h, potentialTokens: n.potentialTokens,
      })),
      allPotentialCoins,
      telegramSent: tgSent,
    });

  } catch (err: any) {
    console.error('[Narrative] Error:', err);
    return res.status(500).json({ ok: false, error: err.message ?? String(err) });
  }
}
