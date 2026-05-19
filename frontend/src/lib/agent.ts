import type { MarketEvent, Decision } from '../types';

const W = { price: 0.25, sentiment: 0.10, volume: 0.28, onchain: 0.17, book: 0.20 };
const WHALE: Record<string, number> = { extreme:-1.0, high:-0.6, moderate:-0.3, neutral:0.0, low:0.4, unknown:0.0 };

const normPrice = (p: number) => Math.max(-1, Math.min(1, p / 20));
const normSent  = (s: number) => (s - 50) / 50;
const normVol   = (v: number) => Math.max(-1, Math.min(1, Math.log2(Math.max(0.01, v)) / 2));
const normBook  = (ob?: MarketEvent['order_book']) => {
  const sp = ob?.spread_pct ?? 0;
  let s = sp > 10 ? -1.0 : sp > 5 ? -0.7 : sp > 2 ? -0.3 : sp < 0.1 ? 0.2 : 0;
  if (ob?.bid_depth_collapse) s -= 0.5;
  return Math.max(-1, Math.min(1, s));
};

export type SanitizeResult = {
  sanitized: MarketEvent;
  missing: Array<{ field: string; found: any; assigned: number }>;
  conflicts: string[];
  hasMissingData: boolean;
  hasConflictingData: boolean;
};

export function sanitizeEvent(raw: MarketEvent): SanitizeResult {
  const event = { ...raw } as any;
  const missing: SanitizeResult['missing'] = [];
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
  if (event.price_change_5m_pct > 15 && event.volume_spike_multiplier < 0.5)
    conflicts.push(`+${event.price_change_5m_pct}% surge with ${event.volume_spike_multiplier}× vol (pump risk)`);
  if ((event.order_book?.spread_pct ?? 0) > 5)
    conflicts.push(`Spread ${event.order_book?.spread_pct}% — extreme illiquidity`);
  if ((event.volume_24h ?? 0) < 500000 && event.price_change_5m_pct > 10)
    conflicts.push(`Micro-cap $${(event.volume_24h ?? 0).toLocaleString()} vol with outsized move`);

  return { sanitized: event as MarketEvent, missing, conflicts, hasMissingData: missing.length > 0, hasConflictingData: conflicts.length > 0 };
}

export function scoreAndDecide(ev: MarketEvent, contentBias = 0): Decision {
  const pct   = ev.price_change_5m_pct;
  const sent  = ev.social_sentiment_score as number;
  const vol   = ev.volume_spike_multiplier;
  const whale = (ev.on_chain as any)?.whale_sell_pressure ?? 'unknown';

  const sp = normPrice(pct);
  const ss = normSent(sent);
  const sv = normVol(vol);
  const penalty = (() => {
    if (!ev.volume_24h) return 0;
    const r = (ev.on_chain?.exchange_inflow_usd ?? 0) / ev.volume_24h;
    return r > 0.02 ? 0.15 : r > 0.005 ? 0.08 : 0;
  })();
  const so = Math.max(-1, (WHALE[whale] ?? 0) - penalty);
  const sb = normBook(ev.order_book);

  const score = parseFloat((W.price*sp + W.sentiment*ss + W.volume*sv + W.onchain*so + W.book*sb + contentBias).toFixed(3));
  const comps = { price: sp.toFixed(2), sentiment: ss.toFixed(2), volume: sv.toFixed(2), onchain: so.toFixed(2), book: sb.toFixed(2) };
  const wu = whale === 'unknown' ? 0.08 : 0;

  if (pct > 10 && vol < 0.5 && (ev.order_book?.spread_pct ?? 0) > 5)
    return { action:'HOLD', classification:'PUMP_RISK', confidence: +Math.max(0.72, 0.90-wu).toFixed(2),
      rationale:`Pump-and-dump: +${pct}% dead vol ${vol}× spread ${ev.order_book?.spread_pct}%`,
      branch:`pct>10 ∧ vol<0.5 ∧ spread>5% → PUMP_RISK`, executeSize:0, score, components:comps };

  if (ev.anomaly && pct < -12 && sent < 30)
    return { action:'LIQUIDATE_TO_USDC', classification:'ANOMALY', confidence: +Math.min(0.99, 0.95+Math.abs(score)*0.04).toFixed(2),
      rationale:`Exploit confirmed: score ${score}, ${pct}% crash, sent ${sent}`,
      branch:`anomaly=true ∧ pct<−12 ∧ sent<30 → LIQUIDATE`, executeSize:999, score, components:comps };

  if (score < -0.50)
    return { action: pct < -5 ? 'LIQUIDATE_TO_USDC' : 'SET_STOP_LOSS', classification:'ANOMALY',
      confidence: +Math.max(0.70, Math.min(0.94, Math.abs(score))).toFixed(2),
      rationale:`Bearish confluence (score ${score})`, branch:`score<−0.50 → ANOMALY`,
      executeSize:0, score, components:comps };

  if (score < -0.20)
    return { action:'HEDGE', classification:'ANOMALY',
      confidence: +Math.max(0.52, Math.min(0.72, Math.abs(score))).toFixed(2),
      rationale:`Moderate bearish signal (score ${score})`, branch:`score∈[−0.50,−0.20] → HEDGE`,
      executeSize:0.5, score, components:comps };

  if (score > 0.38) {
    const sz = +Math.max(0.05, Math.min(0.30, score*0.45)).toFixed(3);
    return { action:'BUY', classification:'BREAKOUT', confidence: +Math.min(0.95, 0.65+score*0.55).toFixed(2),
      rationale:`Breakout: +${pct}%, ${vol}× vol, sent ${sent}`, branch:`score>0.38 → BUY (${sz})`,
      executeSize:sz, score, components:comps };
  }
  if (score > 0.06) {
    const sz = +Math.max(0.03, Math.min(0.12, score*0.30)).toFixed(3);
    return { action:'BUY', classification:'STABLE', confidence: +Math.max(0.52, Math.min(0.80, 0.35+score*0.80)).toFixed(2),
      rationale:`Positive signal (score ${score}), accumulation`, branch:`score∈[0.06,0.38] → BUY (${sz})`,
      executeSize:sz, score, components:comps };
  }
  return { action:'HOLD', classification:'NEUTRAL',
    confidence: +Math.max(0.40, 0.58-Math.abs(score)-wu).toFixed(2),
    rationale:`No directional edge (score ${score})`, branch:`score∈[−0.20,0.06] → HOLD`,
    executeSize:0, score, components:comps };
}

