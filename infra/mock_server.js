const express   = require("express");
const cors      = require("cors");
const Sentiment = require("sentiment");
const fs        = require("fs");
const path      = require("path");

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: "*" }));
app.use(express.json());

// ── Mock market data with live drift ──────────────────────────────
const DATA_PATH = path.join(__dirname, "mock_market_data.json");

function getMarketEvents() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

const ORIGINAL_EVENTS = getMarketEvents();
let liveEvents = JSON.parse(JSON.stringify(ORIGINAL_EVENTS));

function applyPriceDrift() {
  liveEvents = liveEvents.map((ev) => {
    // SOL crash is a fixed demo scenario — keep it intact
    if (ev.asset === "SOL" && ev.anomaly) return { ...ev, timestamp: new Date().toISOString() };

    const priceDrift = (Math.random() - 0.47) * 0.5;   // slight bullish bias
    const sentDrift  = (Math.random() - 0.5) * 6;
    const volDrift   = (Math.random() - 0.5) * 0.25;
    const pctDrift   = (Math.random() - 0.47) * 1.8;

    const newPrice = parseFloat(
      (ev.current_price * (1 + priceDrift / 100)).toFixed(ev.current_price > 1 ? 2 : 5)
    );
    const newPct  = parseFloat(Math.max(-25, Math.min(30, ev.price_change_5m_pct + pctDrift)).toFixed(2));
    const newSent = ev.social_sentiment_score !== null
      ? Math.round(Math.max(0, Math.min(100, ev.social_sentiment_score + sentDrift)))
      : null;
    const newVol  = parseFloat(Math.max(0.05, ev.volume_spike_multiplier + volDrift).toFixed(2));

    return {
      ...ev,
      current_price:           newPrice,
      price_change_5m_pct:     newPct,
      social_sentiment_score:  newSent,
      volume_spike_multiplier: newVol,
      timestamp:               new Date().toISOString(),
    };
  });

  const btc = liveEvents.find((e) => e.asset === "BTC");
  if (btc) console.log(`[Drift] BTC $${btc.current_price}  Δ${btc.price_change_5m_pct}%  sent:${btc.social_sentiment_score}`);
}

// Drift every 8 s — keeps the demo reactive
setInterval(applyPriceDrift, 8000);

// ── Wallet state ───────────────────────────────────────────────────
let wallet = {
  USDC: 10000.00,
  BTC:  0.05,
  ETH:  1.20,
  SOL:  25.00,
};

const txLog = [];

function walletSnapshot() {
  return JSON.parse(JSON.stringify(wallet));
}

// Portfolio value using mock live prices
function computePortfolioValue() {
  let total = wallet.USDC;
  for (const ev of liveEvents) {
    total += (wallet[ev.asset] ?? 0) * ev.current_price;
  }
  return parseFloat(total.toFixed(2));
}

// ── Chaos mode ─────────────────────────────────────────────────────
let chaosMode         = false;
let chaosActivatedAt  = null;
let chaosTriggerCount = 0;

// ── Content parsing — AFINN NLP + crypto vocabulary ───────────────
const sentimentAnalyzer = new Sentiment();

const CRYPTO_VOCAB = {
  // Bearish / risk
  rug: -4, rugpull: -5, rekt: -3, drained: -4, dump: -3, dumping: -3,
  scam: -4, hack: -4, hacked: -4, exploit: -3, exploited: -3,
  ban: -2, banned: -2, crash: -3, crashed: -3, plunge: -3, panic: -3,
  bearish: -3, selloff: -2, liquidation: -2, liquidated: -3,
  insolvent: -4, freeze: -2, frozen: -2, vulnerability: -3,
  breach: -4, suspended: -3, lawsuit: -2, regulation: -1, sec: -1,
  illegal: -4, vulnerable: -3, collapse: -4, stolen: -4,
  // Bullish / positive
  hodl: 2, moon: 2, mooning: 3, bullish: 3, surge: 3, surging: 3,
  breakout: 3, adoption: 2, etf: 2, approved: 2, institutional: 2,
  partnership: 2, ath: 3, accumulate: 2, accumulating: 2, inflow: 2,
  launch: 1, upgrade: 2, integration: 1, growth: 2, rally: 3,
  rallying: 3, rising: 2, gaining: 2, record: 2,
};

