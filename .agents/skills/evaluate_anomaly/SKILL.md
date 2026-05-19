---
name: evaluate_anomaly
version: 1.0.0
description: "Analyzes market stream anomalies and determines structured risk responses."
agents:
  - market_analyst
  - risk_mitigation
inputs:
  - price_change_5m_pct: number   # % price change over last 5 minutes
  - social_sentiment_score: number # 1–100; below 30 = crashing, above 60 = bullish
  - volume_spike_multiplier: number # >3 = significant, >5 = extreme
  - anomaly: boolean
outputs:
  - classification: "STABLE | BREAKOUT | ANOMALY"
  - recommended_action: "BUY | SELL | LIQUIDATE_TO_USDC | SET_STOP_LOSS | HEDGE | HOLD"
  - confidence: number
  - rationale: string
---

# Skill: evaluate_anomaly

Evaluates a single market event and produces a structured risk response using a
deterministic decision tree, augmented by contextual signals.

---

## Decision Tree

```
ROOT
 │
 ├─ Is anomaly flag set AND price_change_5m_pct < -12 AND sentiment < 30?
 │     YES → [CRITICAL ANOMALY]
 │            Action: LIQUIDATE_TO_USDC
 │            Rationale: Extreme downside velocity + sentiment collapse = capital preservation required
 │            Confidence: 0.95
 │
 ├─ Is price_change_5m_pct < -12 AND sentiment < 30?  (anomaly flag not set)
 │     YES → [HIGH RISK]
 │            Action: SET_STOP_LOSS
 │            Rationale: Significant drop with low sentiment warrants protective stop
 │            Confidence: 0.80
 │
 ├─ Is price_change_5m_pct between -12 and -5 AND sentiment < 40?
 │     YES → [ELEVATED RISK]
 │            Action: HEDGE
 │            Rationale: Moderate drawdown, weakening sentiment — reduce exposure via hedge
 │            Confidence: 0.70
 │
 ├─ Is social_sentiment_score > 40 AND price_change_5m_pct > -10?
 │     YES → [OPPORTUNITY]
 │            Action: BUY
 │            Rationale: Healthy sentiment + price above crash threshold = accumulation signal
 │            Confidence: 0.75
 │
 ├─ Is price_change_5m_pct > 2 AND sentiment > 60 AND volume_spike_multiplier > 1.5?
 │     YES → [BREAKOUT]
 │            Action: BUY
 │            Rationale: Momentum breakout with high sentiment and volume confirmation
 │            Confidence: 0.85
 │
 └─ None of the above
       → [STABLE / NEUTRAL]
          Action: HOLD
          Rationale: No actionable signal detected; maintain current positions
          Confidence: 0.60
```

---

## Sentiment Reference Scale

| Score | Label | Interpretation |
|-------|-------|----------------|
| 0–20 | Panic | Capitulation — extreme fear, likely forced selling |
| 21–30 | Crashing | Sentiment collapse — anomaly likely |
| 31–50 | Bearish | Caution zone — watch for deterioration |
| 51–70 | Neutral/Bullish | Normal market conditions |
| 71–100 | Euphoric | Greed zone — breakout or blow-off top risk |

---

## Notes

- This skill is stateless — it does not track prior events.
- The orchestrator is responsible for passing enriched event data matching the input schema.
- Decision tree branches are evaluated top-to-bottom; first match wins.
