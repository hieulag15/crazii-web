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
  // Wallet & Position Sizing
  walletBalance: number;     // tổng số dư đầu tư (USDT)
  riskPerTrade: number;      // % risk mỗi lệnh (mặc định 2 = 2%)
  maxLossPerTrade: number;   // max loss tuyệt đối mỗi lệnh (USDT, mặc định 10)
}

export const DEFAULT_SETTINGS: UserSettings = {
  symbol: 'BTCUSDT',
  timeframe: '5m',
  minConfidence: 55,
  walletBalance: 300,
  riskPerTrade: 2,
  maxLossPerTrade: 10,
};
