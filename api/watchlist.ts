/**
 * API: Watchlist CRUD - Lưu danh sách coin auto-scan vào MongoDB
 * GET    /api/watchlist → lấy watchlist
 * PUT    /api/watchlist → cập nhật watchlist (body: { coins: string[] })
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db.js';

const COLLECTION = 'settings';
const DOC_ID = 'watchlist';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const db = await getDB();
    const col = db.collection(COLLECTION);

    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: DOC_ID as any });
      return res.json({ coins: doc?.coins || [] });
    }

    if (req.method === 'PUT') {
      const { coins } = req.body;
      if (!Array.isArray(coins)) return res.status(400).json({ error: 'coins must be array' });
      await col.updateOne(
        { _id: DOC_ID as any },
        { $set: { coins, updatedAt: Date.now() } },
        { upsert: true }
      );
      return res.json({ ok: true, count: coins.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
