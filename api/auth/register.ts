/**
 * POST /api/auth/register
 * Body: { email, password, displayName? }
 * Tạo tài khoản mới, trả về JWT token.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB, DEFAULT_SETTINGS } from '../lib/db.js';
import { hashPassword, signToken } from '../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password, displayName } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email và password là bắt buộc' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password phải ít nhất 6 ký tự' });
  }

  try {
    const db = await getDB();
    const users = db.collection('users');

    // Kiểm tra email đã tồn tại
    const existing = await users.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email đã được sử dụng' });
    }

    // Tạo user mới
    const passwordHash = await hashPassword(password);
    const result = await users.insertOne({
      email: email.toLowerCase(),
      passwordHash,
      displayName: displayName || email.split('@')[0],
      createdAt: new Date(),
      settings: DEFAULT_SETTINGS,
    });

    // Tạo token
    const token = signToken({
      userId: result.insertedId.toString(),
      email: email.toLowerCase(),
    });

    return res.status(201).json({
      ok: true,
      token,
      user: {
        id: result.insertedId.toString(),
        email: email.toLowerCase(),
        displayName: displayName || email.split('@')[0],
        settings: DEFAULT_SETTINGS,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
}
