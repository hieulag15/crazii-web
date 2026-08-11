/**
 * /api/crazii-positions - Manage user trading positions
 * GET    - List open positions for authenticated user
 * POST   - Open a new position (Enter trade)
 * PUT    - Update / close a position
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ObjectId } from 'mongodb';
import { getDB } from './_lib/db.js';
import { getUserFromRequest } from './_lib/auth.js';

// ===== Types =====

export interface PositionDoc {
  _id?: ObjectId;
  userId: string;
  signalId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  entry: number;
  sl: number;
  tp: number;
  leverage: number;
  positionSize: number;   // USDT notional
  riskAmount: number;     // USDT at risk
  status: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual';
  openedAt: Date;
  closedAt?: Date;
  pnlDollar: number;
  currentPrice: number;
}

// ===== Position sizing helper =====

export function calculatePositionSize(
  walletBalance: number,
  riskPerTrade: number,   // percent, e.g. 2 = 2%
  maxLossPerTrade: number,
  entry: number,
  sl: number,
): {
  riskAmount: number;
  slDistancePct: number;
  leverage: number;
  positionSize: number;
} {
  const riskAmount = Math.min(walletBalance * (riskPerTrade / 100), maxLossPerTrade);
  const slDistancePct = Math.abs(entry - sl) / entry; // e.g. 0.005 = 0.5%

  // Avoid division by zero
  if (slDistancePct === 0) {
    return { riskAmount, slDistancePct: 0, leverage: 1, positionSize: riskAmount };
  }

  // leverage = riskAmount / (walletBalance * slDistancePct)
  const rawLeverage = riskAmount / (walletBalance * slDistancePct);
  const leverage = Math.max(1, Math.min(125, Math.round(rawLeverage)));

  // positionSize (USDT) = riskAmount / slDistancePct
  const positionSize = riskAmount / slDistancePct;

  return { riskAmount, slDistancePct, leverage, positionSize };
}

function calcPnl(pos: PositionDoc, closePrice: number): number {
  const { side, entry, positionSize, leverage } = pos;
  // P&L = (priceDiff / entry) * positionSize * leverage
  if (side === 'buy') {
    return ((closePrice - entry) / entry) * positionSize * leverage;
  }
  return ((entry - closePrice) / entry) * positionSize * leverage;
}

// ===== Handler =====

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = getUserFromRequest(req);
  if (!auth) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const db = await getDB();
  const col = db.collection<PositionDoc>('crazii_positions');

  // ── GET /api/crazii-positions ────────────────────────────────────────────
  if (req.method === 'GET') {
    const positions = await col
      .find({ userId: auth.userId })
      .sort({ openedAt: -1 })
      .limit(100)
      .toArray();

    return res.status(200).json({ ok: true, positions });
  }

  // ── POST /api/crazii-positions ───────────────────────────────────────────
  if (req.method === 'POST') {
    const { signalId, symbol, side, entry, sl, tp, leverage, positionSize, riskAmount } =
      req.body || {};

    if (!symbol || !side || !entry || !sl || !tp) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    const doc: PositionDoc = {
      userId: auth.userId,
      signalId: signalId || undefined,
      symbol,
      side,
      entry: Number(entry),
      sl: Number(sl),
      tp: Number(tp),
      leverage: Number(leverage) || 1,
      positionSize: Number(positionSize) || 0,
      riskAmount: Number(riskAmount) || 0,
      status: 'open',
      openedAt: new Date(),
      pnlDollar: 0,
      currentPrice: Number(entry),
    };

    const result = await col.insertOne(doc);
    return res.status(201).json({ ok: true, id: result.insertedId.toString(), position: doc });
  }

  // ── PUT /api/crazii-positions (with ?id=xxx) ─────────────────────────────
  if (req.method === 'PUT') {
    const id = req.query.id as string;
    if (!id) {
      return res.status(400).json({ ok: false, error: 'Missing position id' });
    }

    let objId: ObjectId;
    try { objId = new ObjectId(id); }
    catch { return res.status(400).json({ ok: false, error: 'Invalid id' }); }

    const position = await col.findOne({ _id: objId, userId: auth.userId });
    if (!position) {
      return res.status(404).json({ ok: false, error: 'Position not found' });
    }

    const { status, currentPrice } = req.body || {};

    const closedStatuses = ['closed_tp', 'closed_sl', 'closed_manual'];
    const isClosing = closedStatuses.includes(status);

    const update: Partial<PositionDoc> = {};

    if (currentPrice !== undefined) {
      update.currentPrice = Number(currentPrice);
      update.pnlDollar = calcPnl(position, Number(currentPrice));
    }

    if (isClosing) {
      update.status = status;
      update.closedAt = new Date();
      const closePrice = currentPrice !== undefined ? Number(currentPrice) : position.currentPrice;

      // Cap SL loss at riskAmount (shouldn't lose more than planned)
      let pnl = calcPnl(position, closePrice);
      if (status === 'closed_sl') {
        pnl = Math.max(pnl, -position.riskAmount);
      }
      update.pnlDollar = pnl;
    }

    await col.updateOne({ _id: objId }, { $set: update });

    const updated = await col.findOne({ _id: objId });
    return res.status(200).json({ ok: true, position: updated });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
