const express = require('express');
const path = require('path');
const fs = require('fs');

// Load .env manually (no extra deps)
try {
  fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8')
    .split('\n')
    .forEach(line => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    });
} catch (e) { console.warn('.env not loaded:', e.message); }

const app = express();
app.use(express.json());

// Serve Mini App static files
app.use(express.static(path.join(__dirname)));

// ── Config ────────────────────────────────────────
const SUVVY_API_URL = 'https://api.suvvy.ai/api/webhook/custom/message';
const SUVVY_TOKEN   = process.env.SUVVY_TOKEN || '';

// ── Pending requests: waiting for Suvvy webhook ──
// chat_id → { resolve, reject, timeoutId }
const pending = new Map();

// ── POST /chat ─ Mini App sends message ──────────
app.post('/chat', async (req, res) => {
  const { message, chat_id } = req.body;
  if (!message || !chat_id) return res.status(400).json({ error: 'missing fields' });

  if (!SUVVY_TOKEN) {
    return res.status(503).json({ error: 'SUVVY_TOKEN not set' });
  }

  const message_id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  try {
    // Forward message to Suvvy
    const payload = {
      api_version: 1,
      message_id,
      chat_id,
      text: message,
      message_sender: 'customer',
      source: 'MVP Mini App',
    };
    console.log('[→ Suvvy]', JSON.stringify(payload));

    const suvvyRes = await fetch(SUVVY_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUVVY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const suvvyBody = await suvvyRes.text();
    console.log('[← Suvvy response]', suvvyRes.status, suvvyBody);

    if (!suvvyRes.ok) {
      return res.status(502).json({ error: 'suvvy error', detail: suvvyBody });
    }
  } catch (err) {
    console.error('Fetch to Suvvy failed:', err.message);
    return res.status(502).json({ error: 'network error' });
  }

  // Wait for Suvvy to call our webhook with the AI reply (max 25s)
  const reply = await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(chat_id);
      reject(new Error('timeout'));
    }, 25000);
    pending.set(chat_id, { resolve, reject, timeoutId });
  }).catch(() => null);

  if (!reply) {
    return res.status(504).json({ error: 'timeout waiting for AI response' });
  }

  res.json({ reply });
});

// ── POST /webhook ─ Suvvy sends AI reply here ────
app.post('/webhook', (req, res) => {
  console.log('[← Webhook hit]', JSON.stringify(req.body));
  res.status(200).json({ ok: true });

  const { chat_id, new_messages } = req.body;
  if (!chat_id || !new_messages?.length) return;

  const entry = pending.get(chat_id);
  if (!entry) return;

  const text = new_messages
    .filter(m => m.message_sender === 'ai' && m.text)
    .map(m => m.text)
    .join('\n');

  if (!text) return;

  clearTimeout(entry.timeoutId);
  pending.delete(chat_id);
  entry.resolve(text);
});

// ── Health check ──────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MVP server running on http://localhost:${PORT}`);
  console.log(`Suvvy token: ${SUVVY_TOKEN ? SUVVY_TOKEN.slice(0,12) + '...' : 'NOT SET'}`);
});
