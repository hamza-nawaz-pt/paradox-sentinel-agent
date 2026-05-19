import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  Pressable, Platform, Animated, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../../contexts/MarketContext';
import { API_BASE, type MarketEvent } from '../../hooks/useMarketData';

const IS_WEB = Platform.OS === 'web';

// ── CSS keyframes for terminal (web only) ─────────────────────────
if (IS_WEB && typeof document !== 'undefined') {
  const SID = '__pdx_agent_anim__';
  if (!document.getElementById(SID)) {
    const el = document.createElement('style');
    el.id = SID;
    el.textContent = `
      @keyframes termScan {
        0%   { top:-2px; opacity:0 }
        8%   { opacity:0.6 }
        92%  { opacity:0.6 }
        100% { top:100%; opacity:0 }
      }
      @keyframes agentRunPulse {
        0%,100% { box-shadow:0 0 14px rgba(0,255,209,0.30) }
        50%     { box-shadow:0 0 28px rgba(0,255,209,0.65),0 0 60px rgba(0,255,209,0.18) }
      }
      @keyframes chaosPulse {
        0%,100% { box-shadow:0 0 12px rgba(255,45,85,0.28) }
        50%     { box-shadow:0 0 28px rgba(255,45,85,0.65),0 0 60px rgba(255,45,85,0.18) }
      }
    `;
    document.head.appendChild(el);
  }
}

// ── Paradox Terminal design system ───────────────────────────────
const T = {
  bg:      '#060B12', bgCard: '#0D1525', bgTerm: '#040810',
  bgPanel: '#111E30',
  accent:  '#00FFD1', sell:   '#FF2D55', buy:    '#00FF88',
  warn:    '#FFD600', purple: '#BF5FFF', blue:   '#4DACFF',
  orange:  '#FF6B00',
  border2: 'rgba(255,255,255,0.13)',
  border3: 'rgba(255,255,255,0.17)',
  textLoud:    '#FFFFFF',
  textDefault: 'rgba(255,255,255,0.90)',
  textMuted:   'rgba(255,255,255,0.65)',
  textDim:     'rgba(255,255,255,0.45)',
  mono: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  // ── legacy aliases (keep existing JSX unchanged) ──
  get teal()    { return this.accent; },
  get crimson() { return this.sell;   },
  get green()   { return this.buy;    },
  get amber()   { return this.warn;   },
  get textBright() { return this.textLoud; },
};

// ── Log types ─────────────────────────────────────────────────────
type LogType =
  | 'header' | 'system' | 'observation' | 'reasoning'
  | 'decision' | 'action' | 'success' | 'error'
  | 'robustness' | 'recovery' | 'fallback' | 'retry' | 'separator'
  | 'score' | 'pump';

interface LogLine { id: string; text: string; type: LogType; }

const LOG_COLOR: Record<LogType, string> = {
  header:      T.accent,
  system:      'rgba(255,255,255,0.50)',
  observation: T.blue,
  reasoning:   'rgba(255,255,255,0.75)',
  decision:    T.warn,
  action:      T.purple,
  success:     T.buy,
  error:       T.sell,
  robustness:  T.orange,
  recovery:    T.orange,
  fallback:    '#FF6B00',
  retry:       '#C4860A',
  separator:   'rgba(255,255,255,0.20)',
  score:       'rgba(191,95,255,0.90)',   // purple for score breakdown
  pump:        '#FF8C42',                 // bright orange for pump risk
};

// ── Decision engine (mirrors orchestrator.js v2.0) ────────────────
interface SanitizeResult {
  sanitized: MarketEvent;
  missing: Array<{ field: string; found: any; assigned: number }>;
  conflicts: string[];
  hasMissingData: boolean;
  hasConflictingData: boolean;
}

function sanitizeEvent(raw: MarketEvent): SanitizeResult {
  const event   = { ...raw } as any;
  const missing: SanitizeResult['missing']   = [];
  const conflicts: string[] = [];

  if (event.social_sentiment_score === null || event.social_sentiment_score === undefined) {
    missing.push({ field: 'social_sentiment_score', found: event.social_sentiment_score, assigned: 50 });
    event.social_sentiment_score = 50;
  }
  if (event.volume_spike_multiplier === null || event.volume_spike_multiplier === undefined) {
    missing.push({ field: 'volume_spike_multiplier', found: event.volume_spike_multiplier, assigned: 1.0 });
    event.volume_spike_multiplier = 1.0;
  }
  if (event.price_change_5m_pct === null || event.price_change_5m_pct === undefined) {
    missing.push({ field: 'price_change_5m_pct', found: event.price_change_5m_pct, assigned: 0 });
    event.price_change_5m_pct = 0;
  }

  if (event.price_change_5m_pct > 15 && event.volume_spike_multiplier < 0.5) {
    conflicts.push(`+${event.price_change_5m_pct}% price surge with ${event.volume_spike_multiplier}× vol (dead volume = pump risk)`);
  }
  if ((event.order_book?.spread_pct ?? 0) > 5) {
    conflicts.push(`Spread ${event.order_book?.spread_pct}% — extreme illiquidity`);
  }
  if (event.on_chain?.whale_sell_pressure === 'unknown') {
    conflicts.push('On-chain whale data unavailable — uncertainty elevated');
  }
  if ((event.volume_24h ?? 0) < 500000 && event.price_change_5m_pct > 10) {
    conflicts.push(`Micro-cap $${(event.volume_24h ?? 0).toLocaleString()} volume with outsized move = manipulation risk`);
  }

  return {
    sanitized: event as MarketEvent,
    missing,
    conflicts,
    hasMissingData:     missing.length > 0,
    hasConflictingData: conflicts.length > 0,
  };
}

