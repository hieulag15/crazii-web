/**
 * Format tín hiệu CRAZII thành message Telegram (HTML)
 */

import type { TradeSignal, KTRLevels } from '../../src/types';

export interface SignalContext {
  symbol: string;
  timeframe: string;
  price: number;
  op: number | null;
  mlp: number | null;
  ktr: KTRLevels | null;
  signalName: string; // vd: "BIG BUY (Tam Điểm)", "CCRY", "DML"
}

/** Format thời gian GMT+7 */
function timeGMT7(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Build message cho 1 tín hiệu
 */
export function formatSignalMessage(signal: TradeSignal, ctx: SignalContext): string {
  const isBuy = signal.type === 'buy';
  const emoji = isBuy ? '🟢🔼' : '🔴🔽';
  const action = isBuy ? 'BUY' : 'SELL';

  const lines: string[] = [];
  lines.push(`${emoji} <b>CRAZII SIGNAL — ${action}</b>`);
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`📊 <b>${ctx.symbol}</b> · ${ctx.timeframe}`);
  lines.push(`🎯 Loại: <b>${ctx.signalName}</b>`);
  lines.push(`💰 Giá vào: <b>${ctx.price.toFixed(2)}</b>`);

  if (ctx.op !== null) {
    lines.push(`📍 OP: ${ctx.op.toFixed(2)}`);
  }
  if (ctx.mlp !== null) {
    lines.push(`📈 MLP: ${ctx.mlp.toFixed(2)}`);
  }

  // KTR levels làm TP/SL gợi ý
  if (ctx.ktr) {
    lines.push(`━━━━━━━━━━━━━━━`);
    if (isBuy) {
      lines.push(`🎯 <b>TP (KTR+):</b>`);
      lines.push(`   TP1: ${ctx.ktr.plus1.toFixed(2)}`);
      lines.push(`   TP2: ${ctx.ktr.plus2.toFixed(2)}`);
      lines.push(`   TP3: ${ctx.ktr.plus3.toFixed(2)}`);
      lines.push(`🛑 SL gợi ý: ${ctx.ktr.minus1.toFixed(2)}`);
    } else {
      lines.push(`🎯 <b>TP (KTR-):</b>`);
      lines.push(`   TP1: ${ctx.ktr.minus1.toFixed(2)}`);
      lines.push(`   TP2: ${ctx.ktr.minus2.toFixed(2)}`);
      lines.push(`   TP3: ${ctx.ktr.minus3.toFixed(2)}`);
      lines.push(`🛑 SL gợi ý: ${ctx.ktr.plus1.toFixed(2)}`);
    }
  }

  // Lý do
  if (signal.reason) {
    lines.push(`━━━━━━━━━━━━━━━`);
    lines.push(`📝 <b>Lý do:</b>`);
    // Chuyển \n thành xuống dòng, bỏ ký tự bullet thừa
    signal.reason.split('\n').forEach((l) => {
      if (l.trim()) lines.push(l);
    });
  }

  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`🕐 ${timeGMT7(signal.time)} (GMT+7)`);
  lines.push(`⚠️ <i>Tín hiệu tự động - không phải lời khuyên đầu tư</i>`);

  return lines.join('\n');
}