export function classifyEvent(ev: MarketEvent) {
  const pct  = ev.price_change_5m_pct ?? 0;
  const s    = (ev.social_sentiment_score as number) ?? 50;
  const vol  = ev.volume_spike_multiplier ?? 1;
  const spread = (ev.order_book as any)?.spread_pct ?? 0;
  if (pct > 10 && vol < 0.5 && spread > 5)
    return { label:'PUMP_RISK', color:'#FF6B00', bg:'rgba(255,107,0,0.12)', border:'rgba(255,107,0,0.40)', action:'HOLD' };
  if ((ev.anomaly && pct < -12) || (pct < -12 && s < 30))
    return { label:'ANOMALY',   color:'#FF2D55', bg:'rgba(255,45,85,0.12)',  border:'rgba(255,45,85,0.40)',  action:'LIQUIDATE' };
  if (pct > 2 && s > 60 && vol > 1.5)
    return { label:'BREAKOUT',  color:'#00FF88', bg:'rgba(0,255,136,0.10)',  border:'rgba(0,255,136,0.38)',  action:'BUY' };
  if (s > 40 && pct > -10)
    return { label:'STABLE',    color:'#00FFD1', bg:'rgba(0,255,209,0.10)',  border:'rgba(0,255,209,0.34)',  action:'BUY' };
  return       { label:'NEUTRAL', color:'rgba(255,255,255,0.38)', bg:'rgba(255,255,255,0.04)', border:'rgba(255,255,255,0.12)', action:'HOLD' };
}

export function keywordParse(text: string) {
  const lower = text.toLowerCase();
  const BEAR = ['crash','collapse','plunge','dump','hack','exploit','ban','illegal','stolen','drained','falling','decline','fear','panic','rug','breach','attack','freeze','suspended'];
  const BULL = ['surge','rally','breakout','adoption','etf','approved','institutional','partnership','ath','bullish','accumulate','inflow','launch','upgrade','growth'];
  const RISK = ['hack','exploit','vulnerability','stolen','drained','regulation','sec','lawsuit','freeze','suspended','ban','illegal','breach','attack'];
  const assetRe: Record<string, RegExp> = { BTC:/bitcoin|\bbtc\b/, ETH:/ethereum|\beth\b/, SOL:/solana|\bsol\b/ };
  const mentioned = Object.entries(assetRe).filter(([,re]) => re.test(lower)).map(([a]) => a);
  const bearHits = BEAR.filter(w => lower.includes(w));
  const bullHits = BULL.filter(w => lower.includes(w));
  const riskHits = RISK.filter(w => lower.includes(w));
  const net = bullHits.length - bearHits.length;
  return {
    mentionedAssets: mentioned.length > 0 ? mentioned : ['ALL'],
    sentiment: net < 0 ? 'BEARISH' : net > 0 ? 'BULLISH' : 'NEUTRAL',
    riskLevel:  riskHits.length >= 3 ? 'CRITICAL' : riskHits.length >= 1 ? 'ELEVATED' : 'NORMAL',
    keywords: [...bearHits, ...bullHits].slice(0, 6),
    risks: riskHits,
    bias: +Math.max(-0.45, Math.min(0.45, bullHits.length*0.04 - bearHits.length*0.04 - riskHits.length*0.08)).toFixed(3),
    source: 'keyword_fallback',
  };
}