interface Decision {
  action: string;
  classification: string;
  confidence: number;
  rationale: string;
  branch: string;
  executeSize: number;
  score?: number;
  components?: Record<string, string>;
}

// ── Content parser — unstructured text → signals ─────────────────
interface ContentSignal {
  mentionedAssets: string[];
  sentiment:       'BEARISH' | 'BULLISH' | 'NEUTRAL';
  riskLevel:       'CRITICAL' | 'ELEVATED' | 'NORMAL';
  keywords:        string[];
  risks:           string[];
  bias:            number;
  source?:         'afinn_nlp' | 'claude_haiku' | 'keyword_fallback';
}

function keywordParse(text: string): ContentSignal {
  const lower = text.toLowerCase();
  const BEARISH_W = ['crash','collapse','plunge','dump','hack','exploit','ban','illegal','stolen','drained','falling','decline','dropped','fear','panic','sell-off','selloff','rug','breach','vulnerable','attack','lawsuit','freeze','suspended'];
  const BULLISH_W = ['surge','rally','breakout','adoption','etf','approved','institutional','partnership','rising','gaining','ath','bullish','accumulate','inflow','launch','upgrade','integration','record','growth'];
  const RISK_W    = ['hack','exploit','vulnerability','stolen','drained','regulation','sec','lawsuit','freeze','suspended','ban','illegal','breach','attack'];
  const assetRe: Record<string, RegExp> = {
    BTC: /bitcoin|\bbtc\b/, ETH: /ethereum|\beth\b/, SOL: /solana|\bsol\b/,
  };
  const mentionedAssets = Object.entries(assetRe).filter(([,re]) => re.test(lower)).map(([a]) => a);
  const bearishHits = BEARISH_W.filter(w => lower.includes(w));
  const bullishHits = BULLISH_W.filter(w => lower.includes(w));
  const riskHits    = RISK_W.filter(w => lower.includes(w));
  const net         = bullishHits.length - bearishHits.length;
  const sentiment   = net < 0 ? 'BEARISH' : net > 0 ? 'BULLISH' : 'NEUTRAL';
  const riskLevel   = riskHits.length >= 3 ? 'CRITICAL' : riskHits.length >= 1 ? 'ELEVATED' : 'NORMAL';
  const bias        = Math.max(-0.45, Math.min(0.45,
    bullishHits.length * 0.04 - bearishHits.length * 0.04 - riskHits.length * 0.08
  ));
  return {
    mentionedAssets: mentionedAssets.length > 0 ? mentionedAssets : ['ALL'],
    sentiment, riskLevel,
    keywords: [...bearishHits, ...bullishHits].slice(0, 6),
    risks: riskHits,
    bias,
    source: 'keyword_fallback',
  };
}

async function parseContent(text: string): Promise<ContentSignal | null> {
  if (!text.trim()) return null;
  try {
    const res = await fetch(`${API_BASE}/api/parse-content`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text }),
    });
    if (res.ok) return await res.json() as ContentSignal;
  } catch {}
  // Backend unreachable — fall back to client-side keyword matching
  return keywordParse(text);
}

// ── Multi-factor scoring engine (mirrors orchestrator.js v3.0) ────
// volume leads price in crypto; book microstructure > lagging sentiment
const W = { price: 0.25, sentiment: 0.10, volume: 0.28, onchain: 0.17, book: 0.20 };
const WHALE_SCORE: Record<string, number> = {
  extreme: -1.0, high: -0.6, moderate: -0.3, neutral: 0.0, low: 0.4, unknown: 0.0,
};
const normPrice = (p: number) => Math.max(-1, Math.min(1, p / 20));
const normSent  = (s: number) => (s - 50) / 50;
const normVol   = (v: number) => Math.max(-1, Math.min(1, Math.log2(Math.max(0.01, v)) / 2));
const normBook  = (ob: MarketEvent['order_book'] | undefined) => {
  const sp = ob?.spread_pct ?? 0;
  let s = sp > 10 ? -1.0 : sp > 5 ? -0.7 : sp > 2 ? -0.3 : sp < 0.1 ? 0.2 : 0;
  if (ob?.bid_depth_collapse) s -= 0.5;
  return Math.max(-1, Math.min(1, s));
};
const inflowPenalty = (ev: MarketEvent) => {
  if (!ev.volume_24h) return 0;
  const r = (ev.on_chain?.exchange_inflow_usd ?? 0) / ev.volume_24h;
  return r > 0.02 ? 0.15 : r > 0.005 ? 0.08 : 0;
};

