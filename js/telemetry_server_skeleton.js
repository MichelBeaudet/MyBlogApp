# server-skeleton.js — Example Node/Express receiver for telemetry (demo only)
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '200kb' }));

// Simple in-memory store (demo). Do NOT use in production.
const store = [];

app.post('/telemetry/collect', (req, res) => {
  const payload = req.body;
  // Basic validation
  if (!payload || !payload.collectedAt) {
    // some snapshots use 'ts' instead; accept both for demo
    if (!payload.ts) return res.status(400).send({ ok: false, msg: 'missing timestamp' });
  }
  // Push to store (in prod: sanitize, validate, persist securely)
  store.push({ receivedAt: new Date().toISOString(), payload });
  console.log('Telemetry received:', payload.collectedAt || payload.ts || '(no ts)');
  res.send({ ok: true });
});

app.get('/telemetry/list', (req, res) => {
  res.json(store.slice(-50));
});

app.listen(port, () => {
  console.log('Telemetry demo server listening on port', port);
});
