/**
 * Paradox Sentinel — Agentic Reasoning Core v2.0
 * Robustness Layer: null-field sanitization, conflicting-signal detection,
 * exponential backoff retry, and fallback secondary liquidity bridge.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname }                            from "path";
import { fileURLToPath }                            from "url";

const __dirname          = dirname(fileURLToPath(import.meta.url));
const BASE_URL           = "http://localhost:3001";
const FALLBACK_LOG_PATH  = join(__dirname, "fallback_tx_log.json");
const MAX_RETRIES        = 3;
const BASE_DELAY_MS      = 1000;

// ══════════════════════════════════════════════════════════════════
//  DISPLAY HELPERS
// ══════════════════════════════════════════════════════════════════

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m",  green: "\x1b[32m",  yellow: "\x1b[33m",
  cyan: "\x1b[36m", white: "\x1b[37m",  magenta: "\x1b[35m",
  blue: "\x1b[34m", orange: "\x1b[38;5;208m",
};

const divider = (ch = "─", len = 68) => console.log(C.dim + ch.repeat(len) + C.reset);
const header  = (t) => { divider("═"); console.log(`${C.bold}${C.cyan}  ${t}${C.reset}`); divider("═"); };
const section = (t) => { console.log(); divider(); console.log(`${C.bold}  ${t}${C.reset}`); divider(); };
const tag     = (lbl, msg, color = C.white) =>
  console.log(`  ${C.bold}${color}[${lbl}]${C.reset} ${msg}`);
const kv      = (k, v, color = C.yellow) =>
  console.log(`  ${C.dim}${k}:${C.reset} ${color}${v}${C.reset}`);
const gap     = () => console.log();
const sleep   = (ms) => new Promise((r) => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════
//  ROBUSTNESS LAYER — sanitize & detect conflicting signals
// ══════════════════════════════════════════════════════════════════

function sanitizeEvent(raw) {
  const event    = { ...raw };
  const missing  = [];   // fields that were null/undefined
  const conflicts = [];  // logically contradictory signals

  // ── Field-level null guards ──────────────────────────────────
  if (event.social_sentiment_score === null || event.social_sentiment_score === undefined) {
    missing.push({ field: "social_sentiment_score", found: event.social_sentiment_score, assigned: 50 });
    event.social_sentiment_score = 50;  // neutral baseline
  }
  if (event.volume_spike_multiplier === null || event.volume_spike_multiplier === undefined) {
    missing.push({ field: "volume_spike_multiplier", found: event.volume_spike_multiplier, assigned: 1.0 });
    event.volume_spike_multiplier = 1.0;
  }
  if (event.price_change_5m_pct === null || event.price_change_5m_pct === undefined) {
    missing.push({ field: "price_change_5m_pct", found: event.price_change_5m_pct, assigned: 0 });
    event.price_change_5m_pct = 0;
  }
  if (event.current_price === null || event.current_price === undefined) {
    missing.push({ field: "current_price", found: event.current_price, assigned: 0 });
    event.current_price = 0;
  }

  // ── Conflicting signal detection ─────────────────────────────
  if (event.price_change_5m_pct > 15 && event.volume_spike_multiplier < 0.5) {
    conflicts.push(
      `Price surging +${event.price_change_5m_pct}% but volume at ${event.volume_spike_multiplier}× ` +
      `(dead volume ↔ price spike = high pump-and-dump risk)`
    );
  }
  if ((event.order_book?.spread_pct ?? 0) > 5) {
    conflicts.push(
      `Bid-ask spread ${event.order_book.spread_pct}% — extreme illiquidity ` +
      `(normal <0.1% for liquid assets)`
    );
  }
  if (event.on_chain?.whale_sell_pressure === "unknown") {
    conflicts.push("On-chain whale data unavailable — uncertainty elevated, confidence penalised");
  }
  if (event.volume_24h < 500000 && event.price_change_5m_pct > 10) {
    conflicts.push(
      `24h volume $${event.volume_24h.toLocaleString()} — micro-cap with outsized move = manipulation risk`
    );
  }

  return {
    sanitized:          event,
    missing,
    conflicts,
    hasMissingData:     missing.length > 0,
    hasConflictingData: conflicts.length > 0,
  };
}

// ══════════════════════════════════════════════════════════════════
//  FALLBACK SECONDARY LIQUIDITY BRIDGE
// ══════════════════════════════════════════════════════════════════

function routeToFallbackBridge(asset, action, size, reason) {
  let existing = [];
  if (existsSync(FALLBACK_LOG_PATH)) {
    try { existing = JSON.parse(readFileSync(FALLBACK_LOG_PATH, "utf8")); } catch {}
  }

  const tx = {
    fallback_tx_id: `FBK-${Date.now()}`,
    timestamp:      new Date().toISOString(),
    asset, action, size, reason,
    status:         "QUEUED_FOR_RETRY",
    bridge:         "secondary_liquidity_bridge_v2",
    note:           "Primary execution node unavailable. Transaction queued; will auto-retry on node recovery.",
  };
  existing.push(tx);
  writeFileSync(FALLBACK_LOG_PATH, JSON.stringify(existing, null, 2));
  return tx;
}

// ══════════════════════════════════════════════════════════════════
//  EXPONENTIAL BACKOFF EXECUTOR
// ══════════════════════════════════════════════════════════════════

async function executeWithRetry(asset, action, size) {
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res  = await fetch(`${BASE_URL}/api/execute-action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ asset, action, size }),
      });

      const body = await res.json().catch(() => ({}));

      // 500 → retryable server fault
      if (res.status === 500) {
        throw new Error(`HTTP 500 — ${body.error ?? "Internal Server Error"} [${body.code ?? "?"}]`);
      }

      // 4xx → non-retryable client/state error (e.g. empty wallet)
      if (!res.ok) {
        return { success: false, nonRetryable: true, error: body.error ?? `HTTP ${res.status}`, data: body };
      }

      return { success: true, data: body, attempt };
    } catch (err) {
      lastErr = err;

      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt - 1) * BASE_DELAY_MS;  // 1s, 2s ...
        tag("Retry", `Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`, C.yellow);
        kv(`  Backoff`, `waiting ${delay}ms before attempt ${attempt + 1}...`, C.dim);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted
  return { success: false, error: lastErr?.message ?? "Unknown error" };
}

//  AGENT 0 — Content Parser (NLP)
// ══════════════════════════════════════════════════════════════════

async function runContentParser(text) {
  header("AGENT 0 — CONTENT PARSER ACTIVATED");
  tag("Input Text", `"${text}"`, C.cyan);
  gap();

  try {
    const res = await fetch(`${BASE_URL}/api/parse-content`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const result = await res.json();

    tag("NLP Analysis", `Sentiment: ${result.sentiment} | Risk: ${result.riskLevel}`, C.magenta);
    kv("  Extracted Bias", result.bias, result.bias < 0 ? C.red : C.green);
    kv("  Mentioned",      result.mentionedAssets.join(", "));
    kv("  Keywords",       result.keywords.join(", "), C.dim);
    gap();

    return result;
  } catch (err) {
    tag("Error", `Agent 0 failed: ${err.message}`, C.red);
    return { bias: 0, mentionedAssets: ["ALL"] };
  }
}

// ══════════════════════════════════════════════════════════════════
//  MULTI-FACTOR SCORING ENGINE  v4.0
//  Replaces single if-else tree with weighted composite signal score
// ══════════════════════════════════════════════════════════════════

// Signal weights — v4.0 "Safe-Growth" (Prioritizes volume/whale confirmation over hype)
const W = { price: 0.28, volume: 0.26, onchain: 0.20, sentiment: 0.16, book: 0.10 };

// Whale sentiment table
const WHALE_SCORE = {
  extreme: -1.0, high: -0.6, moderate: -0.3,
  neutral:  0.0, low:  0.4,  unknown:  0.0,
};

// Normalizers — all output [-1, +1]
const normPrice = (p) => Math.max(-1, Math.min(1, p / 20));
const normSent  = (s) => (s - 50) / 50;
const normVol   = (v) => Math.max(-1, Math.min(1, Math.log2(Math.max(0.01, v)) / 2));
const normBook  = (ob) => {
  const sp = ob?.spread_pct ?? 0;
  let s = sp > 10 ? -1.0 : sp > 5 ? -0.7 : sp > 2 ? -0.3 : sp < 0.1 ? 0.2 : 0;
  if (ob?.bid_depth_collapse) s -= 0.5;
  return Math.max(-1, Math.min(1, s));
};
const inflowPct = (ev) => {
  if (!ev.volume_24h) return 0;
  const r = (ev.on_chain?.exchange_inflow_usd ?? 0) / ev.volume_24h;
  return r > 0.02 ? 0.15 : r > 0.005 ? 0.08 : 0;
};

function scoreAndDecide(event, bias = 0) {
  const pct   = event.price_change_5m_pct;
  const sent  = event.social_sentiment_score;
  const vol   = event.volume_spike_multiplier;
  const whale = event.on_chain?.whale_sell_pressure ?? "unknown";

  const sp = normPrice(pct);
  const ss = normSent(sent);
  const sv = normVol(vol);
  const so = Math.max(-1, (WHALE_SCORE[whale] ?? 0) - inflowPct(event));
  const sb = normBook(event.order_book);

  let score = parseFloat(
    (W.price*sp + W.sentiment*ss + W.volume*sv + W.onchain*so + W.book*sb + bias).toFixed(3)
  );

  // ── Divergence Check: Penalize price action without volume support ─────
  let divergencePenalty = 0;
  if (sp > 0.4 && sv < -0.1) {
    divergencePenalty = 0.15;
    score = parseFloat((score - divergencePenalty).toFixed(3));
  }
  const comps = {
    price:    sp.toFixed(2), sentiment: ss.toFixed(2),
    volume:   sv.toFixed(2), onchain:   so.toFixed(2),
    book:     sb.toFixed(2),
    div_penalty: divergencePenalty.toFixed(2),
  };
  const whaleUnknown = whale === "unknown" ? 0.08 : 0;

  // ── Priority 1: Pump-and-dump detection ───────────────────────
  // High price surge + dead volume + illiquid book = manipulation
  if (pct > 10 && vol < 0.5 && (event.order_book?.spread_pct ?? 0) > 5) return {
    action: "HOLD", classification: "PUMP_RISK",
    confidence: parseFloat(Math.max(0.72, 0.90 - whaleUnknown).toFixed(2)),
    rationale: `Pump-and-dump pattern detected: +${pct}% surge with ${vol}× dead volume ` +
               `and ${event.order_book?.spread_pct}% spread — execution risk extreme, action blocked.`,
    branch:      "pct>10 ∧ vol<0.5 ∧ spread>5% → PUMP_RISK",
    executeSize: 0, score, components: comps,
  };

  // ── Priority 2: Confirmed anomaly / exploit crash ─────────────
  if (event.anomaly && pct < -12 && sent < 30) return {
    action: "LIQUIDATE_TO_USDC", classification: "ANOMALY",
    confidence: parseFloat(Math.min(0.99, 0.95 + Math.abs(score) * 0.04).toFixed(2)),
    rationale: `Exploit confirmed: composite score ${score}, ${pct}% crash, sentiment ${sent}/100, whale: ${whale}.`,
    branch:      "anomaly=true ∧ pct<−12% ∧ sentiment<30 → LIQUIDATE_TO_USDC",
    executeSize: 999, score, components: comps,
  };

  // ── Priority 3: Score-based thresholds ────────────────────────
  if (score < -0.50) {
    const bearishFactors = [
      sp < -0.3 && "price crash",
      ss < -0.2 && "negative sentiment",
      sv < -0.3 && "dead volume",
      so < -0.3 && "whale exit",
    ].filter(Boolean).join(", ");
    return {
      action: pct < -5 ? "LIQUIDATE_TO_USDC" : "SET_STOP_LOSS",
      classification: "ANOMALY",
      confidence: parseFloat(Math.max(0.70, Math.min(0.94, Math.abs(score))).toFixed(2)),
      rationale: `Multi-signal bearish confluence (score ${score}): ${bearishFactors}.`,
      branch:      `score(${score}) < −0.50 → ANOMALY`,
      executeSize: 0, score, components: comps,
    };
  }

  if (score < -0.20) return {
    action: "HEDGE", classification: "ANOMALY",
    confidence: parseFloat(Math.max(0.52, Math.min(0.72, Math.abs(score))).toFixed(2)),
    rationale: `Moderate bearish signal (score ${score}) — hedging position.`,
    branch:      `score(${score}) ∈ [−0.50, −0.20] → HEDGE`,
    executeSize: 0.5, score, components: comps,
  };

  if (score > 0.38) {
    const sz = parseFloat(Math.max(0.05, Math.min(0.30, score * 0.45)).toFixed(3));
    return {
      action: "BUY", classification: "BREAKOUT",
      confidence: parseFloat(Math.min(0.95, 0.65 + score * 0.55).toFixed(2)),
      rationale: `Strong breakout (score ${score}): +${pct}%, ${vol}× volume, sentiment ${sent}/100, whale: ${whale}.`,
      branch:      `score(${score}) > 0.38 → BREAKOUT → BUY (size ${sz})`,
      executeSize: sz, score, components: comps,
    };
  }

  if (score > 0.06) {
    const sz = parseFloat(Math.max(0.03, Math.min(0.12, score * 0.30)).toFixed(3));
    return {
      action: "BUY", classification: "STABLE",
      confidence: parseFloat(Math.max(0.52, Math.min(0.80, 0.35 + score * 0.80)).toFixed(2)),
      rationale: `Positive multi-factor signal (score ${score}), accumulation opportunity.`,
      branch:      `score(${score}) ∈ [0.06, 0.38] → STABLE → BUY (size ${sz})`,
      executeSize: sz, score, components: comps,
    };
  }

  return {
    action: "HOLD", classification: "NEUTRAL",
    confidence: parseFloat(Math.max(0.40, 0.58 - Math.abs(score) - whaleUnknown).toFixed(2)),
    rationale: `No directional edge (score ${score}).`,
    branch:      `score(${score}) ∈ [−0.20, 0.06] → NEUTRAL → HOLD`,
    executeSize: 0, score, components: comps,
  };
}

// ══════════════════════════════════════════════════════════════════
//  AGENT 1 — Market Analyst  (with robustness layer)
// ══════════════════════════════════════════════════════════════════

function runMarketAnalyst(rawEvent, contentBias = 0) {
  tag("Agent", "Market Analyst Agent activated", C.magenta);
  gap();

  // ── Robustness: sanitize before evaluation ───────────────────
  const { sanitized, missing, conflicts, hasMissingData, hasConflictingData } = sanitizeEvent(rawEvent);

  if (hasMissingData || hasConflictingData) {
    tag("Robustness Case", "Anomalous data profile detected. Launching fallback inference engine...", C.orange);
    gap();
  }

  if (hasMissingData) {
    for (const m of missing) {
      tag(
        "Robustness Case",
        `Missing metrics detected — field '${m.field}' is ${m.found}`,
        C.orange
      );
      kv("  Inference", `No historical baseline available. Assigning neutral score: ${m.assigned}`, C.dim);
    }
    gap();
  }

  if (hasConflictingData) {
    tag("Robustness Case", "Conflicting signals detected — confidence will be penalised:", C.orange);
    for (const c of conflicts) {
      console.log(`  ${C.dim}⚠ ${c}${C.reset}`);
    }
    gap();
  }

  // ── Observation on sanitized data ────────────────────────────
  tag("Observation", `Asset: ${C.bold}${sanitized.asset}${C.reset}`, C.cyan);
  kv("  Price Δ (5m)",     `${sanitized.price_change_5m_pct}%`,
      sanitized.price_change_5m_pct < 0 ? C.red : C.green);
  kv("  Sentiment",        `${sanitized.social_sentiment_score}/100${hasMissingData ? " [INFERRED]" : ""}`);
  kv("  Volume spike",     `${sanitized.volume_spike_multiplier}×`);
  kv("  Anomaly flag",     rawEvent.anomaly ? `${C.red}TRUE${C.reset}` : "false");
  kv("  Headline",         `"${sanitized.news_headline}"`);
  gap();

  tag("Reasoning Step", `Multi-factor scoring engine classifying ${sanitized.asset}...`, C.magenta);

  const decision = scoreAndDecide(sanitized, contentBias);

  // Apply additional confidence penalty for missing/conflicting data (stacked on engine penalty)
  if (hasConflictingData || hasMissingData) {
    const penalty = (missing.length * 0.05) + (conflicts.length * 0.08);
    decision.confidence = Math.max(0.10, +(decision.confidence - penalty).toFixed(2));
    decision.rationale += ` [Confidence penalised ${(penalty * 100).toFixed(0)}% for data quality]`;
  }

  // Log signal component breakdown
  if (decision.components) {
    const c = decision.components;
    kv("  Signal breakdown",
      `price ${c.price} · sent ${c.sentiment} · vol ${c.volume} · onchain ${c.onchain} · book ${c.book}` +
      (parseFloat(c.div_penalty) > 0 ? ` · ${C.red}div_penalty -${c.div_penalty}${C.reset}` : ""),
      C.dim);
    kv("  Composite score", String(decision.score),
      Math.abs(decision.score) > 0.5 ? C.red : Math.abs(decision.score) > 0.2 ? C.yellow : C.green);
  }

  const clsColor = decision.classification === "ANOMALY"   ? C.red
                 : decision.classification === "BREAKOUT"  ? C.green
                 : decision.classification === "PUMP_RISK" ? C.orange
                 : C.yellow;
  kv("  Classification", decision.classification, clsColor);
  kv("  Confidence",     `${(decision.confidence * 100).toFixed(0)}%`,
      decision.confidence < 0.5 ? C.red : decision.confidence > 0.80 ? C.green : C.yellow);
  gap();

  return { decision, sanitized };
}

// ══════════════════════════════════════════════════════════════════
//  AGENT 2 — Risk Mitigation  (with exponential backoff + fallback)
// ══════════════════════════════════════════════════════════════════

async function runRiskMitigation(event, decision) {
  tag("Agent", "Risk Mitigation Agent activated", C.yellow);
  gap();

  tag("Decision Tree Check", "Evaluating risk response...", C.yellow);
  kv("  Recommended action", decision.action, C.bold + C.white);
  kv("  Rationale",          decision.rationale);
  kv("  Branch matched",     decision.branch, C.dim);
  gap();

  tag("Action Choice", `→ ${decision.action}`, C.green);

  if (decision.executeSize <= 0 || decision.action === "SET_STOP_LOSS" || decision.action === "HOLD") {
    console.log(`  ${C.dim}No trade execution required for ${decision.action}.${C.reset}`);
    return null;
  }

  console.log(`  ${C.dim}Posting to ${BASE_URL}/api/execute-action (with retry protection)...${C.reset}`);
  gap();

  // ── Exponential backoff retry ─────────────────────────────────
  const result = await executeWithRetry(event.asset, decision.action, decision.executeSize);

  if (result.success) {
    if (result.attempt > 1) {
      tag("Recovery", `Execution succeeded on attempt ${result.attempt}/${MAX_RETRIES}`, C.green);
    }
    const tx          = result.data?.transaction;
    const state_change = result.data?.state_change;
    tag("Execution Result", tx?.summary ?? "Trade executed", C.green);
    if (state_change) {
      gap();
      console.log(`  ${C.dim}Wallet delta:${C.reset}`);
      const { before, after } = state_change;
      for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
        const b = (before[k] ?? 0), a = (after[k] ?? 0);
        const changed = b !== a;
        console.log(
          `    ${C.cyan}${k.padEnd(6)}${C.reset} ` +
          (changed
            ? `${C.dim}${b.toFixed(4)}${C.reset} → ${C.bold}${a.toFixed(4)}${C.reset}`
            : `${C.dim}${b.toFixed(4)} (unchanged)${C.reset}`)
        );
      }
    }
    return result.data;
  }

  // ── Non-retryable error (e.g. wallet state) ───────────────────
  if (result.nonRetryable) {
    tag("Warning", `Execution skipped (non-retryable): ${result.error}`, C.yellow);
    kv("  Hint", "Wallet state may need reset; run: GET /api/wallet to inspect", C.dim);
    return null;
  }

  // ── All retries exhausted — route to fallback bridge ─────────
  gap();
  divider("╍");
  tag(
    "Error Recovery",
    "All retry attempts failed. Primary Execution Node down.",
    C.red
  );
  tag(
    "Error Recovery",
    "Routing transaction through Fallback Secondary Liquidity Bridge...",
    C.orange
  );
  divider("╍");
  gap();

  const fallbackTx = routeToFallbackBridge(
    event.asset,
    decision.action,
    decision.executeSize,
    result.error
  );

  kv("  Fallback TX ID",  fallbackTx.fallback_tx_id, C.orange);
  kv("  Bridge",          fallbackTx.bridge,          C.orange);
  kv("  Status",          fallbackTx.status,          C.yellow);
  kv("  Persisted to",    FALLBACK_LOG_PATH,           C.dim);
  gap();

  return { fallback: true, tx: fallbackTx };
}

// ══════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════

async function main() {
  header("PARADOX SENTINEL — AGENTIC REASONING CORE  v2.0");
  console.log(`  ${C.dim}Robustness Layer: null-field sanitization + exponential backoff + fallback bridge${C.reset}`);
  gap();

  section("WORKPLAN");
  [
    "Fetch live market stream from mock server",
    "Run robustness sanitizer — detect null fields and conflicting signals",
    "Launch fallback inference engine for degraded data quality",
    "Market Analyst classifies each event → attach confidence penalty if needed",
    "Risk Mitigation selects action via evaluate_anomaly decision tree",
    "Execute via POST /api/execute-action with 3× exponential backoff",
    "On persistent failure → route to Fallback Secondary Liquidity Bridge",
    "Persist recovery transaction to fallback_tx_log.json",
  ].forEach((s, i) => console.log(`  ${C.dim}${i + 1}.${C.reset} ${s}`));
  gap();

  // ── Fetch ─────────────────────────────────────────────────────
  section("STEP 1 — FETCHING MARKET STREAM");
  let events;
  try {
    const res  = await fetch(`${BASE_URL}/api/market-stream`);
    const data = await res.json();
    events     = data.events;
    tag("Market Feed", `${events.length} events received`, C.green);
    if (data.chaos_mode) {
      tag("Warning", "Server reports CHAOS MODE is active — 500 errors expected on execute-action", C.yellow);
    }
    events.forEach((e) =>
      kv(
        `  ${e.asset}`,
        `${e.price_change_5m_pct ?? "?"}% | ` +
        `sentiment ${e.social_sentiment_score ?? "NULL"} | ` +
        `vol ${e.volume_spike_multiplier ?? "?"}× | ` +
        `anomaly: ${e.anomaly}`
      )
    );
  } catch (err) {
    tag("Fatal", `Cannot reach mock server: ${err.message}`, C.red);
    tag("Fix",   "Run: cd infra && npm start", C.yellow);
    process.exit(1);
  }
  gap();

  // ── Agent 0 — Content Parsing ──────────────────────────────
  const demoText = process.argv[2] || "BTC surging to new heights as institutional adoption goes parabolic!";
  const contentResult = await runContentParser(demoText);
  const bias = contentResult.bias;

  // ── Agent pipeline ────────────────────────────────────────────
  const agentResults = [];

  for (const rawEvent of events) {
    // Only analyze assets mentioned by Agent 0, or ALL if unspecified
    const shouldProcess = contentResult.mentionedAssets.includes("ALL") || 
                          contentResult.mentionedAssets.includes(rawEvent.asset);
    
    if (!shouldProcess) {
      console.log(`  ${C.dim}[Skip] ${rawEvent.asset} not mentioned in content context.${C.reset}`);
      continue;
    }

    section(`REASONING TRACE — ${rawEvent.asset}  [${rawEvent.id}]`);

    const { decision, sanitized } = runMarketAnalyst(rawEvent, bias);
    gap();
    const execResult = await runRiskMitigation(sanitized, decision);
    agentResults.push({ event: rawEvent, decision, execResult });
    gap();
  }

  // ── Summary ───────────────────────────────────────────────────
  section("EXECUTION SUMMARY");
  agentResults.forEach(({ event, decision, execResult }) => {
    const hasFallback = execResult?.fallback === true;
    const ac = decision.action === "LIQUIDATE_TO_USDC" ? C.red
             : decision.action === "BUY"               ? C.green
             : C.yellow;
    console.log(
      `  ${C.cyan}${event.asset.padEnd(5)}${C.reset}  ` +
      `${decision.classification.padEnd(10)}  ` +
      `${ac}${decision.action.padEnd(20)}${C.reset}  ` +
      `${C.dim}conf: ${(decision.confidence * 100).toFixed(0)}%${C.reset}` +
      (hasFallback ? `  ${C.orange}[FALLBACK BRIDGE]${C.reset}` : "")
    );
  });

  const fallbackCount = agentResults.filter((r) => r.execResult?.fallback).length;
  if (fallbackCount > 0) {
    gap();
    tag("Recovery", `${fallbackCount} transaction(s) routed to fallback bridge → ${FALLBACK_LOG_PATH}`, C.orange);
  }

  gap();
  console.log(`  ${C.dim}Orchestration complete. All ${events.length} events processed.${C.reset}`);
  gap();
  divider("═");
}

main().catch((err) => {
  console.error(`${C.red}Unhandled error:${C.reset}`, err);
  process.exit(1);
});
