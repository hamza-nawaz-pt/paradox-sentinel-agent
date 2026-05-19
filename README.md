# Paradox Sentinel

**Google AI Seekho Hackathon — Challenge 1: Autonomous Content-to-Action Agent**

Paradox Sentinel is a multi-agent crypto intelligence system that ingests unstructured market content, analyzes live simulated market data, and autonomously executes risk-weighted trading decisions — all inside a React Native mobile app with a real-time terminal interface.

**Live App:** https://paradox-sentinal-hamza.netlify.app
**Backend API:** https://paradox-sentinel-agent.onrender.com

---

## What It Does

A user pastes any unstructured text (news article, market report, tweet thread) into the app. Three autonomous agents process it end-to-end:

1. **Agent 0 — Content Parser** reads the text, extracts sentiment, risk signals, and asset mentions using AFINN NLP
2. **Agent 1 — Market Analyst** fetches the live simulated market stream, sanitizes missing/conflicting data, and runs a multi-factor scoring engine combining price momentum, volume, order book, on-chain signals, and the content bias from Agent 0
3. **Agent 2 — Risk Mitigation** evaluates the decision, sizes the position dynamically, executes the trade against a simulated wallet with balance validation, and retries failed executions with exponential backoff

All of this streams live into a terminal UI showing every reasoning step, score breakdown, decision branch, and wallet delta.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  MOBILE APP (Expo Web)               │
│                                                      │
│  Dashboard Tab          Agent Tab                    │
│  ─────────────          ──────────                   │
│  Live market feed       ┌─ AGENT 0: Content Parser ─┐│
│  Portfolio value        │  AFINN NLP + crypto vocab  ││
│  Signal cards           │  Sentiment / risk / bias   ││
│  Anomaly detection      └───────────┬────────────────┘│
│                                     ▼                 │
│                         ┌─ AGENT 1: Market Analyst ─┐ │
│                         │  Fetch market stream       │ │
│                         │  Robustness sanitizer      │ │
│                         │  Multi-factor scoring      │ │
│                         │  Pump-and-dump detection   │ │
│                         └───────────┬───────────────┘ │
│                                     ▼                 │
│                         ┌─ AGENT 2: Risk Mitigation ┐ │
│                         │  Dynamic position sizing   │ │
│                         │  Execute trade / hedge     │ │
│                         │  Exponential backoff (3×)  │ │
│                         │  Fallback liquidity bridge │ │
│                         └───────────────────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP
                       ▼
          ┌─────────────────────────┐
          │   Backend (Node.js)     │
          │   Render.com            │
          │                         │
          │  /api/market-stream     │
          │  /api/execute-action    │
          │  /api/parse-content     │
          │  /api/wallet            │
          │  /api/toggle-chaos      │
          └─────────────────────────┘
