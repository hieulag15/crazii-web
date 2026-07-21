/**
 * API: Key Level Signal Tracking - CRUD + Auto-track
 * Collection: kl_signals
 *
 * GET    /api/kl-signals         → list all signals (optional ?outcome=pending)
 * POST   /api/kl-signals         → create new signal
 * PUT    /api/kl-signals         → update signal (body: { id, ...updates })
 * DELETE /api/kl-signals?id=xxx  → delete signal
 * GET    /api/kl-signals?action=stats → get analytics
 * GET    /api/kl-signals?action=export&format=csv|jsonl → export
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from './_lib/db';
import { ObjectId } from 'mongodb';

const COLLECTION = 'kl_signals';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const db = await getDB();
    const col = db.collection(COLLECTION);

    if (req.method === 'GET') {
      const { action, outcome, format } = req.query;

      if (action === 'stats') {
        const all = await col.find({}).toArray();
        const closed = all.filter(s => s.outcome !== 'pending');
        const wins = closed.filter(s => s.outcome === 'tp');
        const losses = closed.filter(s => s.outcome === 'sl');
        const rValues = closed.filter(s => s.rAchieved != null).map(s => s.rAchieved as number);

        return res.json({
          totalSignals: all.length,
          wins: wins.length,
          losses: losses.length,
          pending: all.filter(s => s.outcome === 'pending').length,
          winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
          avgR: rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0,
          bestR: rValues.length > 0 ? Math.max(...rValues) : 0,
          worstR: rValues.length > 0 ? Math.min(...rValues) : 0,
        });
      }

      if (action === 'export') {
        const all = await col.find({}).sort({ createdAt: -1 }).toArray();
        if (format === 'csv') {
          const headers = 'Date,Symbol,TF,Side,Pattern,Trend,Confidence,Entry,SL,TP,Outcome,R_Achieved,VolConfirm,Notes,Tags';
          const rows = all.map(s => [
            new Date(s.createdAt).toISOString(), s.symbol, s.timeframe, s.side, s.pattern, s.trend,
            s.confidence, s.entry, s.sl, s.tp, s.outcome, s.rAchieved ?? '', s.volumeConfirm,
            `"${(s.notes || '').replace(/"/g, '""')}"`, (s.tags || []).join(';'),
          ].join(','));
          res.setHeader('Content-Type', 'text/csv');
          return res.send([headers, ...rows].join('\n'));
        }
        // JSONL
        const lines = all.filter(s => s.outcome !== 'pending').map(s => JSON.stringify({
          symbol: s.symbol, timeframe: s.timeframe, side: s.side, pattern: s.pattern,
          trend: s.trend, confidence: s.confidence, volumeConfirm: s.volumeConfirm,
          nearLevelType: s.nearLevelType, outcome: s.outcome, rAchieved: s.rAchieved,
          marketContext: s.marketContext, notes: s.notes, tags: s.tags,
        }));
        res.setHeader('Content-Type', 'application/jsonl');
        return res.send(lines.join('\n'));
      }

      // Default: list signals
      const filter: Record<string, unknown> = {};
      if (outcome && typeof outcome === 'string') filter.outcome = outcome;
      const signals = await col.find(filter).sort({ createdAt: -1 }).limit(200).toArray();
      return res.json(signals);
    }

    if (req.method === 'POST') {
      const signal = req.body;
      if (!signal || !signal.symbol) return res.status(400).json({ error: 'Invalid signal data' });

      // Tránh duplicate
      const exists = await col.findOne({ symbol: signal.symbol, createdAt: signal.createdAt, side: signal.side });
      if (exists) return res.json({ ok: true, id: exists._id?.toString(), duplicate: true });

      const result = await col.insertOne({
        ...signal,
        createdAt: signal.createdAt || Date.now(),
      });
      return res.json({ ok: true, id: result.insertedId.toString() });
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'Missing id' });

      let objectId: ObjectId;
      try { objectId = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid id' }); }

      await col.updateOne({ _id: objectId }, { $set: updates });
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const id = req.query.id as string;
      if (!id) return res.status(400).json({ error: 'Missing id' });

      let objectId: ObjectId;
      try { objectId = new ObjectId(id); } catch { return res.status(400).json({ error: 'Invalid id' }); }

      await col.deleteOne({ _id: objectId });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[kl-signals]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
