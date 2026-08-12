/**
 * Narrative Service - Client-side utilities để tương tác với /api/narrative-scan
 * Dùng trong KeyLevelPage hoặc bất kỳ component nào muốn hiển thị narrative data
 */

export interface NarrativeTopGainer {
  symbol: string;
  change: number;
}

export interface NarrativeResult {
  id: string;
  name: string;
  emoji: string;
  change4h: number;
  topGainers1h: NarrativeTopGainer[];
  potentialTokens: string[];
  coinCount: number;
}

export interface NarrativeScanData {
  scanTime: number;
  narratives: NarrativeResult[];
  topNarratives: NarrativeResult[];
  allPotentialCoins: string[];
  marketHealth: 'strong' | 'moderate' | 'weak';
}

export interface NarrativeWatchlist {
  coins: string[];
  scanTime: number;
  topNarratives: string[];
}

/** Lấy kết quả narrative scan gần nhất */
export async function getLatestNarrativeScan(): Promise<NarrativeScanData | null> {
  try {
    const res = await fetch('/api/narrative-scan?action=latest');
    const json = await res.json();
    if (!json.ok || !json.data) return null;
    return json.data as NarrativeScanData;
  } catch {
    return null;
  }
}

/** Lấy watchlist token tiềm năng từ narrative scan gần nhất */
export async function getNarrativeWatchlist(): Promise<NarrativeWatchlist | null> {
  try {
    const res = await fetch('/api/narrative-scan?action=watchlist');
    const json = await res.json();
    if (!json.ok) return null;
    return {
      coins: json.coins || [],
      scanTime: json.scanTime || 0,
      topNarratives: json.topNarratives || [],
    };
  } catch {
    return null;
  }
}

/** Trigger narrative scan thủ công (dành cho admin) */
export async function triggerNarrativeScan(): Promise<{
  ok: boolean;
  marketHealth?: string;
  topNarratives?: Array<{ name: string; change4h: string; potentialTokens: string[] }>;
  allPotentialCoins?: string[];
  error?: string;
}> {
  try {
    const res = await fetch('/api/narrative-scan', { method: 'POST' });
    return await res.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Format % thay đổi narrative để hiển thị */
export function formatNarrativeChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/** Lấy màu theo narrative strength */
export function getNarrativeColor(change: number): string {
  if (change >= 5) return '#00c853';   // xanh đậm = rất mạnh
  if (change >= 2) return '#69f0ae';   // xanh nhạt = tốt
  if (change >= 0) return '#ffd740';   // vàng = trung tính
  if (change >= -2) return '#ff6d00';  // cam = yếu
  return '#f44336';                    // đỏ = đang dump
}

/** Market health label */
export function getMarketHealthLabel(health: 'strong' | 'moderate' | 'weak'): {
  label: string;
  color: string;
  emoji: string;
} {
  switch (health) {
    case 'strong':  return { label: 'Mạnh', color: '#00c853', emoji: '✅' };
    case 'moderate': return { label: 'Trung bình', color: '#ffd740', emoji: '🟡' };
    case 'weak':    return { label: 'Yếu', color: '#f44336', emoji: '⚠️' };
  }
}

/** Rút gọn symbol: BTCUSDT → BTC */
export function cleanSymbol(symbol: string): string {
  return symbol.replace('USDT', '').replace('BUSD', '');
}