const RISK_WORDS = [
  "hack","exploit","vulnerability","stolen","drained","regulation","sec",
  "lawsuit","freeze","suspended","ban","illegal","breach","attack","rug","rugpull",
];

const ASSET_RE = {
  BTC: /bitcoin|\bbtc\b/,
  ETH: /ethereum|\beth\b/,
  SOL: /solana|\bsol\b/,
};

function parseWithNLP(text) {
  const result = sentimentAnalyzer.analyze(text, { extras: CRYPTO_VOCAB });
  const lower  = text.toLowerCase();

  const mentionedAssets = Object.entries(ASSET_RE)
    .filter(([, re]) => re.test(lower))
    .map(([a]) => a);

  const risks = RISK_WORDS.filter((w) => lower.includes(w));

  const cmp       = result.comparative;
  const sentiment = cmp < -0.05 ? "BEARISH" : cmp > 0.05 ? "BULLISH" : "NEUTRAL";
  const riskLevel = risks.length >= 3 ? "CRITICAL" : risks.length >= 1 ? "ELEVATED" : "NORMAL";

  const riskPenalty = Math.min(0.20, risks.length * 0.05);
  const bias = parseFloat(
    Math.max(-0.45, Math.min(0.45, cmp * 3 - riskPenalty)).toFixed(3)
  );

  const keywords = [
    ...result.positive.slice(0, 3),
    ...result.negative.slice(0, 3),
  ].filter(Boolean).slice(0, 6);

  return {
    mentionedAssets: mentionedAssets.length > 0 ? mentionedAssets : ["ALL"],
    sentiment,
    riskLevel,
    keywords,
    risks,
    bias,
    source: "afinn_nlp",
    _debug: {
      score:       result.score,
      comparative: parseFloat(cmp.toFixed(4)),
      tokens:      result.tokens.length,
    },
  };
}

function keywordFallback(text) {
  const lower     = text.toLowerCase();
  const BEARISH_W = ["crash","collapse","plunge","dump","hack","exploit","ban","illegal","stolen","drained","falling","decline","fear","panic","rug","breach","attack","freeze","suspended"];
  const BULLISH_W = ["surge","rally","breakout","adoption","etf","approved","institutional","partnership","ath","bullish","accumulate","inflow","launch","upgrade","growth"];
  const bearishHits = BEARISH_W.filter((w) => lower.includes(w));
  const bullishHits = BULLISH_W.filter((w) => lower.includes(w));
  const riskHits    = RISK_WORDS.filter((w) => lower.includes(w));
  const net = bullishHits.length - bearishHits.length;
  const mentionedAssets = Object.entries(ASSET_RE).filter(([, re]) => re.test(lower)).map(([a]) => a);
  return {
    mentionedAssets: mentionedAssets.length > 0 ? mentionedAssets : ["ALL"],
    sentiment: net < 0 ? "BEARISH" : net > 0 ? "BULLISH" : "NEUTRAL",
    riskLevel: riskHits.length >= 3 ? "CRITICAL" : riskHits.length >= 1 ? "ELEVATED" : "NORMAL",
    keywords:  [...bearishHits, ...bullishHits].slice(0, 6),
    risks:     riskHits,
    bias:      parseFloat(Math.max(-0.45, Math.min(0.45, bullishHits.length * 0.04 - bearishHits.length * 0.04 - riskHits.length * 0.08)).toFixed(3)),
    source:    "keyword_fallback",
  };
}

// ── Routes ─────────────────────────────────────────────────────────

