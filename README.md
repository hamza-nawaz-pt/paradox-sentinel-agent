# Paradox Sentinel

**Google AI Seekho Hackathon — Challenge 1: Autonomous Content-to-Action Agent**

Paradox Sentinel is a multi-agent autonomous crypto intelligence platform. It ingests unstructured market content, analyzes live simulated market data through a 3-agent reasoning pipeline, and autonomously executes risk-weighted trading decisions — displayed in a professional real-time dashboard built with React and Vite.

**Live App:** https://paradox-sentinal-hamza.netlify.app  
**Backend API:** https://paradox-sentinel-agent.onrender.com

---

## What It Does

A user pastes any unstructured text (news article, market report, tweet thread) into the app. Three autonomous agents process it end-to-end:

1. **Agent 0 — Content Parser** reads the text, extracts sentiment, risk signals, and asset mentions using AFINN NLP extended with 60+ crypto-specific terms
2. **Agent 1 — Market Analyst** fetches the live simulated market stream, sanitizes missing/conflicting data, and runs a 5-factor scoring engine combining price momentum, volume, on-chain signals, social sentiment, and order book health
3. **Agent 2 — Risk Mitigation** evaluates the score, sizes the position dynamically, executes the trade with exponential backoff retry, and routes to a Fallback Secondary Liquidity Bridge on total failure

Every reasoning step, score breakdown, decision branch, and wallet delta streams live into a color-coded terminal. A full analytics dashboard, AI chat assistant, and alert feed run alongside.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│               WEB DASHBOARD (React + Vite)                 │
│                                                            │
│  Dashboard      Agent Core       Analytics                 │
│  ──────────     ──────────       ───────────               │
│  Portfolio      ┌─ AGENT 0 ──┐  Live scores per asset     │
│  Live prices    │ AFINN NLP  │  Portfolio value chart      │
│  Signal feed    │ Bias calc  │  5-factor radar chart       │
│  Stat cards     └─────┬──────┘  Decision distribution     │
│                       ▼         Trade history table        │
│  Alerts         ┌─ AGENT 1 ──┐                            │
│  ──────────     │ Fetch mkt  │  AI Chat                   │
│  Auto-detect    │ Sanitize   │  ──────────                 │
│  anomaly feed   │ Score(×5)  │  Context-aware assistant   │
│  Pump-risk      │ P&D detect │  Reads live market state   │
│  alerts         └─────┬──────┘  No API key required       │
│                       ▼                                    │
│                 ┌─ AGENT 2 ──┐                            │
│                 │ Size pos.  │                            │
│                 │ Execute    │                            │
│                 │ Backoff 3× │                            │
│                 │ Fallback   │                            │
│                 └────────────┘                            │
└───────────────────────┬────────────────────────────────────┘
                        │ HTTP (3s poll)
                        ▼
          ┌──────────────────────────────┐
          │   Backend (Node.js/Express)  │
          │   Render.com                 │
          │                              │
          │  /api/market-stream          │
          │  /api/execute-action         │
          │  /api/parse-content (AFINN)  │
          │  /api/chat (AI assistant)    │
          │  /api/wallet                 │
          │  /api/toggle-chaos           │
          │  /api/tx-log                 │
          └──────────────────────────────┘