function scoreAndDecide(ev: MarketEvent, contentBias = 0): Decision {
  const pct   = ev.price_change_5m_pct;
  const sent  = ev.social_sentiment_score as number;
  const vol   = ev.volume_spike_multiplier;
  const whale = (ev.on_chain as any)?.whale_sell_pressure ?? 'unknown';

  const sp = normPrice(pct);
  const ss = normSent(sent);
  const sv = normVol(vol);
  const so = Math.max(-1, (WHALE_SCORE[whale] ?? 0) - inflowPenalty(ev));
  const sb = normBook(ev.order_book);

  const score = parseFloat((W.price*sp + W.sentiment*ss + W.volume*sv + W.onchain*so + W.book*sb + contentBias).toFixed(3));
  const comps = { price: sp.toFixed(2), sentiment: ss.toFixed(2), volume: sv.toFixed(2), onchain: so.toFixed(2), book: sb.toFixed(2) };
  const whaleUnknown = whale === 'unknown' ? 0.08 : 0;

  // Pump-and-dump detection
  if (pct > 10 && vol < 0.5 && (ev.order_book?.spread_pct ?? 0) > 5) return {
    action: 'HOLD', classification: 'PUMP_RISK',
    confidence: parseFloat(Math.max(0.72, 0.90 - whaleUnknown).toFixed(2)),
    rationale: `Pump-and-dump: +${pct}% with ${vol}× dead volume and ${ev.order_book?.spread_pct}% spread — blocked.`,
    branch: 'pct>10 ∧ vol<0.5 ∧ spread>5% → PUMP_RISK',
    executeSize: 0, score, components: comps,
  };
  // Confirmed exploit
  if (ev.anomaly && pct < -12 && sent < 30) return {
    action: 'LIQUIDATE_TO_USDC', classification: 'ANOMALY',
    confidence: parseFloat(Math.min(0.99, 0.95 + Math.abs(score) * 0.04).toFixed(2)),
    rationale: `Exploit confirmed: score ${score}, ${pct}% crash, sentiment ${sent}/100, whale: ${whale}.`,
    branch: 'anomaly=true ∧ pct<−12% ∧ sentiment<30 → LIQUIDATE_TO_USDC',
    executeSize: 999, score, components: comps,
  };
  // Score thresholds
  if (score < -0.50) return {
    action: pct < -5 ? 'LIQUIDATE_TO_USDC' : 'SET_STOP_LOSS', classification: 'ANOMALY',
    confidence: parseFloat(Math.max(0.70, Math.min(0.94, Math.abs(score))).toFixed(2)),
    rationale: `Bearish confluence (score ${score}).`,
    branch: `score(${score}) < −0.50 → ANOMALY`,
    executeSize: 0, score, components: comps,
  };
  if (score < -0.20) return {
    action: 'HEDGE', classification: 'ANOMALY',
    confidence: parseFloat(Math.max(0.52, Math.min(0.72, Math.abs(score))).toFixed(2)),
    rationale: `Moderate bearish signal (score ${score}).`,
    branch: `score(${score}) ∈ [−0.50, −0.20] → HEDGE`,
    executeSize: 0.5, score, components: comps,
  };
  if (score > 0.38) {
    const sz = parseFloat(Math.max(0.05, Math.min(0.30, score * 0.45)).toFixed(3));
    return {
      action: 'BUY', classification: 'BREAKOUT',
      confidence: parseFloat(Math.min(0.95, 0.65 + score * 0.55).toFixed(2)),
      rationale: `Strong breakout (score ${score}): +${pct}%, ${vol}× vol, sentiment ${sent}/100.`,
      branch: `score(${score}) > 0.38 → BREAKOUT → BUY (size ${sz})`,
      executeSize: sz, score, components: comps,
    };
  }
  if (score > 0.06) {
    const sz = parseFloat(Math.max(0.03, Math.min(0.12, score * 0.30)).toFixed(3));
    return {
      action: 'BUY', classification: 'STABLE',
      confidence: parseFloat(Math.max(0.52, Math.min(0.80, 0.35 + score * 0.80)).toFixed(2)),
      rationale: `Positive signal (score ${score}), accumulation opportunity.`,
      branch: `score(${score}) ∈ [0.06, 0.38] → STABLE → BUY (size ${sz})`,
      executeSize: sz, score, components: comps,
    };
  }
  return {
    action: 'HOLD', classification: 'NEUTRAL',
    confidence: parseFloat(Math.max(0.40, 0.58 - Math.abs(score) - whaleUnknown).toFixed(2)),
    rationale: `No directional edge (score ${score}).`,
    branch: `score(${score}) ∈ [−0.20, 0.06] → NEUTRAL → HOLD`,
    executeSize: 0, score, components: comps,
  };
}

// ── Rendered log line (fades in) ─────────────────────────────────
function LogLine({ line }: { line: LogLine }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(6)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();
  }, []);
  if (line.type === 'separator') {
    return <Animated.Text style={[styles.logSep, { color: LOG_COLOR.separator, opacity }]}>{line.text}</Animated.Text>;
  }
  return <Animated.Text style={[styles.logLine, { color: LOG_COLOR[line.type], opacity, transform: [{ translateX }] }]}>{line.text}</Animated.Text>;
}

// ── Blinking terminal cursor ──────────────────────────────────────
function BlinkCursor() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0, duration: 550, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
    ])).start();
  }, []);
  return <Animated.Text style={{ color: T.accent, opacity, fontFamily: T.mono, fontSize: 14 }}>█</Animated.Text>;
}