app.get("/api/toggle-chaos", (req, res) => {
  chaosMode = !chaosMode;
  if (chaosMode) {
    chaosActivatedAt = new Date().toISOString();
    chaosTriggerCount++;
    console.log("\x1b[31m[CHAOS] ACTIVATED — execute-action returns 500\x1b[0m");
  } else {
    console.log("\x1b[32m[CHAOS] DEACTIVATED\x1b[0m");
  }
  res.json({
    chaos_mode:        chaosMode,
    activated_at:      chaosMode ? chaosActivatedAt : null,
    total_activations: chaosTriggerCount,
    message:           chaosMode ? "⚡ Chaos ON" : "✓ Chaos OFF",
  });
});

app.get("/api/chaos-status", (req, res) => {
  res.json({ chaos_mode: chaosMode, activated_at: chaosActivatedAt, total_activations: chaosTriggerCount });
});

// GET /api/market-stream: Returns live simulated asset prices, including their 5m percentage change and on-chain whale activity metrics.
app.get("/api/market-stream", (req, res) => {
  res.json({
    status:       "ok",
    count:        liveEvents.length,
    retrieved_at: new Date().toISOString(),
    chaos_mode:   chaosMode,
    events:       liveEvents,
  });
});

app.get("/api/reset-market", (req, res) => {
  liveEvents = JSON.parse(JSON.stringify(ORIGINAL_EVENTS));
  console.log("[Reset] Market data restored to original scenario");
  res.json({ status: "reset", message: "Market data restored to original scenario" });
});