```

---

## Agents

### Agent 0 — Content Parser
Ingests any unstructured text and produces structured trading signals.

- **Engine:** AFINN sentiment library extended with 60+ crypto-specific terms (`rugpull: -5`, `etf: +2`, `bullish: +3`, etc.)
- **Output:** asset mentions (BTC/ETH/SOL), sentiment (BULLISH/BEARISH/NEUTRAL), risk level (NORMAL/ELEVATED/CRITICAL), keyword list, and a `bias` float in [-0.45, +0.45]
- **How bias is used:** added directly to the composite score in Agent 1, shifting buy/sell thresholds based on content context
- **Fallback:** if the NLP engine fails, keyword matching takes over client-side

### Agent 1 — Market Analyst
Processes live market events through a multi-stage pipeline.

**Robustness Sanitizer** — before scoring, validates every field:
- Null `social_sentiment_score` → assigned neutral value (50), logged
- Null `volume_spike_multiplier` → assigned 1.0, logged
- Conflicting signals (e.g. +15% price with 0.3× volume = pump risk) → flagged, confidence penalised

**Multi-Factor Scoring Engine:**

| Factor | Weight | Rationale |
|--------|--------|-----------|
| Volume spike | 0.28 | Volume leads price in crypto — strongest leading indicator |
| Price momentum | 0.25 | 5-minute price change, normalized |
| Order book | 0.20 | Spread + bid depth collapse = microstructure signal |
| On-chain | 0.17 | Whale sell pressure + exchange inflow |
| Social sentiment | 0.10 | Lagging, noisy — lowest weight |

Composite score range: [-1.0, +1.0]. Content bias from Agent 0 is added on top.

**Pump-and-Dump Detection:** if price > +10% AND volume < 0.5× AND spread > 5% → classified as PUMP_RISK regardless of score, trade blocked.

### Agent 2 — Risk Mitigation
Takes the score and classification from Agent 1 and decides action + size.

| Score Range | Action |
|-------------|--------|
| > 0.38 | BUY — size scaled 5%–30% of portfolio |
| 0.06 – 0.38 | BUY — smaller accumulation size 3%–12% |
| -0.20 – 0.06 | HOLD |
| -0.50 – -0.20 | HEDGE — put option, 2% premium |
| < -0.50 | LIQUIDATE or SET_STOP_LOSS |
| ANOMALY flag | LIQUIDATE_TO_USDC (emergency exit) |
| PUMP_RISK flag | HOLD (blocked) |

**Execution with exponential backoff:**
- Attempt 1: immediate
- Attempt 2: 1s delay (2⁰ × 1000ms)
- Attempt 3: 2s delay (2¹ × 1000ms)
- All 3 fail → Fallback Secondary Liquidity Bridge (transaction queued, logged to fallback_tx_log.json)

---

## Key Features

### Chaos Mode
Toggle from the Agent tab to inject HTTP 500 errors into `/api/execute-action`. Watch Agent 2's retry and fallback recovery logic execute in real time in the terminal.

### Sentinel Mode
Autonomous background monitor — polls the market stream every 5 seconds. When price moves > 8% or an anomaly is flagged, automatically triggers a full agent pipeline run without user input. Demonstrates true autonomous operation.

### Real-Time Terminal UI
Every agent step streams into a colour-coded terminal:
- Teal = system / headers
- Blue = observations
- White = reasoning
- Amber = decisions
- Purple = scores
- Green = success / buys
- Red = errors / sells
- Orange = robustness / recovery

---

## Simulated Wallet

Starts with $10,000 USDC + small BTC/ETH/SOL holdings. All trades execute with real logic:
- BUY: deducts USDC, credits asset
- SELL: deducts asset, credits USDC
- LIQUIDATE_TO_USDC: converts entire holding to USDC at current price
- HEDGE: deducts 2% put option premium from USDC
- Balance validation: insufficient funds returns HTTP 400 (not silently ignored)

Portfolio value updates live as mock prices drift every 8 seconds.

---

## Mock Market Scenarios

`infra/mock_market_data.json` contains hand-crafted scenarios designed to trigger every decision branch:

| Asset | Scenario | Triggers |
|-------|----------|---------|
| SOL | Flash crash + anomaly flag | LIQUIDATE_TO_USDC |
| FAKE | Pump-and-dump pattern | PUMP_RISK block |
| BTC | Normal drifting | HOLD / BUY depending on drift |
| ETH | Normal drifting | HOLD / BUY depending on drift |

Prices drift every 8 seconds with slight randomness so repeated runs produce different scores.

---

## API Reference

**Backend: `https://paradox-sentinel-agent.onrender.com`**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/market-stream` | Live simulated market events (BTC, ETH, SOL, FAKE) |
| POST | `/api/execute-action` | Execute trade `{ asset, action, size }` |
| POST | `/api/parse-content` | NLP parse text `{ text }` → signals |
| GET | `/api/wallet` | Current balances + portfolio value |
| GET | `/api/toggle-chaos` | Flip chaos mode on/off |
| GET | `/api/reset-market` | Restore original market scenario |
| GET | `/api/tx-log` | Full transaction history |
| GET | `/health` | Server health check |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile app | React Native + Expo Router (web target) |
| UI | React Native Web, Animated API, custom terminal renderer |
| State | React Context + custom `useMarketData` hook (3s polling) |
| Backend | Node.js + Express |
| NLP | AFINN sentiment library + crypto vocabulary extension |
| Deployment — Frontend | Netlify (static Expo web build) |
| Deployment — Backend | Render.com (Node.js web service) |

---

## Running Locally

```bash
# Clone
git clone https://github.com/hamza-nawaz-pt/paradox-sentinel-agent.git
cd paradox-sentinel-agent

# Install all dependencies
npm install

# Start both backend and frontend
npm run dev
# Backend → http://localhost:3001
# Frontend → http://localhost:8081
```

Requires Node.js 18+.

---

## Project Structure

```
paradox-sentinel-agent/
├── infra/
│   ├── mock_server.js          # Express backend — market stream, wallet, NLP
│   ├── mock_market_data.json   # Hand-crafted demo scenarios
│   └── package.json
├── mobile/
│   ├── app/
│   │   ├── _layout.tsx         # Root layout + error boundary
│   │   └── (tabs)/
│   │       ├── index.tsx       # Dashboard — portfolio, signals, market cards
│   │       ├── agent.tsx       # 3-agent pipeline terminal
│   │       └── alerts.tsx      # Alert feed
│   ├── contexts/
│   │   └── MarketContext.tsx   # Global market state provider
│   ├── hooks/
│   │   └── useMarketData.ts    # Polling hook, wallet state, executeAction
│   └── package.json
└── package.json                # Root dev script (concurrently)
```