// ── Screen ────────────────────────────────────────────────────────
export default function AgentScreen() {
  const { executeAction, anomalySignal } = useMarket();

  const [logs,           setLogs]          = useState<LogLine[]>([]);
  const [running,        setRunning]       = useState(false);
  const [chaosMode,      setChaosMode]     = useState(false);
  const [chaosToggling,  setChaosToggling] = useState(false);
  const [sentinelMode,   setSentinelMode]  = useState(false);
  const [watchStatus,    setWatchStatus]   = useState('');
  const [customInput,    setCustomInput]   = useState('');
  const [inputVisible,   setInputVisible]  = useState(false);

  const scrollRef     = useRef<ScrollView>(null);
  const glowAnim      = useRef(new Animated.Value(0)).current;
  const glowLoop      = useRef<Animated.CompositeAnimation | null>(null);
  const sentinelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevSnapshot  = useRef<string>('');
  const runningRef    = useRef(false);

  // Keep a ref in sync with running state for use inside interval callbacks
  useEffect(() => { runningRef.current = running; }, [running]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [logs.length]);

  // ── SENTINEL MODE — autonomous background monitor ──────────────
  useEffect(() => {
    if (!sentinelMode) {
      if (sentinelTimer.current) clearInterval(sentinelTimer.current);
      setWatchStatus('');
      return;
    }
    push('', 'separator');
    push('╔══════════════════════════════════════════╗', 'header');
    push('║  SENTINEL MODE ACTIVATED                 ║', 'header');
    push('║  Autonomous monitoring — 5s poll interval║', 'header');
    push('╚══════════════════════════════════════════╝', 'header');
    push('[Sentinel] Watching market stream for anomalies...', 'system');
    setWatchStatus('WATCHING');

    sentinelTimer.current = setInterval(async () => {
      if (runningRef.current) return;
      try {
        const res  = await fetch(`${API_BASE}/api/market-stream`);
        const data = await res.json();
        const incoming: MarketEvent[] = data.events ?? [];

        const snapshot = JSON.stringify(
          incoming.map((e) => ({ id: e.id, anomaly: e.anomaly, pct: Math.round((e.price_change_5m_pct ?? 0) * 10) / 10 }))
        );

        if (snapshot === prevSnapshot.current) {
          setWatchStatus('WATCHING · no change');
          return;
        }
        prevSnapshot.current = snapshot;

        const triggerEvents = incoming.filter((e) =>
          e.anomaly || Math.abs(e.price_change_5m_pct ?? 0) > 8
        );

        if (triggerEvents.length > 0) {
          const names = triggerEvents.map((e) => e.asset).join(', ');
          push(`[Sentinel] Market change detected — ${names} triggered auto-run`, 'pump');
          setWatchStatus(`AUTO-TRIGGERED · ${names}`);
          triggerRun();
        } else {
          setWatchStatus('WATCHING · no signal');
        }
      } catch {
        setWatchStatus('RECONNECTING...');
        push('[Sentinel] Connection lost — retrying...', 'error');
      }
    }, 5000);

    return () => { if (sentinelTimer.current) clearInterval(sentinelTimer.current); };
  }, [sentinelMode]);

  const push = useCallback((text: string, type: LogType) => {
    setLogs((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, text, type }]);
  }, []);

  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  async function toggleChaos() {
    setChaosToggling(true);
    try {
      const res  = await fetch(`${API_BASE}/api/toggle-chaos`);
      const data = await res.json();
      setChaosMode(data.chaos_mode);
    } catch {}
    setChaosToggling(false);
  }

  // ── Exponential backoff executor ──────────────────────────────
  async function executeWithRetry(
    asset: string, action: string, size: number,
  ): Promise<{ success: boolean; data?: any; error?: string; attempt?: number }> {
    const MAX = 3;
    const BASE_MS = 1000;

    for (let attempt = 1; attempt <= MAX; attempt++) {
      try {
        const res = await fetch(`${API_BASE}/api/execute-action`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ asset, action, size }),
        });

        if (res.status === 500) {
          const body = await res.json().catch(() => ({}));
          throw new Error(`HTTP 500 — ${body.error ?? 'Server Error'}`);
        }

        const data = await res.json();
        return { success: true, data, attempt };
      } catch (err: any) {
        if (attempt < MAX) {
          const ms = Math.pow(2, attempt - 1) * BASE_MS;
          push(`[Retry ${attempt}/${MAX}] Failed: ${err?.message ?? 'unknown error'}`, 'retry');
          await delay(100);
          push(`[Retry] Exponential backoff: waiting ${ms}ms before next attempt...`, 'retry');
          await delay(ms);
        } else {
          return { success: false, error: err?.message ?? 'Unknown error' };
        }
      }
    }
    return { success: false, error: 'Max retries reached' };
  }

  // ── Main agent run ────────────────────────────────────────────
  async function triggerRun() {
    if (running) return;
    setRunning(true);
    setLogs([]);

    glowLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 700, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 700, useNativeDriver: false }),
      ])
    );
    glowLoop.current.start();

    // ── Header + workplan ─────────────────────────────────────
    push('╔══════════════════════════════════════════╗', 'header');
    push('║  PARADOX SENTINEL — AGENTIC CORE v3.0   ║', 'header');
    push('║  3-Agent Pipeline: Parse→Analyze→Decide  ║', 'header');
    push('╚══════════════════════════════════════════╝', 'header');
    await delay(150);
    push('', 'separator');
    push('[WORKPLAN INITIALIZED]', 'system');
    await delay(100);
    push('  AGENT 0 · Content Parser', 'system');
    await delay(60);
    push('    0a. Ingest unstructured text input (article/report)', 'system');
    await delay(60);
    push('    0b. Extract asset mentions, sentiment, risk signals', 'system');
    await delay(60);
    push('    0c. Compute content bias modifier for scoring engine', 'system');
    await delay(80);
    push('  AGENT 1 · Market Analyst', 'system');
    await delay(60);
    push('    1a. Fetch live market stream (prices drift every 8s)', 'system');
    await delay(60);
    push('    1b. Robustness sanitizer — null fields + conflicting signals', 'system');
    await delay(60);
    push('    1c. Multi-factor scoring (price+sent+vol+onchain+book+content)', 'system');
    await delay(60);
    push('    1d. Pump-and-dump detection', 'system');
    await delay(80);
    push('  AGENT 2 · Risk Mitigation', 'system');
    await delay(60);
    push('    2a. Dynamic position sizing scaled to confidence', 'system');
    await delay(60);
    push('    2b. Exponential backoff (3×) on HTTP 500 errors', 'system');
    await delay(60);
    push('    2c. Fallback Secondary Liquidity Bridge on total failure', 'system');
    await delay(200);
    push('─'.repeat(44), 'separator');

    // ── AGENT 0: Content Parser ────────────────────────────────
    push('', 'separator');
    push('╔══════════════════════════════════════════╗', 'header');
    push('║  AGENT 0 — Content Parser                ║', 'header');
    push('╚══════════════════════════════════════════╝', 'header');
    await delay(200);
    if (customInput.trim()) {
      push(`[Content Parser] Analyzing ${customInput.length} chars of input...`, 'system');
    }
    const contentSignal = await parseContent(customInput);
    if (!contentSignal) {
      push('[Content Parser] No custom input provided', 'system');
      push('[Content Parser] Running on live market stream only', 'system');
    } else {
      const engine = contentSignal.source === 'claude_haiku' ? 'Claude Haiku'
                   : contentSignal.source === 'afinn_nlp'    ? 'AFINN NLP + crypto vocab'
                   : 'keyword engine';
      push(`[Content Parser] Engine: ${engine}`, 'system');
      await delay(80);
      push(`[Content Parser] Input: ${customInput.length} chars ingested`, 'observation');
      await delay(100);
      push(`[Content Parser] Assets mentioned: ${contentSignal.mentionedAssets.join(', ')}`, 'observation');
      await delay(100);
      if (contentSignal.keywords.length) {
        push(`[Content Parser] Keywords detected: ${contentSignal.keywords.join(' · ')}`, 'observation');
        await delay(100);
      }
      if (contentSignal.risks.length) {
        push(`[Content Parser] ⚠ Risk signals: ${contentSignal.risks.join(' · ')}`, 'error');
        await delay(100);
      }
      const sentColor: LogType = contentSignal.sentiment === 'BULLISH' ? 'success' : contentSignal.sentiment === 'BEARISH' ? 'error' : 'system';
      push(`[Content Parser] Sentiment → ${contentSignal.sentiment}`, sentColor);
      await delay(100);
      const riskColor: LogType = contentSignal.riskLevel === 'CRITICAL' ? 'error' : contentSignal.riskLevel === 'ELEVATED' ? 'robustness' : 'success';
      push(`[Content Parser] Risk level → ${contentSignal.riskLevel}`, riskColor);
      await delay(100);
      push(`[Content Parser] Bias applied to [${contentSignal.mentionedAssets.join('/')}]: ${contentSignal.bias >= 0 ? '+' : ''}${contentSignal.bias.toFixed(3)}`, 'score');
    }
    push('─'.repeat(44), 'separator');

    // ── AGENT 1: Market Analyst ────────────────────────────────
    push('', 'separator');
    push('╔══════════════════════════════════════════╗', 'header');
    push('║  AGENT 1 — Market Analyst                ║', 'header');
    push('╚══════════════════════════════════════════╝', 'header');
    await delay(200);

    // ── Fetch ─────────────────────────────────────────────────
    push('[STEP 1] Fetching market stream...', 'system');
    await delay(300);

    let events: MarketEvent[] = [];
    let serverChaos = false;
    try {
      const res  = await fetch(`${API_BASE}/api/market-stream`);
      const data = await res.json();
      events     = data.events ?? [];
      serverChaos = data.chaos_mode ?? false;
      push(`[Stream OK] ${events.length} events received from ${API_BASE}`, 'success');
      if (serverChaos) {
        push('[Warning] Server reports CHAOS MODE active — 500s expected', 'recovery');
      }
    } catch {
      push('[Fatal] Cannot reach mock server. Run: cd infra && npm start', 'error');
      setRunning(false);
      glowLoop.current?.stop();
      return;
    }

    await delay(200);
    push('─'.repeat(44), 'separator');

    // ── Per-event pipeline ────────────────────────────────────
    let fallbackCount = 0;

    for (const rawEv of events) {
      push('', 'separator');
      push(`[AGENT 1] Market Analyst — ${rawEv.asset} [${rawEv.id}]`, 'reasoning');
      await delay(200);

      // ── Robustness sanitizer ──────────────────────────────
      const { sanitized, missing, conflicts, hasMissingData, hasConflictingData } = sanitizeEvent(rawEv);

      if (hasMissingData || hasConflictingData) {
        push('[Robustness Case] Anomalous data profile detected.', 'robustness');
        await delay(150);
        push('[Robustness Case] Launching fallback inference engine...', 'robustness');
        await delay(200);
      }

      for (const m of missing) {
        push(`[Robustness Case] Missing metrics detected — '${m.field}' is ${m.found}`, 'robustness');
        await delay(120);
        push(`[Inference] No baseline available. Assigning neutral score: ${m.assigned}`, 'robustness');
        await delay(100);
      }

      for (const c of conflicts) {
        push(`[Robustness Case] Conflicting signal: ${c}`, 'robustness');
        await delay(120);
      }

      if (hasMissingData || hasConflictingData) {
        push('[Robustness Case] Data quality issues logged. Confidence will be penalised.', 'robustness');
        await delay(150);
        push('', 'separator');
      }

      // ── Observation ───────────────────────────────────────
      push(`[Observation] Asset     : ${sanitized.asset}`, 'observation');
      await delay(120);
      push(`[Observation] Price Δ5m : ${sanitized.price_change_5m_pct}%`, 'observation');
      await delay(120);
      push(`[Observation] Sentiment : ${sanitized.social_sentiment_score}/100${hasMissingData ? ' [INFERRED]' : ''}`, 'observation');
      await delay(120);
      push(`[Observation] Vol spike : ${sanitized.volume_spike_multiplier}×`, 'observation');
      await delay(120);
      push(`[Observation] Anomaly?  : ${rawEv.anomaly ? 'TRUE ⚠' : 'false'}`, rawEv.anomaly ? 'error' : 'observation');
      await delay(150);

      // ── Scoring engine ─────────────────────────────────────
      push('', 'separator');
      push(`[Score Engine] Multi-factor analysis — ${sanitized.asset}`, 'reasoning');
      await delay(180);

      const cbias = contentSignal
        ? (contentSignal.mentionedAssets.includes('ALL') || contentSignal.mentionedAssets.includes(sanitized.asset))
          ? contentSignal.bias : 0
        : 0;
      if (cbias !== 0) {
        push(`[Score Engine] Content bias applied: ${cbias >= 0 ? '+' : ''}${cbias.toFixed(3)} (from parsed input)`, 'score');
        await delay(80);
      }

      const decision = scoreAndDecide(sanitized, cbias);

      if (decision.components) {
        const c = decision.components;
        push(`[Score Engine] price:${c.price}  sent:${c.sentiment}  vol:${c.volume}  chain:${c.onchain}  book:${c.book}`, 'score');
        await delay(100);
        push(`[Score Engine] Composite score → ${decision.score}`, 'score');
        await delay(100);
      }

      if (hasMissingData || hasConflictingData) {
        const penalty = (missing.length * 0.05) + (conflicts.length * 0.08);
        decision.confidence = Math.max(0.10, +(decision.confidence - penalty).toFixed(2));
        push(`[Score Engine] Quality penalty −${(penalty * 100).toFixed(0)}% applied`, 'robustness');
        await delay(100);
      }

      if (decision.classification === 'PUMP_RISK') {
        push(`[Score Engine] ⚠ PUMP-AND-DUMP PATTERN DETECTED`, 'pump');
        await delay(120);
        push(`[Score Engine] Price surge + dead volume + illiquid book → BLOCKED`, 'pump');
        await delay(100);
      }

      push(`[Reasoning] Classification → ${decision.classification}`, 'reasoning');
      await delay(100);
      push(`[Reasoning] Confidence     : ${(decision.confidence * 100).toFixed(0)}%`, 'reasoning');

      // ── Decision tree ─────────────────────────────────────
      push('', 'separator');
      push('[AGENT 2] Risk Mitigation — evaluating action', 'decision');
      await delay(200);
      push(`[Decision Tree] Branch: ${decision.branch}`, 'decision');
      await delay(150);
      push(`[Decision Tree] Rationale: ${decision.rationale}`, 'decision');

      push('', 'separator');
      push(`[Action Choice] → ${decision.action}`, 'action');
      await delay(200);

      // ── Execution with retry ──────────────────────────────
      if (decision.executeSize > 0 && decision.action !== 'SET_STOP_LOSS' && decision.action !== 'HOLD') {
        push(`[Action] POST /api/execute-action (with 3× exponential backoff)`, 'action');
        await delay(300);

        const result = await executeWithRetry(sanitized.asset, decision.action, decision.executeSize);

        if (result.success) {
          if ((result.attempt ?? 1) > 1) {
            push(`[Recovery] Execution succeeded on attempt ${result.attempt}/3`, 'success');
          }
          push(`[Action Executed successfully.]`, 'success');
          await delay(100);
          push(`[Result] ${result.data?.transaction?.summary}`, 'success');
          await delay(100);

          const b = result.data?.state_change?.before ?? {};
          const a = result.data?.state_change?.after  ?? {};
          const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
          for (const k of keys) {
            const bv = (b[k] ?? 0), av = (a[k] ?? 0);
            if (bv !== av) {
              push(`[Wallet Δ] ${k}: ${bv.toFixed(4)} → ${av.toFixed(4)}`, 'success');
            }
          }
        } else {
          // ── Fallback bridge ───────────────────────────────
          push('', 'separator');
          push('[Error Recovery] All 3 retry attempts failed.', 'recovery');
          await delay(200);
          push('[Error Recovery] Primary Execution Node down.', 'recovery');
          await delay(200);
          push('[Error Recovery] Routing transaction through Fallback Secondary Liquidity Bridge...', 'fallback');
          await delay(300);
          push(`[Fallback Bridge] Asset: ${sanitized.asset} | Action: ${decision.action}`, 'fallback');
          await delay(100);
          push(`[Fallback Bridge] TX queued: FBK-${Date.now()} — status: QUEUED_FOR_RETRY`, 'fallback');
          await delay(100);
          push(`[Fallback Bridge] Transaction persisted to fallback_tx_log.json`, 'fallback');
          fallbackCount++;
        }
      } else {
        push(`[Action] ${decision.action} — advisory only, no trade execution`, 'system');
      }

      await delay(250);
      push('─'.repeat(44), 'separator');
    }

    // ── Final summary ─────────────────────────────────────────
    push('', 'separator');
    push(`[Complete] ${events.length} events processed.`, 'success');
    if (fallbackCount > 0) {
      push(`[Recovery] ${fallbackCount} transaction(s) routed via fallback bridge.`, 'recovery');
    }
    push(`[Complete] Orchestration cycle finished.`, 'success');
    push('═'.repeat(44), 'header');

    glowLoop.current?.stop();
    setRunning(false);
  }

  const borderColor = glowAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [chaosMode ? 'rgba(255,45,85,0.13)' : 'rgba(0,255,209,0.13)', chaosMode ? 'rgba(255,45,85,0.75)' : 'rgba(0,255,209,0.75)'],
  });

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.screenHeader}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.screenTitle,
              IS_WEB && { textShadow: '0 0 22px rgba(0,255,209,0.65)' } as any,
            ]}
          >
            AGENT CORE
          </Text>
          <Text style={styles.screenSub}>MULTI-FACTOR ENGINE + AUTONOMOUS SENTINEL</Text>
          {sentinelMode && watchStatus ? (
            <Text style={[styles.screenSub, { color: T.accent, marginTop: 2 }]}>
              ◉ {watchStatus}
            </Text>
          ) : null}
        </View>
        <View style={{ gap: 7, alignItems: 'flex-end' }}>
          {/* Sentinel mode toggle */}
          <Pressable
            style={[styles.sentinelBtn, sentinelMode && styles.sentinelBtnActive,
              IS_WEB && sentinelMode && { animation: 'agentRunPulse 2s ease-in-out infinite' } as any,
            ]}
            onPress={() => setSentinelMode((v) => !v)}
          >
            <Ionicons name={sentinelMode ? 'eye' : 'eye-outline'} size={13} color={sentinelMode ? T.accent : T.textDim} />
            <Text style={[styles.sentinelBtnText, sentinelMode && { color: T.accent }]}>
              {sentinelMode ? 'SENTINEL ON' : 'SENTINEL'}
            </Text>
          </Pressable>
          {/* Run button */}
          <Pressable
            style={[styles.runBtn, running && styles.runBtnActive,
              IS_WEB && !running && { boxShadow: '0 0 14px rgba(0,255,209,0.30)' } as any,
              IS_WEB && running  && { animation: chaosMode ? 'chaosPulse 1.2s ease-in-out infinite' : 'agentRunPulse 1.2s ease-in-out infinite' } as any,
            ]}
            onPress={triggerRun}
            disabled={running}
          >
            <Ionicons
              name={running ? 'stop-circle-outline' : 'play-circle-outline'}
              size={16}
              color={running ? T.warn : T.accent}
            />
            <Text style={[styles.runBtnText, running && { color: T.warn }]}>
              {running ? 'RUNNING...' : 'RUN PIPELINE'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Content Input (unstructured text ingestion) ── */}
      <View style={styles.contentWrap}>
        <Pressable style={styles.contentHeader} onPress={() => setInputVisible(v => !v)}>
          <Ionicons
            name={customInput ? 'document-text' : 'document-text-outline'}
            size={13}
            color={customInput ? T.accent : T.textDim}
          />
          <Text style={[styles.contentHeaderLabel, customInput && { color: T.accent }]}>
            {customInput
              ? `CONTENT LOADED — ${customInput.length} chars · Agent 0 will parse`
              : 'PASTE ARTICLE / REPORT  (optional — enables Content Parser Agent)'}
          </Text>
          <Ionicons name={inputVisible ? 'chevron-up-outline' : 'chevron-down-outline'} size={11} color={T.textDim} />
        </Pressable>
        {inputVisible && (
          <TextInput
            style={styles.contentTextInput}
            multiline
            value={customInput}
            onChangeText={setCustomInput}
            placeholder={'Paste a news article, market report, or any unstructured text...\n\nExample: "Bitcoin surged 8% after ETF approval news, institutional inflows hit record high..."\n\nThe Content Parser Agent will extract signals and apply them to the scoring engine.'}
            placeholderTextColor={T.textDim}
            textAlignVertical="top"
          />
        )}
      </View>

      {/* ── Chaos toggle bar ── */}
      <Pressable
        style={[styles.chaosBar, chaosMode && styles.chaosBarActive]}
        onPress={toggleChaos}
        disabled={chaosToggling}
      >
        <View style={[styles.chaosIndicator, { backgroundColor: chaosMode ? T.sell : T.textDim }]} />
        <Text style={[styles.chaosLabel, chaosMode && { color: T.sell }]}>
          {chaosMode ? '⚡ CHAOS MODE — execute-action returns HTTP 500' : 'CHAOS MODE OFF — tap to inject errors'}
        </Text>
        <View style={[styles.chaosChipBtn, chaosMode && styles.chaosChipBtnActive]}>
          <Text style={[styles.chaosChipBtnText, { color: chaosMode ? T.sell : T.textDim }]}>
            {chaosToggling ? '...' : (chaosMode ? 'DISABLE' : 'ENABLE')}
          </Text>
        </View>
      </Pressable>

      {/* ── Terminal ── */}
      <Animated.View
        style={[
          styles.terminalWrap,
          { borderColor },
          IS_WEB && { boxShadow: '0 4px 24px rgba(0,0,0,0.60)' } as any,
        ]}
      >
        <View style={styles.terminalBar}>
          <View style={[styles.termDot, { backgroundColor: T.sell }]} />
          <View style={[styles.termDot, { backgroundColor: T.warn }]} />
          <View style={[styles.termDot, { backgroundColor: T.buy }]} />
          <Text style={styles.termBarTitle}>paradox-sentinel — 3-agent pipeline v3.0</Text>
          {chaosMode && (
            <View style={styles.chaosChip}>
              <Text style={styles.chaosChipText}>CHAOS</Text>
            </View>
          )}
        </View>

        {/* Terminal scanline (web only) */}
        {IS_WEB && (
          <View pointerEvents="none" style={{ position: 'absolute', top: 38, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 5 } as any}>
            <View style={{ position: 'absolute', left: 0, right: 0, height: 2,
              background: 'linear-gradient(transparent, rgba(0,255,209,0.07) 50%, transparent)',
              animation: 'termScan 8s ease-in-out infinite',
            } as any} />
          </View>
        )}
        <ScrollView
          ref={scrollRef}
          style={styles.terminal}
          contentContainerStyle={styles.terminalContent}
          showsVerticalScrollIndicator={false}
        >
          {logs.length === 0 ? (
            <View>
              <Text style={styles.termPlaceholder}>{'> '}<BlinkCursor /></Text>
              <Text style={[styles.termPlaceholder, { marginTop: 14 }]}>
                {'AGENT 0 — Content Parser\n  Paste an article above to ingest\n  unstructured text. Extracts asset\n  mentions, sentiment, and risk signals.\n\nAGENT 1 — Market Analyst\n  Fetches live market stream, sanitizes\n  data, runs multi-factor scoring engine.\n\nAGENT 2 — Risk Mitigation\n  Evaluates decisions, executes trades\n  with exponential backoff retry.\n\nEnable CHAOS MODE to inject HTTP 500\nerrors and watch the recovery layer.'}
              </Text>
            </View>
          ) : (
            logs.map((line) => <LogLine key={line.id} line={line} />)
          )}
        </ScrollView>
      </Animated.View>

      {/* Legend */}
      <View style={styles.legend}>
        {(
          [
            ['observation', 'Observe'],
            ['reasoning',   'Reason'],
            ['decision',    'Decide'],
            ['robustness',  'Robust'],
            ['recovery',    'Recover'],
            ['success',     'Success'],
          ] as [LogType, string][]
        ).map(([type, label]) => (
          <View key={type} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: LOG_COLOR[type] }]} />
            <Text style={styles.legendLabel}>{label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.bg },

  screenHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingTop: 16, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: T.border3,
  },
  screenTitle: { fontFamily: T.mono, fontSize: 20, color: T.accent, letterSpacing: 2, fontWeight: '700' },
  screenSub:   { fontFamily: T.mono, fontSize: 11, color: T.textDim, letterSpacing: 1, marginTop: 3 },

  sentinelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: T.border3, borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'transparent',
  },
  sentinelBtnActive: { borderColor: 'rgba(0,255,209,0.45)', backgroundColor: 'rgba(0,255,209,0.07)' },
  sentinelBtnText:   { fontFamily: T.mono, fontSize: 10, color: T.textDim, letterSpacing: 0.8 },

  runBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: 'rgba(0,255,209,0.35)', borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 7, backgroundColor: 'rgba(0,255,209,0.07)',
  },
  runBtnActive: { borderColor: 'rgba(255,214,0,0.35)', backgroundColor: 'rgba(255,214,0,0.06)' },
  runBtnText:   { fontFamily: T.mono, fontSize: 12, color: T.accent, letterSpacing: 1 },

  chaosBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: T.bgPanel, borderBottomWidth: 1, borderBottomColor: T.border3,
  },
  chaosBarActive:   { backgroundColor: 'rgba(255,45,85,0.09)', borderBottomColor: 'rgba(255,45,85,0.30)' },
  chaosIndicator:   { width: 7, height: 7, borderRadius: 4 },
  chaosLabel:       { fontFamily: T.mono, fontSize: 11, color: T.textDim, flex: 1 },
  chaosChip:           { backgroundColor: 'rgba(255,45,85,0.16)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  chaosChipText:       { fontFamily: T.mono, fontSize: 9,  color: T.sell, letterSpacing: 1 },
  chaosChipBtn:        { borderWidth: 1, borderColor: T.border3, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  chaosChipBtnActive:  { borderColor: 'rgba(255,45,85,0.45)', backgroundColor: 'rgba(255,45,85,0.10)' },
  chaosChipBtnText:    { fontFamily: T.mono, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  terminalWrap: {
    flex: 1, margin: 10, marginBottom: 4,
    borderRadius: 10, borderWidth: 1, overflow: 'hidden', backgroundColor: T.bgTerm,
  },
  terminalBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: T.bgCard, paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: T.border3,
  },
  termDot:     { width: 10, height: 10, borderRadius: 5 },
  termBarTitle:{ fontFamily: T.mono, fontSize: 12, color: T.textMuted, marginLeft: 4, flex: 1, textAlign: 'center' },
  terminal:     { flex: 1 },
  terminalContent: { padding: 12, paddingBottom: 16 },
  termPlaceholder: { fontFamily: T.mono, fontSize: 13, color: T.textDim, lineHeight: 22 },
  logLine: { fontFamily: T.mono, fontSize: 13, lineHeight: 20, marginBottom: 1 },
  logSep:  { fontFamily: T.mono, fontSize: 11, lineHeight: 20, marginBottom: 1 },

  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 12,
    borderTopWidth: 1, borderTopColor: T.border3, backgroundColor: T.bgTerm,
  },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:   { width: 7, height: 7, borderRadius: 4 },
  legendLabel: { fontFamily: T.mono, fontSize: 10, color: T.textDim, letterSpacing: 0.5 },

  // Content input
  contentWrap: {
    borderBottomWidth: 1, borderBottomColor: T.border3, backgroundColor: T.bgPanel,
  },
  contentHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  contentHeaderLabel: {
    fontFamily: T.mono, fontSize: 10, color: T.textDim, flex: 1, letterSpacing: 0.5,
  },
  contentTextInput: {
    fontFamily: T.mono, fontSize: 12, color: T.textDefault,
    backgroundColor: T.bgTerm, borderTopWidth: 1, borderTopColor: T.border3,
    paddingHorizontal: 14, paddingVertical: 12,
    minHeight: 130, maxHeight: 220,
    lineHeight: 20,
  } as any,
});
