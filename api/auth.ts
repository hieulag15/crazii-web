/**
 * /api/auth — Unified auth handler (gộp login + register + me)
 * Routing theo URL path cuối:
 *
 * POST /api/auth/login     — đăng nhập
 * POST /api/auth/register  — đăng ký
 * GET  /api/auth/me        — lấy profile (cần token)
 * PUT  /api/auth/me        — cập nhật settings (cần token)
 *
 * Vercel tự route /api/auth/* → file này nhờ vercel.json rewrites
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDB, DEFAULT_SETTINGS } from './_lib/db.js';
import { hashPassword, verifyPassword, signToken, getUserFromRequest } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Lấy action từ path: /api/auth/login → "login"
  const urlPath = req.url?.split('?')[0] ?? '';
  const action = urlPath.split('/').pop() ?? '';

  // ── POST /api/auth?action=login ────────────────────────────────────────────
  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email và password là bắt buộc' });

    try {
      const db = await getDB();
      const user = await db.collection('users').findOne({ email: email.toLowerCase() });
      if (!user) return res.status(401).json({ error: 'Email hoặc password không đúng' });

      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Email hoặc password không đúng' });

      const token = signToken({ userId: user._id.toString(), email: user.email });
      return res.status(200).json({
        ok: true, token,
        user: { id: user._id.toString(), email: user.email, displayName: user.displayName, settings: user.settings },
      });
    } catch (err) {
      console.error('[auth/login]', err);
      return res.status(500).json({ error: 'Lỗi server' });
    }
  }

  // ── POST /api/auth?action=register ────────────────────────────────────────
  if (action === 'register') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password, displayName } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email và password là bắt buộc' });
    if (password.length < 6) return res.status(400).json({ error: 'Password phải ít nhất 6 ký tự' });

    try {
      const db = await getDB();
      const users = db.collection('users');
      const existing = await users.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(409).json({ error: 'Email đã được sử dụng' });

      const passwordHash = await hashPassword(password);
      const result = await users.insertOne({
        email: email.toLowerCase(), passwordHash,
        displayName: displayName || email.split('@')[0],
        createdAt: new Date(), settings: DEFAULT_SETTINGS,
      });

      const token = signToken({ userId: result.insertedId.toString(), email: email.toLowerCase() });
      return res.status(201).json({
        ok: true, token,
        user: {
          id: result.insertedId.toString(), email: email.toLowerCase(),
          displayName: displayName || email.split('@')[0], settings: DEFAULT_SETTINGS,
        },
      });
    } catch (err) {
      console.error('[auth/register]', err);
      return res.status(500).json({ error: 'Lỗi server' });
    }
  }

  // ── GET|PUT /api/auth?action=me ────────────────────────────────────────────
  if (action === 'me') {
    const auth = getUserFromRequest(req);
    if (!auth) return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });

    const db = await getDB();
    const users = db.collection('users');

    if (req.method === 'GET') {
      const user = await users.findOne({ _id: new ObjectId(auth.userId) });
      if (!user) return res.status(404).json({ error: 'User không tồn tại' });
      return res.status(200).json({
        ok: true,
        user: { id: user._id.toString(), email: user.email, displayName: user.displayName, settings: user.settings },
      });
    }

    if (req.method === 'PUT') {
      const { settings } = req.body || {};
      if (!settings) return res.status(400).json({ error: 'Thiếu settings' });

      const allowedKeys = [
        'symbol', 'timeframe', 'minConfidence',
        'showOP', 'showMLP', 'showKTR', 'showPivot', 'showDiamond', 'showEMA200', 'showFVG', 'showOB',
        'telegramEnabled', 'telegramChatId', 'telegramMinConfidence',
        'walletBalance', 'riskPerTrade', 'maxLossPerTrade',
      ];
      const update: Record<string, unknown> = {};
      for (const key of allowedKeys) {
        if (key in settings) update[`settings.${key}`] = settings[key];
      }
      await users.updateOne({ _id: new ObjectId(auth.userId) }, { $set: update });
      const user = await users.findOne({ _id: new ObjectId(auth.userId) });
      return res.status(200).json({ ok: true, settings: user?.settings });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(400).json({ error: 'Missing action. Use ?action=login|register|me' });
}
