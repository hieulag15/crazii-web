// ============================================================
// CRAZII Trading System - Type Definitions
// ============================================================

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OPData {
  time: number;
  op: number | null;
  yesterdayOP: number | null;
  prevClose: number | null;
}

export interface MLPData {
  time: number;
  mlp: number | null;
}

export interface KTRLevels {
  plus1: number;
  plus2: number;
  plus3: number;
  minus1: number;
  minus2: number;
  minus3: number;
}

export interface KTRData {
  time: number;
  levels: KTRLevels | null;
}

export interface HACandle {
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
  isBull: boolean;
}

export interface KSIData {
  time: number;
  value: number;
  volNorm?: number;
  isBullish: boolean;
  boysBuying: boolean;
  boysSelling: boolean;
}

export interface KCXData {
  time: number;
  state: 'retailBuy' | 'retailSell' | 'exhaustion' | 'neutral';
  value: number;
  volRatio?: number;
  rangeRatio?: number;
}

export interface PivotData {
  pp: number;
  r1: number;
  s1: number;
  r2: number;
  s2: number;
}

export type GTHStatus = 'good' | 'bad';

export interface DiamondSignal {
  time: number;
  type: 'blue' | 'broken' | 'nested';
  price: number;
}

export interface DJDDSignal {
  time: number;
  type: 'djdd';
}

export interface TradeSignal {
  time: number;
  type: 'buy' | 'sell';
  price: number;
  source?: string;
  reason?: string;
}

// ===== Phân tích kỹ thuật ICT =====

export interface FVG {
  time: number;
  type: 'bullish' | 'bearish';
  top: number;    // cạnh trên của gap
  bottom: number; // cạnh dưới của gap
  filled: boolean;
}

export interface OrderBlock {
  time: number;
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  mitigated: boolean; // đã bị giá quay lại "test" chưa
}

// ===== Tín hiệu nâng cao (A + B + C + D) =====

export interface Confluence {
  name: string;       // vd "OP", "MLP", "KSI", "KCX", "Pivot", "EMA200", "FVG", "OB"
  passed: boolean;
  weight: number;     // điểm đóng góp
  detail: string;     // mô tả ngắn
}

export interface SRZone {
  high: number;
  low: number;
  strength: number;
}

export interface EnhancedSignal {
  time: number;
  side: 'buy' | 'sell';
  source: string;        // loại tín hiệu gốc (Tam Điểm / DML / CCRY...)
  label: string;         // tên hiển thị
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rr: number;            // tỷ lệ R:R tới TP1
  confidence: number;    // 0-100
  confluences: Confluence[];
  reason: string;
  riskLevel?: 'Low' | 'Medium' | 'High';
  riskPercent?: number;
}

export interface CraziiResult {
  ops: OPData[];
  mlps: MLPData[];
  ktrs: KTRData[];
  haCandles: HACandle[];
  ksi: KSIData[];
  kcx: KCXData[];
  diamonds: DiamondSignal[];
  djdd: DJDDSignal[];
  engulfing: TradeSignal[];
  tamDiem: TradeSignal[];
  diamondBreak: TradeSignal[];
  fvgs: FVG[];
  orderBlocks: OrderBlock[];
  enhancedSignals: EnhancedSignal[];
  srZones?: SRZone[];
}

export interface CraziiSettings {
  opHour: number;
  ktrMultiplier: number;
  haSmooth: number;
  showOP: boolean;
  showMLP: boolean;
  showKTR: boolean;
  showPivot: boolean;
  showDiamond: boolean;
  showCandles: boolean;
  showEMA200: boolean;
  showFVG?: boolean;
  showOB?: boolean;
  minConfidence?: number; // ngưỡng % để hiện tín hiệu
}

export interface SystemStatus {
  price: number;
  op: number | null;
  mlp: number | null;
  opRule: 'BUY' | 'SELL';
  mlpRule: 'BUY' | 'SELL';
  candle: string;
  candleBull: boolean;
  ksi: string;
  ksiBull: boolean;
  kcx: string;
  kcxState: string;
  gth: string;
  gthGood: boolean;
}

export interface SignalDisplay {
  time: number;
  type: string;
  color: string;
  reason?: string;
  enhanced?: EnhancedSignal;
}
