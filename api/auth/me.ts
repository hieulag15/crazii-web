/**
 * GET /api/auth/me - Lấy profile + settings (yêu cầu token)
 * PUT /api/auth/me - Cập nhật settings
 * Header: Authorization: Bearer <token>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDB } from '../_lib/db.js';
import { getUserFromRequest } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = getUserFromRequest(req);
  if (!auth) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }

  const db = await getDB();
  const users = db.collection('users');

  // GET - lấy profile
  if (req.method === 'GET') {
    const user = await users.findOne({ _id: new ObjectId(auth.userId) });
    if (!user) return res.status(404).json({ error: 'User không tồn tại' });

    return res.status(200).json({
      ok: true,
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        settings: user.settings,
      },
    });
  }

  // PUT - cập nhật settings
  if (req.method === 'PUT') {
    const { settings } = req.body || {};
    if (!settings) {
      return res.status(400).json({ error: 'Thiếu settings' });
    }

    // Chỉ cho phép update các field settings hợp lệ
    const allowedKeys = [
      'symbol', 'timeframe', 'minConfidence',
      'showOP', 'showMLP', 'showKTR', 'showPivot', 'showDiamond', 'showEMA200',
      'showFVG', 'showOB',
      'telegramEnabled', 'telegramChatId', 'telegramMinConfidence',
    ];
    const update: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in settings) {
        update[`settings.${key}`] = settings[key];
      }
    }

    await users.updateOne(
      { _id: new ObjectId(auth.userId) },
      { $set: update }
    );

    // Trả về settings mới
    const user = await users.findOne({ _id: new ObjectId(auth.userId) });
    return res.status(200).json({
      ok: true,
      settings: user?.settings,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