// POST /api/execute-action: Validates wallet balance and executes simulated BUY, SELL, HEDGE, or LIQUIDATE orders.
app.post("/api/execute-action", (req, res) => {
  if (chaosMode) {
    console.log(`\x1b[31m[CHAOS] 500 injected for ${req.body?.asset ?? "?"}\x1b[0m`);
    return res.status(500).json({
      error:      "Rate Limit / Liquidity Pool Timeout",
      code:       "LIQUIDITY_POOL_TIMEOUT",
      chaos_mode: true,
      message:    "Primary execution node overloaded. Liquidity pool unresponsive.",
      ts:         new Date().toISOString(),
    });
  }

  const { asset, action, size } = req.body;
  if (!asset || !action || size === undefined) {
    return res.status(400).json({ error: "Required: asset, action, size" });
  }

  const VALID_ACTIONS = ["BUY", "SELL", "LIQUIDATE_TO_USDC", "SET_STOP_LOSS", "HEDGE"];
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Unknown action. Valid: ${VALID_ACTIONS.join(", ")}` });
  }

  const event = liveEvents.find((e) => e.asset === asset.toUpperCase());
  if (!event) {
    return res.status(404).json({ error: `No market data for asset: ${asset}` });
  }

  const before = walletSnapshot();
  let summary  = "";

  switch (action) {
    case "BUY": {
      const cost = size * event.current_price;
      if (wallet.USDC < cost) {
        return res.status(400).json({ error: `Insufficient USDC. Need $${cost.toFixed(2)}, have $${wallet.USDC.toFixed(2)}` });
      }
      wallet.USDC  -= cost;
      wallet[asset] = (wallet[asset] ?? 0) + size;
      summary = `Bought ${size} ${asset} @ $${event.current_price} for $${cost.toFixed(2)} USDC`;
      break;
    }
    case "SELL": {
      if ((wallet[asset] ?? 0) < size) {
        return res.status(400).json({ error: `Insufficient ${asset}. Have ${wallet[asset] ?? 0}` });
      }
      const proceeds = size * event.current_price;
      wallet[asset] -= size;
      wallet.USDC   += proceeds;
      summary = `Sold ${size} ${asset} @ $${event.current_price} for $${proceeds.toFixed(2)} USDC`;
      break;
    }
    case "LIQUIDATE_TO_USDC": {
      const holding = wallet[asset] ?? 0;
      if (holding <= 0) {
        return res.status(400).json({ error: `No ${asset} holdings to liquidate` });
      }
      const val = holding * event.current_price;
      wallet[asset] = 0;
      wallet.USDC  += val;
      summary = `Liquidated ${holding} ${asset} → $${val.toFixed(2)} USDC (emergency exit)`;
      break;
    }
    case "SET_STOP_LOSS": {
      summary = `Stop-loss set on ${asset} at $${size} (current: $${event.current_price})`;
      break;
    }
    case "HEDGE": {
      const premium = size * event.current_price * 0.02;
      if (wallet.USDC < premium) {
        return res.status(400).json({ error: `Insufficient USDC for hedge premium: $${premium.toFixed(2)}` });
      }
      wallet.USDC -= premium;
      summary = `Hedge on ${size} ${asset} — put option premium: $${premium.toFixed(2)} USDC`;
      break;
    }
  }

  const after = walletSnapshot();
  const tx = {
    tx_id:              `TX-${Date.now()}`,
    timestamp:          new Date().toISOString(),
    asset, action, size,
    price_at_execution: event.current_price,
    summary,
    success:            true,
  };
  txLog.push(tx);
  console.log(`[Action] ${tx.tx_id} | ${action} ${size} ${asset} @ $${event.current_price}`);

  res.json({
    status:        "executed",
    transaction:   tx,
    state_change:  { before, after },
    tx_log_length: txLog.length,
  });
});

app.get("/api/wallet", (req, res) => {
  res.json({
    wallet:              walletSnapshot(),
    portfolio_value_usd: computePortfolioValue(),
    tx_count:            txLog.length,
  });
});

app.get("/api/tx-log", (req, res) => {
  res.json({ count: txLog.length, transactions: txLog });
});

// POST /api/parse-content: Parses input text via AFINN NLP or keyword fallback to extract asset mentions and sentiment bias.
app.post("/api/parse-content", (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) {
    return res.status(400).json({ error: "text required" });
  }

  try {
    const result = parseWithNLP(text);
    console.log(
      `[Content Parser] AFINN → ${result.sentiment} / ${result.riskLevel}` +
      ` / bias ${result.bias} (${result._debug.tokens} tokens, score ${result._debug.comparative})`
    );
    return res.json(result);
  } catch (err) {
    console.log(`[Content Parser] NLP failed (${err.message}) — keyword fallback`);
    return res.json(keywordFallback(text));
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", chaos_mode: chaosMode, ts: new Date().toISOString() });
});

// POST /api/chat — context-aware AI assistant (smart rule-based, no API key required)
app.post("/api/chat", (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: "message required" });

  const msg      = message.toLowerCase();
  const anomalies = liveEvents.filter(e => e.anomaly || (e.price_change_5m_pct ?? 0) < -12);
  const btc      = liveEvents.find(e => e.asset === "BTC");
  const eth      = liveEvents.find(e => e.asset === "ETH");
  const sol      = liveEvents.find(e => e.asset === "SOL");
  const pv       = computePortfolioValue();
  const w        = walletSnapshot();

  function fmtPrice(p) { return p >= 1 ? p.toLocaleString("en-US",{maximumFractionDigits:2}) : p.toFixed(5); }

  let response;

  if (msg.includes("doing") || msg.includes("status") || msg.includes("happening") || msg.includes("monitor")) {
    response = `System status:\n\n• Monitoring ${liveEvents.length} assets in real-time\n• Portfolio value: $${pv.toLocaleString("en-US",{maximumFractionDigits:2})}\n`;
    if (anomalies.length) response += `• ⚠ ${anomalies.length} anomaly signal(s): ${anomalies.map(e=>e.asset).join(", ")}\n`;
    else response += `• No anomalies — all markets stable\n`;
    if (chaosMode) response += `• ⚡ Chaos Mode ACTIVE — execution layer simulating HTTP 500 failures\n`;
    if (txLog.length) response += `\nLast action: ${txLog[txLog.length-1]?.summary}`;
  }
  else if (msg.includes("scor") || (msg.includes("how") && msg.includes("work")) || msg.includes("weight") || msg.includes("engine")) {
    response = `Multi-Factor Scoring Engine v4.0:\n\n• Price Momentum   (0.28) — normalized 5-minute price change\n• Volume Spike     (0.26) — log-normalized volume vs baseline\n• On-Chain Data    (0.20) — whale sell pressure + exchange inflows\n• Social Sentiment (0.16) — AFINN NLP with crypto vocabulary\n• Order Book       (0.10) — spread % + bid depth collapse\n\nScore range: [-1.0, +1.0]\n> +0.38     → BUY (Breakout)\n+0.06–+0.38 → BUY (Accumulation)\n-0.20–+0.06 → HOLD\n-0.50–-0.20 → HEDGE\n< -0.50     → LIQUIDATE or STOP_LOSS`;
  }
  else if (msg.includes("btc") || msg.includes("bitcoin")) {
    if (!btc) { response = "BTC market data unavailable — server may be restarting."; }
    else response = `BTC (Bitcoin) — live data:\n\n• Price: $${fmtPrice(btc.current_price)}\n• 5m Change: ${btc.price_change_5m_pct >= 0 ? "▲ +" : "▼ "}${btc.price_change_5m_pct.toFixed(2)}%\n• Social Sentiment: ${btc.social_sentiment_score ?? "N/A"}/100\n• Volume Spike: ${btc.volume_spike_multiplier}×\n• Anomaly: ${btc.anomaly ? "⚠ YES" : "No"}\n• Your BTC: ${w.BTC ?? 0} BTC ($${((w.BTC ?? 0) * btc.current_price).toFixed(2)})`;
  }
  else if (msg.includes("eth") || msg.includes("ethereum")) {
    if (!eth) { response = "ETH data unavailable."; }
    else response = `ETH (Ethereum) — live data:\n\n• Price: $${fmtPrice(eth.current_price)}\n• 5m Change: ${eth.price_change_5m_pct >= 0 ? "▲ +" : "▼ "}${eth.price_change_5m_pct.toFixed(2)}%\n• Sentiment: ${eth.social_sentiment_score ?? "N/A"}/100\n• Volume: ${eth.volume_spike_multiplier}×\n• Your ETH: ${w.ETH ?? 0} ETH ($${((w.ETH ?? 0) * eth.current_price).toFixed(2)})`;
  }
  else if (msg.includes("sol") || msg.includes("solana")) {
    if (!sol) { response = "SOL data unavailable."; }
    else response = `SOL (Solana) — live data:\n\n• Price: $${fmtPrice(sol.current_price)}\n• 5m Change: ${sol.price_change_5m_pct >= 0 ? "▲ +" : "▼ "}${sol.price_change_5m_pct.toFixed(2)}%\n• Anomaly: ${sol.anomaly ? "⚠ YES — This triggers LIQUIDATE_TO_USDC for emergency capital protection" : "No"}\n• Sentiment: ${sol.social_sentiment_score ?? "N/A"}/100\n• Volume: ${sol.volume_spike_multiplier}×`;
  }
  else if (msg.includes("portfolio") || msg.includes("wallet") || msg.includes("balance") || msg.includes("holding")) {
    response = `Portfolio breakdown:\n\n• USDC (cash): $${(w.USDC ?? 0).toFixed(2)}\n`;
    for (const [asset, bal] of Object.entries(w)) {
      if (asset === "USDC" || !bal) continue;
      const ev = liveEvents.find(e => e.asset === asset);
      const price = ev?.current_price ?? 0;
      response += `• ${asset}: ${bal} units @ $${fmtPrice(price)} = $${(bal * price).toFixed(2)}\n`;
    }
    response += `\nTotal portfolio value: $${pv.toLocaleString("en-US",{maximumFractionDigits:2})}`;
  }
  else if (msg.includes("chaos")) {
    response = chaosMode
      ? `⚡ Chaos Mode is ACTIVE.\n\nAll /api/execute-action calls return HTTP 500 (Rate Limit / Liquidity Pool Timeout).\n\nAgent 2 will:\n1. Attempt execution (fails)\n2. Retry after 1s (fails)\n3. Retry after 2s (fails)\n4. Route to Fallback Secondary Liquidity Bridge\n5. Queue TX as FBK-XXXXXXX for later retry\n\nThis simulates real-world execution failures under market stress.`
      : `Chaos Mode is currently OFF.\n\nEnable it from the sidebar or Agent tab to inject HTTP 500 errors and observe Agent 2's exponential backoff + fallback bridge recovery.`;
  }
  else if (msg.includes("risk") || msg.includes("danger") || msg.includes("safe") || msg.includes("threat")) {
    const lvl = anomalies.length >= 2 ? "🔴 HIGH" : anomalies.length === 1 ? "🟡 ELEVATED" : "🟢 LOW";
    response = `Risk level: ${lvl}\n\n`;
    if (!anomalies.length) response += "All assets within normal signal ranges. No active threat indicators.";
    else response += anomalies.map(e => `• ${e.asset}: ${(e.price_change_5m_pct??0).toFixed(2)}% ${e.anomaly?"— CONFIRMED ANOMALY":""}`).join("\n") + "\n\nAgent 2 will trigger LIQUIDATE_TO_USDC on confirmed anomalies.";
  }
  else if (msg.includes("trade") || msg.includes("transaction") || msg.includes("history") || msg.includes("last")) {
    if (!txLog.length) { response = "No trades executed yet. Run the Agent pipeline from the Agent Core tab."; }
    else response = `Last ${Math.min(5, txLog.length)} transactions:\n\n` +
      txLog.slice(-5).reverse().map(t => `• ${t.tx_id}: ${t.summary}\n  at ${new Date(t.timestamp).toLocaleTimeString()}`).join("\n\n");
  }
  else if (msg.includes("sentinel") || msg.includes("agent") || msg.includes("what is") || msg.includes("explain")) {
    response = `Paradox Sentinel is a 3-agent autonomous crypto intelligence system:\n\nAGENT 0 — Content Parser\nIngests unstructured text (articles, tweets) → extracts asset mentions, sentiment (BULLISH/BEARISH/NEUTRAL), and risk level via AFINN NLP with 60+ crypto-specific terms.\n\nAGENT 1 — Market Analyst\nFetches live market stream → null-field sanitization → 5-factor scoring engine (price + volume + on-chain + sentiment + order book). Detects pump-and-dump patterns.\n\nAGENT 2 — Risk Mitigation\nEvaluates scores → dynamic position sizing → executes trades with exponential backoff (3×) → Fallback Secondary Liquidity Bridge on total failure.\n\nSentinel Mode: autonomous 5s polling — triggers pipeline automatically on price anomaly > 8%.`;
  }
  else {
    response = `I'm Sentinel AI, monitoring ${liveEvents.length} assets in real-time.\n\n• Portfolio: $${pv.toLocaleString("en-US",{maximumFractionDigits:2})}\n• Anomalies: ${anomalies.length}\n• Chaos Mode: ${chaosMode ? "ACTIVE" : "off"}\n• Trades executed: ${txLog.length}\n\nAsk me about: BTC/ETH/SOL prices, portfolio, risk level, scoring engine, chaos mode, recent trades, or "what is Sentinel?"`;
  }

  console.log(`[Chat] "${message.slice(0,60)}" → ${response.slice(0,80)}…`);
  res.json({ response, source: "rule_based", ts: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[Paradox Sentinel] Mock server → http://localhost:${PORT}`);
  console.log(`  GET  /api/market-stream    — simulated prices (8s drift)`);
  console.log(`  POST /api/execute-action   { asset, action, size }`);
  console.log(`  POST /api/parse-content    { text } — AFINN NLP`);
  console.log(`  POST /api/chat             { message } — AI assistant`);
  console.log(`  GET  /api/toggle-chaos     — inject HTTP 500s`);
  console.log(`  GET  /api/wallet           — balances + portfolio value`);
  console.log(`  GET  /api/reset-market     — restore original scenario`);
  console.log(`  GET  /api/tx-log`);
});
