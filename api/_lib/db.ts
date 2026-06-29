/**
 * MongoDB Connection - Singleton pattern cho Vercel Serverless
 * ENV: MONGODB_URI (connection string từ MongoDB Atlas)
 */

import { MongoClient, Db } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

const DB_NAME = 'crazii';

export async function getDB(): Promise<Db> {
  if (cachedDb) return cachedDb;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Missing MONGODB_URI env var');

  const client = new MongoClient(uri);
  await client.connect();

  cachedClient = client;
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

export interface SignalDoc {
  _id?: string;
  type: string;
  side: 'buy' | 'sell';
  symbol: string;
  timeframe: string;
  price: number;
  time: number;
  reason?: string;
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  rr?: number;
  confidence?: number;
  createdAt: Date;
}

// ===== User Schema (collection: users) =====
export interface UserDoc {
  _id?: string;
  email: string;
  passwordHash: string;
  displayName?: string;
  createdAt: Date;
  // Settings
  settings: UserSettings;
}

export interface UserSettings {
  symbol: string;
  timeframe: string;
  minConfidence: number;
  showOP: boolean;
  showMLP: boolean;
  showKTR: boolean;
  showPivot: boolean;
  showDiamond: boolean;
  showEMA200: boolean;
  showFVG: boolean;
  showOB: boolean;
  // Telegram
  telegramEnabled: boolean;
  telegramChatId?: string;
  telegramMinConfidence: number; // ngưỡng % để auto-gửi TG (mặc định 80)
}

export const DEFAULT_SETTINGS: UserSettings = {
  symbol: 'XAUUSDT',
  timeframe: '5m',
  minConfidence: 55,
  showOP: true,
  showMLP: true,
  showKTR: true,
  showPivot: true,
  showDiamond: true,
  showEMA200: true,
  showFVG: false,
  showOB: false,
  telegramEnabled: false,
  telegramMinConfidence: 80,
};
