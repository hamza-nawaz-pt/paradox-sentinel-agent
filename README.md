# Paradox Sentinel

**Google AI Seekho Hackathon — Challenge 1**

An AI-powered market anomaly detection system with a React Native mobile app, a mock market data backend, and an Antigravity orchestration layer that evaluates and dispatches real-time alerts.

---

## Project Structure

```
paradox-sentinel-agent/
├── infra/                        # Mock market backend (Node.js REST API)
│   ├── mock_market_data.json     # Simulated market anomalies (6 scenarios)
│   ├── mock_server.js            # REST server on :3001
│   └── package.json
├── agent/                        # Antigravity orchestration layer
│   ├── orchestrator.js           # Polls infra, scores anomalies, streams SSE on :3002
│   └── package.json
└── mobile/                       # Expo React Native app
    ├── app/
    │   ├── _layout.tsx           # Root layout (dark theme, fonts)
    │   ├── (tabs)/
    │   │   ├── _layout.tsx       # Tab navigator
    │   │   ├── index.tsx         # Dashboard — anomaly list + market summary
    │   │   ├── alerts.tsx        # Live SSE alert stream from orchestrator
    │   │   └── agent.tsx         # Architecture info & API reference
    │   └── anomaly/[id].tsx      # Anomaly detail screen
    ├── app.json
    ├── babel.config.js
    ├── package.json
    └── tsconfig.json
```

---

## Quick Start

### 1. Start the mock market server
```bash
cd infra
node mock_server.js
# → http://localhost:3001
```

### 2. Start the Antigravity orchestrator
```bash
cd agent
node orchestrator.js
# → SSE stream at http://localhost:3002/stream
```

### 3. Run the mobile app
```bash
cd mobile
npm install
npx expo start
# Scan QR with Expo Go, or press 'a' for Android emulator
```

---

## Mock Market Data — Anomaly Schema

`infra/mock_market_data.json` contains 6 simulated market anomalies:

| ID | Symbol | Type | Severity | Change |
|----|--------|------|----------|--------|
| ANO-001 | NVDA | price_crash | critical | -15% |
| ANO-002 | TSLA | volume_breakout | high | +14.2% |
| ANO-003 | SIVBQ | liquidity_crisis | high | -35% |
| ANO-004 | AAPL | unusual_options_activity | medium | +1.8% |
| ANO-005 | GME | flash_spike | medium | +25% |
| ANO-006 | XLE | sector_rotation | low | +7.1% |

Each anomaly contains: price data, volume metrics, technical indicators (RSI, MACD, Bollinger), order book snapshot, contextual triggers, and AI agent signals.

---

## API Reference

### Mock Server `:3001`
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/anomalies` | All anomalies — filterable by `?severity=`, `?type=`, `?action=` |
| GET | `/anomalies/:id` | Single anomaly by ID or symbol |
| GET | `/summary` | Market indices & breadth data |
| GET | `/health` | Health check |

### Orchestrator `:3002`
| Type | Endpoint | Description |
|------|----------|-------------|
| SSE | `/stream` | Live alert stream — subscribe for real-time dispatches |
| GET | `/health` | Connected client count |

---

## Architecture

```
mock_market_data.json
        ↓
mock_server.js (:3001) — REST API
        ↓  (polls every 8s)
orchestrator.js (:3002) — scores + routes anomalies
        ↓  (SSE stream)
Expo Mobile App — Dashboard, Alerts, Agent tabs
```
