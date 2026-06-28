/**
 * POST /api/auth/login
 * Body: { email, password }
 * Xác thực và trả về JWT token + user settings.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from '../_lib/db.js';
import { verifyPassword, signToken } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email và password là bắt buộc' });
  }

  try {
    const db = await getDB();
    const users = db.collection('users');

    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Email hoặc password không đúng' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Email hoặc password không đúng' });
    }

    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
    });

    return res.status(200).json({
      ok: true,
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        settings: user.settings,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
}
