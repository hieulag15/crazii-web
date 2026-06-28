/**
 * Auth helpers - JWT + password hashing
 * ENV: JWT_SECRET (chuỗi bí mật để ký token)
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { VercelRequest } from '@vercel/node';

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '7d'; // token hết hạn sau 7 ngày

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Missing JWT_SECRET env var');
  return secret;
}

/** Hash password */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** So sánh password */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Tạo JWT token cho user */
export function signToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_EXPIRY });
}

/** Xác thực JWT từ header Authorization: Bearer <token> */
export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as { userId: string; email: string };
    return decoded;
  } catch {
    return null;
  }
}

/** Extract và verify token từ request. Trả null nếu không hợp lệ. */
export function getUserFromRequest(req: VercelRequest): { userId: string; email: string } | null {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  return verifyToken(token);
}
