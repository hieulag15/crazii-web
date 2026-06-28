/**
 * Format tín hiệu CRAZII (enhanced) thành message Telegram (HTML)
 */

import type { EnhancedSignal } from './engine.js';

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
 * Build message Telegram cho 1 EnhancedSignal đầy đủ:
 * confidence, R:R, entry, SL, TP1-3, checklist hợp lưu.
 */
export function formatEnhancedMessage(
  e: EnhancedSignal,
  symbol: string,
  timeframe: string
): string {
  const isBuy = e.side === 'buy';
  const emoji = isBuy ? '🟢🔼' : '🔴🔽';
  const action = isBuy ? 'BUY' : 'SELL';

  const lines: string[] = [];
  lines.push(`${emoji} <b>CRAZII SIGNAL — ${action}</b>`);
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`📊 <b>${symbol}</b> · ${timeframe}`);
  lines.push(`🎯 Loại: <b>${e.label}</b>`);
  lines.push(`📈 Confidence: <b>${e.confidence}%</b> · R:R 1:${e.rr.toFixed(1)}`);

  // Trade plan
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`💰 Entry: <b>${e.entry.toFixed(2)}</b>`);
  lines.push(`🛑 SL: <b>${e.sl.toFixed(2)}</b>`);
  lines.push(`🎯 TP1: ${e.tp1.toFixed(2)}`);
  lines.push(`🎯 TP2: ${e.tp2.toFixed(2)}`);
  lines.push(`🎯 TP3: ${e.tp3.toFixed(2)}`);

  // Confluence checklist
  const passed = e.confluences.filter((c) => c.passed);
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`✅ Hợp lưu (${passed.length}/${e.confluences.length}):`);
  e.confluences.forEach((c) => {
    lines.push(`${c.passed ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  });

  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`🕐 ${timeGMT7(e.time)} (GMT+7)`);
  lines.push(`⚠️ <i>Tín hiệu tự động - không phải lời khuyên đầu tư</i>`);

  return lines.join('\n');
}
