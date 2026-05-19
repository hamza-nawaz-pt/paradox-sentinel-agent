# Paradox Sentinel — Multi-Agent Team

## Architecture Overview

Two specialized agents operate as a pipeline: the **Market Analyst** observes and classifies,
the **Risk Mitigator** decides and acts. The orchestrator routes data between them and maintains
a shared reasoning trace.

---

## Agent 1 — Market Analyst

**Role:** Observer & Classifier

**Responsibilities:**
- Ingest raw market stream events from `/api/market-stream`
- Evaluate price momentum, volume spikes, and social sentiment scores
- Classify each event as one of: `STABLE`, `BREAKOUT`, or `ANOMALY`
- Attach a structured observation payload to the shared context for downstream agents

**Inputs:**
- `current_price`, `price_change_5m_pct`, `volume_24h`
- `social_sentiment_score` (1–100 scale)
- `news_headline`, `on_chain.whale_sell_pressure`

**Outputs (passed to Risk Mitigator):**
```json
{
  "classification": "ANOMALY | BREAKOUT | STABLE",
  "confidence": 0.0–1.0,
  "flags": ["sentiment_crash", "volume_spike", "price_freefall"],
  "observation_summary": "<human-readable reasoning>"
}
```

**Skill used:** `evaluate_anomaly`

---

## Agent 2 — Risk Mitigation Agent

**Role:** Decision-Maker & Executor

**Responsibilities:**
- Receive classified observations from the Market Analyst
- Evaluate downside risk and portfolio exposure using the decision tree in `evaluate_anomaly/SKILL.md`
- Select and execute one of: `BUY`, `SELL`, `LIQUIDATE_TO_USDC`, `SET_STOP_LOSS`, `HEDGE`, or `HOLD`
- POST the chosen action to `/api/execute-action` and record before/after wallet state

**Inputs:**
- Market Analyst classification payload
- Current wallet state from `/api/wallet`

**Outputs:**
```json
{
  "action_taken": "LIQUIDATE_TO_USDC | BUY | HOLD | ...",
  "rationale": "<human-readable justification>",
  "execution_result": { "before": {}, "after": {} }
}
```

**Skill used:** `evaluate_anomaly` (decision branch)

---

## Orchestration Flow

```
market-stream
      ↓
[Market Analyst Agent]
  → classify event
  → attach observation
      ↓
[Risk Mitigation Agent]
  → evaluate risk
  → select action
  → execute via POST /api/execute-action
      ↓
[Reasoning Trace Log]
  → workplan + step-by-step trace printed to console
```
