/**
 * API: Full Scan Results - Đọc kết quả scan gần nhất từ MongoDB
 * GET /api/full-scan-results?minConfidence=60&limit=30
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = await getDB();
    const col = db.collection('kl_full_scan_results');

    const minConfidence = parseInt(req.query.minConfidence as string) || 60;
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

    // Lấy tất cả results, filter theo minConfidence trên top signal
    const results = await col
      .find({})
      .toArray();

    // Filter: chỉ giữ coin có signal với confidence >= minConfidence
    const filtered = results
      .filter((doc: any) => {
        if (!doc.signals || doc.signals.length === 0) return false;
        return doc.signals.some((s: any) => s.confidence >= minConfidence);
      })
      .sort((a: any, b: any) => {
        const confA = Math.max(...a.signals.map((s: any) => s.confidence));
        const confB = Math.max(...b.signals.map((s: any) => s.confidence));
        return confB - confA;
      })
      .slice(0, limit);

    // Lấy scanTime từ record đầu tiên (nếu có)
    const lastScanTime = results.length > 0 ? results[0].scanTime : null;

    return res.json({
      ok: true,
      count: filtered.length,
      lastScanTime,
      results: filtered,
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