```

---

## Dashboard Pages

### Dashboard
- Portfolio hero card with animated value counter and asset allocation bars
- 4 live stat cards: anomalies detected, buy signals, avg 5M move, assets tracked
- Asset cards (BTC/ETH/SOL/FAKE) with real-time sparkline charts and signal badges
- Signal feed table ranked by threat level with classification and action labels

### Agent Core
- 3-step pipeline tracker showing active agent in real time
- Content input area — paste any unstructured text to feed Agent 0
- Full color-coded terminal streaming every reasoning step
- Chaos Mode toggle (injects HTTP 500) and Sentinel Mode toggle (autonomous 5s polling)

### Analytics
- Market health strip: avg score, bullish/bearish count, avg 5M move, anomaly count
- Live Agent Score bars per asset — computed composite score with action label
- Portfolio value area chart (builds from live 3s snapshots)
- 5-factor scoring radar chart + individual factor bars with weights
- Asset performance horizontal bars (live 5M % change)
- Decision distribution donut chart with per-action breakdown
- Full transaction history table

### AI Chat
- Context-aware assistant that reads live market data, wallet state, and trade log
- Responds to questions about market conditions, scoring logic, recent decisions, risk levels
- Suggested prompts for quick exploration
- Works entirely without an external API key — server reads live state to generate responses

### Alerts
- Automatically detects anomalies, pump-risk patterns, and critical drops from the market stream
- Each alert shows asset, type, price change, and message
- Unread badge count in sidebar navigation

---

## Agents

### Agent 0 — Content Parser
Ingests any unstructured text and produces structured trading signals.

- **Engine:** AFINN sentiment library extended with 60+ crypto-specific terms (`rugpull: -5`, `etf: +2`, `bullish: +3`, etc.)
- **Output:** asset mentions (BTC/ETH/SOL), sentiment (BULLISH/BEARISH/NEUTRAL), risk level (NORMAL/ELEVATED/CRITICAL), keyword list, and a `bias` float in [-0.45, +0.45]
- **How bias is used:** added directly to the composite score in Agent 1, shifting buy/sell thresholds based on content context
- **Fallback:** if the NLP endpoint is unreachable, keyword matching runs client-side

### Agent 1 — Market Analyst
Processes live market events through a multi-stage pipeline.

**Robustness Sanitizer** — before scoring, validates every field:
- Null `social_sentiment_score` → assigned neutral value (50), logged
- Null `volume_spike_multiplier` → assigned 1.0, logged
- Conflicting signals (e.g. +15% price with 0.3× volume = pump risk) → flagged, confidence penalised

**Multi-Factor Scoring Engine (v4.0):**

| Factor | Weight | Rationale |
|--------|--------|-----------|
| **Price Momentum** | 0.28 | Trend indicator; breakout signal |
| **Volume Spike** | 0.26 | Primary confirmation; validates that price moves are real |
| **On-Chain** | 0.20 | Whale dynamics (harder to manipulate than social data) |
| **Social Sentiment** | 0.16 | Secondary context (AFINN/NLP); reduced to lower noise |
| **Order Book** | 0.10 | Micro-liquidity and bid-ask spread health |

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
- All 3 fail → Fallback Secondary Liquidity Bridge (transaction queued, logged to `fallback_tx_log.json`)

---

## Key Features

### Chaos Mode
Toggle from the sidebar or Agent tab to inject HTTP 500 errors into `/api/execute-action`. Simulates rate limiting and liquidity pool timeouts. Watch Agent 2's retry and fallback recovery logic execute in real time in the terminal.

### Sentinel Mode
Autonomous background monitor — polls the market stream every 5 seconds. When price moves > 8% or an anomaly is flagged, automatically triggers a full agent pipeline run without user input. Demonstrates true autonomous operation.

### AI Chat Assistant
Ask the built-in assistant anything about what Sentinel is doing. It reads live market prices, wallet balances, trade history, and agent state to give contextual, data-grounded answers. No external API key required.

### Real-Time Terminal
Every agent step streams into a color-coded terminal:
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
- **BUY:** deducts USDC, credits asset
- **SELL:** deducts asset, credits USDC
- **LIQUIDATE_TO_USDC:** converts entire holding to USDC at current price
- **HEDGE:** deducts 2% put option premium from USDC
- **SET_STOP_LOSS:** advisory, no immediate execution
- Balance validation: insufficient funds returns HTTP 400

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

Prices drift every 8 seconds with a slight bullish bias so repeated runs produce different scores.

---

## API Reference

**Backend: `https://paradox-sentinel-agent.onrender.com`**

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/market-stream` | — | Live simulated market events with current prices |
| POST | `/api/execute-action` | `{ asset, action, size }` | Execute BUY / SELL / LIQUIDATE / HEDGE / STOP_LOSS |
| POST | `/api/parse-content` | `{ text }` | AFINN NLP parse → sentiment, risk, bias |
| POST | `/api/chat` | `{ message }` | AI assistant — reads live market state |
| GET | `/api/wallet` | — | Current balances + portfolio value |
| GET | `/api/tx-log` | — | Full transaction history |
| GET | `/api/toggle-chaos` | — | Flip chaos mode on/off |
| GET | `/api/reset-market` | — | Restore original scenario |
| GET | `/health` | — | Server health check |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS v3 |
| Charts | Recharts (line, area, bar, pie, radar) |
| Animations | Framer Motion |
| Icons | Lucide React |
| Backend | Node.js + Express |
| NLP | AFINN sentiment library + crypto vocabulary extension |
| Deployment — Frontend | Netlify (static Vite build) |
| Deployment — Backend | Render.com (Node.js web service) |

---

## Quick Start

```bash
# Clone
git clone https://github.com/hamza-nawaz-pt/paradox-sentinel-agent.git
cd paradox-sentinel-agent

# Start backend
cd infra && npm install && npm start
# → http://localhost:3001

# Start frontend (new tab)
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

**Build for deployment:**
```bash
cd frontend && npm run build
# Output: frontend/dist/  — drag to Netlify
```

Requires Node.js 18+.

---

## Project Structure

```
paradox-sentinel-agent/
├── infra/
│   ├── mock_server.js          # Express backend — market, wallet, NLP, chat
│   ├── mock_market_data.json   # Hand-crafted demo scenarios
│   └── package.json
├── frontend/                   # React + Vite web dashboard
│   ├── src/
│   │   ├── App.tsx             # Root layout + tab router
│   │   ├── types.ts            # Shared TypeScript types
│   │   ├── api.ts              # API layer
│   │   ├── lib/
│   │   │   └── agent.ts        # Scoring engine + sanitizer (client-side)
│   │   ├── store/
│   │   │   └── MarketContext.tsx  # Global state + 3s polling
│   │   ├── components/
│   │   │   └── layout/
│   │   │       └── Sidebar.tsx
│   │   └── pages/
│   │       ├── Dashboard.tsx   # Portfolio, asset cards, signal feed
│   │       ├── Agent.tsx       # 3-agent pipeline terminal
│   │       ├── Analytics.tsx   # Charts, scores, trade history
│   │       ├── Chat.tsx        # AI assistant
│   │       └── Alerts.tsx      # Anomaly alert feed
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
├── agent/
│   ├── antigravity_trace_logs.md       # Normal pipeline run trace
│   └── antigravity_chaos_trace_logs.md # Chaos mode + fallback trace
└── package.json
```

---

## Future Roadmap
- [ ] **Real-world Integration:** Replace mock data with live CoinGecko or Binance API streams
- [ ] **On-chain Execution:** Integration with `@solana/web3.js` for devnet trade execution
- [ ] **LLM Upgrade:** Replace rule-based chat with Gemini Flash for deeper contextual reasoning
- [ ] **Multi-user:** Persistent wallet state with user authentication
