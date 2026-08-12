/**
 * Narrative Categories - Mapping coin theo narrative/sector
 * Tương tự phân loại của bot "Phước Báu Narrative Alert"
 * 
 * Mỗi narrative có:
 *  - id: unique key
 *  - name: tên hiển thị
 *  - emoji: icon
 *  - coins: danh sách USDT pairs trên Binance Futures
 *  - spotCoins: danh sách coin trên Binance Spot (nếu không có futures)
 */

export interface NarrativeCategory {
  id: string;
  name: string;
  emoji: string;
  coins: string[];         // Binance Futures USDT pairs
  spotCoins?: string[];    // Spot-only coins (fallback)
}

export const NARRATIVE_CATEGORIES: NarrativeCategory[] = [
  // ===== DeFi Derivatives =====
  {
    id: 'derivatives',
    name: 'Derivatives',
    emoji: '📊',
    coins: [
      'PENDLEUSDT', 'DYDXUSDT', 'GMXUSDT', 'SNXUSDT',
      'LITUSDT', 'JUPUSDT', 'AVNTUSDT',
    ],
  },
  {
    id: 'perpetuals',
    name: 'Perpetuals',
    emoji: '📊',
    coins: [
      'JUPUSDT', 'DRIFTUSDT', 'AVNTUSDT',
    ],
  },

  // ===== DEX =====
  {
    id: 'dex',
    name: 'Decentralized Exchange (DEX)',
    emoji: '📊',
    coins: [
      'UNIUSDT', 'CRVUSDT', 'AAVUSDT', 'SUSHIUSDT',
      'RAYDIUMUSDT', 'JUPUSDT', 'PENDLEUSDT',
    ],
    spotCoins: ['AEROUSDT', 'LITUSDT'],
  },

  // ===== Launchpad =====
  {
    id: 'launchpad',
    name: 'Launchpad',
    emoji: '📊',
    coins: [
      'JUPUSDT', 'CAKEUSDT', 'RAYUSDT',
    ],
    spotCoins: ['VIRTUALUSDT', 'KAITOUSDT'],
  },

  // ===== AI =====
  {
    id: 'ai',
    name: 'Artificial Intelligence (AI)',
    emoji: '🤖',
    coins: [
      'FETUSDT', 'RENDERUSDT', 'TAOUSDT', 'NEARUSDT',
      'ARKMUSDT', 'VIRTUALUSDT', 'KAITOUSDT',
    ],
    spotCoins: ['COOKIEUSDT', 'AGIXUSDT'],
  },

  // ===== Meme =====
  {
    id: 'meme',
    name: 'Meme',
    emoji: '🐸',
    coins: [
      'DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'BONKUSDT',
      'WIFUSDT', 'FLOKIUSDT', 'TRUMPUSDT', 'MEMEUSDT',
      'NEIROUSDT', 'PENGUUSDT',
    ],
  },

  // ===== RWA =====
  {
    id: 'rwa',
    name: 'Real World Assets (RWA)',
    emoji: '📊',
    coins: [
      'ONDOUSDT', 'LINKUSDT', 'XLMUSDT',
      'POLYXUSDT', 'CENTUSDT', 'PAXGUSDT',
    ],
    spotCoins: ['SYRUPUSDT'],
  },

  // ===== ZK =====
  {
    id: 'zk',
    name: 'Zero Knowledge (ZK)',
    emoji: '📊',
    coins: [
      'STRKUSDT', 'ZKUSDT', 'TAIKOUSDT',
      'POLUSDT', 'SCROLLUSDT',
    ],
  },

  // ===== Governance =====
  {
    id: 'governance',
    name: 'Governance',
    emoji: '📊',
    coins: [
      'UNIUSDT', 'AAVEUSDT', 'MKRUSDT', 'COMPUSDT',
      'WLDUSDT', 'ENAUSDT', 'ARKMUSDT',
    ],
  },

  // ===== DeFi =====
  {
    id: 'defi',
    name: 'Decentralized Finance (DeFi)',
    emoji: '💰',
    coins: [
      'AAVEUSDT', 'UNIUSDT', 'LINKUSDT', 'MKRUSDT',
      'CRVUSDT', 'LDOUSDT', 'ENAUSDT', 'PENDLEUSDT',
      'JUPUSDT', 'ETHFIUSDT',
    ],
  },

  // ===== Gaming / GameFi =====
  {
    id: 'gamefi',
    name: 'Gaming / GameFi',
    emoji: '🎮',
    coins: [
      'SANDUSDT', 'MANAUSDT', 'AXSUSDT', 'GALAUSDT',
      'IMXUSDT', 'YGGUSDT', 'GMTUSDT', 'MAGICUSDT',
    ],
  },

  // ===== Layer 1 =====
  {
    id: 'layer1',
    name: 'Layer 1 Blockchain',
    emoji: '⛓️',
    coins: [
      'SOLUSDT', 'AVAXUSDT', 'ADAUSDT', 'NEARUSDT',
      'APTUSDT', 'SUIUSDT', 'TONUSDT', 'ALGOUSDT',
      'TIAUSDT', 'INJUSDT', 'ATOMUSDT',
    ],
  },

  // ===== Layer 2 =====
  {
    id: 'layer2',
    name: 'Layer 2 / Scaling',
    emoji: '⚡',
    coins: [
      'ARBUSDT', 'OPUSDT', 'STRKUSDT', 'MATICUSDT',
      'METISUSDT', 'ZKUSDT', 'TAIKOUSDT', 'CELOUSDT',
    ],
  },

  // ===== AI Agents =====
  {
    id: 'ai_agents',
    name: 'AI Agents',
    emoji: '🤖',
    coins: [
      'VIRTUALUSDT', 'FETUSDT', 'TAOUSDT', 'ARKMUSDT',
    ],
    spotCoins: ['COOKIEUSDT', 'KAITOUSDT'],
  },

  // ===== Quantum Resistant =====
  {
    id: 'quantum',
    name: 'Quantum-Resistant',
    emoji: '📊',
    coins: [
      'ALGOUSDT', 'STRKUSDT',
    ],
    spotCoins: ['CKBUSDT', 'FHEUSDT', 'QUBICUSDT'],
  },

  // ===== Infrastructure =====
  {
    id: 'infrastructure',
    name: 'Infrastructure',
    emoji: '📊',
    coins: [
      'LINKUSDT', 'FILUSDT', 'NEARUSDT',
      'GRTUSDT', 'FETUSDT', 'PYTHUSDT',
    ],
  },

  // ===== Prediction Markets =====
  {
    id: 'prediction',
    name: 'Prediction Markets',
    emoji: '📊',
    coins: [
      'DRIFTUSDT',
    ],
    spotCoins: ['OPNUSDT', 'FUNUSDT'],
  },

  // ===== Privacy =====
  {
    id: 'privacy',
    name: 'Privacy Blockchain',
    emoji: '🤖',
    coins: [
      'XMRUSDT', 'ZECUSDT',
    ],
    spotCoins: ['MINAUSDT'],
  },

  // ===== Stablecoin Infra (chỉ khi thị trường yếu) =====
  {
    id: 'stablecoin_infra',
    name: 'Stablecoin Infrastructure',
    emoji: '📊',
    coins: [],
    spotCoins: ['USDC', 'USDE', 'RLUSD'],
  },
];

/** Map nhanh từ id → category */
export const NARRATIVE_MAP = new Map<string, NarrativeCategory>(
  NARRATIVE_CATEGORIES.map(c => [c.id, c])
);

/** Lấy tất cả unique coins từ tất cả narrative để scan */
export function getAllNarrativeCoins(): string[] {
  const set = new Set<string>();
  for (const cat of NARRATIVE_CATEGORIES) {
    cat.coins.forEach(c => set.add(c));
  }
  return [...set];
}
