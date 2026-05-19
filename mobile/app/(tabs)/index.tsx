import {
  View, Text, ScrollView, StyleSheet, Platform,
  Animated, RefreshControl, type ViewStyle,
} from 'react-native';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useMarket } from '../../contexts/MarketContext';
import type { MarketEvent, WalletState } from '../../hooks/useMarketData';

// ── Bright neon-cyberpunk palette ───────────────────────────────
const T = {
  bg:        '#060B12',
  bgCard:    '#0D1525',
  bgDeep:    '#111E30',
  bgPanel:   '#040810',
  // Neon accent colors — vivid, high-saturation
  accent:    '#00FFD1',   // brilliant cyan-teal
  buy:       '#00FF88',   // neon green
  sell:      '#FF2D55',   // hot red-pink
  warn:      '#FFD600',   // brilliant amber
  purple:    '#BF5FFF',   // vivid purple
  blue:      '#4DACFF',   // bright blue
  // Borders — clearly visible
  b1: 'rgba(255,255,255,0.07)',
  b2: 'rgba(255,255,255,0.13)',
  b3: 'rgba(255,255,255,0.20)',
  b4: 'rgba(255,255,255,0.30)',
  bAccent: 'rgba(0,255,209,0.45)',
  // Text — high contrast, no washed-out ghosts
  tLoud:    '#FFFFFF',
  tDefault: 'rgba(255,255,255,0.90)',
  tMuted:   'rgba(255,255,255,0.65)',
  tDim:     'rgba(255,255,255,0.45)',
  mono: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
};

const IS_WEB = Platform.OS === 'web';
function web(css: object): object { return IS_WEB ? css : {}; }

// ── CSS keyframes injected once at module load (web only) ─────────
if (IS_WEB && typeof document !== 'undefined') {
  const SID = '__pdx_anim__';
  if (!document.getElementById(SID)) {
    const el = document.createElement('style');
    el.id = SID;
    el.textContent = `
      @keyframes pdxScan {
        0%   { top:-3px; opacity:0 }
        6%   { opacity:0.9 }
        94%  { opacity:0.9 }
        100% { top:100%; opacity:0 }
      }
      @keyframes pdxHeroPulse {
        0%,100% { box-shadow:0 4px 32px rgba(0,0,0,0.70),0 0 0 1px rgba(0,255,209,0.12) inset }
        50%     { box-shadow:0 4px 48px rgba(0,0,0,0.80),0 0 0 1px rgba(0,255,209,0.50) inset,0 0 60px rgba(0,255,209,0.08) }
      }
      @keyframes pdxStatPulse {
        0%,100% { box-shadow:0 2px 12px rgba(0,0,0,0.50),0 8px 28px rgba(0,0,0,0.60) }
        50%     { box-shadow:0 2px 20px rgba(0,0,0,0.60),0 0 32px rgba(0,255,209,0.07) }
      }
      @keyframes pdxFeedPulse {
        0%,100% { box-shadow:0 2px 12px rgba(0,0,0,0.50),0 8px 28px rgba(0,0,0,0.60) }
        50%     { box-shadow:0 2px 20px rgba(0,0,0,0.60),0 0 40px rgba(0,255,209,0.06) }
      }
    `;
    document.head.appendChild(el);
  }
}

// ── Scanline overlay (web only) ───────────────────────────────────
function ScanlineOverlay() {
  if (!IS_WEB) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden', zIndex: 10 } as any}>
      <View style={{ position: 'absolute', left: 0, right: 0, height: 3,
        background: 'linear-gradient(transparent, rgba(0,255,209,0.06) 50%, transparent)',
        animation: 'pdxScan 10s ease-in-out infinite',
      } as any} />
    </View>
  );
}

// ── Count-up hook ─────────────────────────────────────────────────
function useCountUp(target: number, duration = 1100): number {
  const [val, setVal] = useState(0);
  const live = useRef(false);
  useEffect(() => {
    if (!target || live.current) return;
    live.current = true;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setVal(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) setTimeout(tick, 16);
      else { setVal(target); live.current = false; }
    };
    setTimeout(tick, 40);
  }, [target]);
  return val;
}

// ── Staggered fade-in slide ───────────────────────────────────────
function FadeSlide({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}

const RGB: Record<string, string> = {
  [T.accent]: '0,255,209',
  [T.buy]:    '0,255,136',
  [T.sell]:   '255,45,85',
  [T.warn]:   '255,214,0',
  [T.purple]: '191,95,255',
  [T.blue]:   '77,172,255',
};

// ── Frame corners (L-bracket) ────────────────────────────────────
function FC({ color = T.b3 }: { color?: string }) {
  const d = 7;
  const b: ViewStyle = { position: 'absolute', width: d, height: d };
  return (
    <>
      <View style={[b, { top: 0, left: 0,    borderTopWidth: 1, borderLeftWidth: 1,   borderTopColor: color, borderLeftColor: color }]} />
      <View style={[b, { top: 0, right: 0,   borderTopWidth: 1, borderRightWidth: 1,  borderTopColor: color, borderRightColor: color }]} />
      <View style={[b, { bottom: 0, left: 0,  borderBottomWidth: 1, borderLeftWidth: 1,  borderBottomColor: color, borderLeftColor: color }]} />
      <View style={[b, { bottom: 0, right: 0, borderBottomWidth: 1, borderRightWidth: 1, borderBottomColor: color, borderRightColor: color }]} />
    </>
  );
}

// ── Top shimmer ──────────────────────────────────────────────────
function Shimmer({ color = T.accent }: { color?: string }) {
  const rgb = RGB[color] ?? '0,255,209';
  return (
    <View style={[
      { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
      { backgroundColor: color, opacity: 0.55 } as any,
      web({ background: `linear-gradient(90deg,transparent 5%,rgba(${rgb},0.80) 50%,transparent 95%)`, backgroundColor: 'transparent', opacity: 1 }),
    ]} />
  );
}

// ── Ambient radial glow inside card ─────────────────────────────
function Glow({ color = T.accent }: { color?: string }) {
  const rgb = RGB[color] ?? '0,255,209';
  if (!IS_WEB)
    return <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 60, backgroundColor: color, opacity: 0.06, borderRadius: 14 }} />;
  return (
    <View style={[
      { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
      web({ background: `radial-gradient(ellipse 80% 100% at 50% 0%, rgba(${rgb},0.14) 0%, transparent 100%)` }) as any,
    ]} />
  );
}

// ── Live pulsing dot ─────────────────────────────────────────────
function Dot({ color = T.accent, size = 7 }: { color?: string; size?: number }) {
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.15, duration: 1000, useNativeDriver: true }),
      Animated.timing(a, { toValue: 1,    duration: 1000, useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <Animated.View style={[
      { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: a },
      web({ boxShadow: `0 0 8px ${color}, 0 0 16px rgba(${RGB[color] ?? '0,255,209'},0.4)` }),
    ] as any} />
  );
}

// ── Classification engine (mirrors scoring engine) ───────────────
type Cls = { label: 'ANOMALY'|'BREAKOUT'|'STABLE'|'NEUTRAL'|'PUMP_RISK'; color: string; bg: string; border: string; strength: number; action: string; };

function classify(ev: MarketEvent): Cls {
  const pct  = ev.price_change_5m_pct ?? 0;
  const s    = (ev.social_sentiment_score as number) ?? 50;
  const vol  = ev.volume_spike_multiplier ?? 1;
  const spread = (ev.order_book as any)?.spread_pct ?? 0;

  // Pump detection first
  if (pct > 10 && vol < 0.5 && spread > 5)
    return { label: 'PUMP_RISK', color: T.warn, bg: 'rgba(255,140,0,0.12)', border: 'rgba(255,140,0,0.40)', strength: 82, action: 'HOLD' };
  if ((ev.anomaly && pct < -12) || (pct < -12 && s < 30))
    return { label: 'ANOMALY',   color: T.sell,   bg: 'rgba(255,45,85,0.12)',  border: 'rgba(255,45,85,0.40)',  strength: ev.anomaly ? 95 : 80, action: 'LIQUIDATE' };
  if (pct > 2 && s > 60 && vol > 1.5)
    return { label: 'BREAKOUT',  color: T.buy,    bg: 'rgba(0,255,136,0.10)',  border: 'rgba(0,255,136,0.38)',  strength: 85, action: 'BUY' };
  if (s > 40 && pct > -10)
    return { label: 'STABLE',    color: T.accent, bg: 'rgba(0,255,209,0.10)',  border: 'rgba(0,255,209,0.34)',  strength: 72, action: 'BUY' };
  return     { label: 'NEUTRAL', color: T.tDim,   bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', strength: 45, action: 'HOLD' };
}

// ── Signal badge ─────────────────────────────────────────────────
function Badge({ c }: { c: Cls }) {
  return (
    <View style={[s.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[s.badgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

// ── Gradient bar (animates on web via CSS transition) ────────────
function GradBar({ pct, color, height = 5 }: { pct: number; color: string; height?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => { const t = setTimeout(() => setShown(pct), 80); return () => clearTimeout(t); }, [pct]);
  const rgb = RGB[color] ?? '0,255,209';
  const w = IS_WEB ? shown : pct;
  return (
    <View style={{ height, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: height, overflow: 'hidden', flex: 1 }}>
      <View style={[
        { height: '100%' as any, width: `${Math.min(100, w)}%` as any, backgroundColor: color, borderRadius: height },
        web({ background: `linear-gradient(90deg,rgba(${rgb},0.40),${color})`, boxShadow: `0 0 12px rgba(${rgb},0.60)`, transition: 'width 1s cubic-bezier(0.22,1,0.36,1)' }),
      ] as any} />
    </View>
  );
}

// ── Mini histogram bars ──────────────────────────────────────────
function Histogram({ vals, color }: { vals: number[]; color: string }) {
  const max = Math.max(...vals, 1);
  const rgb = RGB[color] ?? '0,255,209';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28 }}>
      {vals.map((v, i) => {
        const h  = Math.max(4, Math.round((v / max) * 28));
        const last = i === vals.length - 1;
        return (
          <View key={i} style={[
            { width: 6, height: h, borderRadius: 2, backgroundColor: color, opacity: last ? 1 : 0.28 },
            last && web({ boxShadow: `0 0 8px rgba(${rgb},0.70)` }),
          ] as any} />
        );
      })}
    </View>
  );
}

// ── SVG donut (web) / border ring (native) ───────────────────────
function Donut({ slices }: { slices: { pct: number; color: string }[] }) {
  if (IS_WEB) {
    const r = 32, cx = 40, cy = 40, sw = 9;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    return (
      <View style={{ width: 80, height: 80 }}>
        {/* @ts-ignore */}
        <svg width={80} height={80} viewBox="0 0 80 80">
          {/* @ts-ignore */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={sw} />
          {slices.map((sl, i) => {
            const dash = (sl.pct / 100) * circ;
            const el = (
              // @ts-ignore
              <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={sl.color}
                strokeWidth={sw} strokeDasharray={`${dash} ${circ}`} strokeDashoffset={-offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                // @ts-ignore
                style={{ filter: `drop-shadow(0 0 5px ${sl.color})` }} />
            );
            offset += dash;
            return el;
          })}
          {/* @ts-ignore */}
          <text x={cx} y={cy + 5} textAnchor="middle" fill={slices[0]?.color ?? T.accent}
            fontSize="13" fontWeight="800" fontFamily="monospace">
            {Math.round(slices[0]?.pct ?? 0)}%
          </text>
        </svg>
      </View>
    );
  }
  return (
    <View style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 7, borderColor: slices[0]?.color ?? T.accent, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: T.mono, fontSize: 13, fontWeight: '800', color: slices[0]?.color ?? T.accent }}>
        {Math.round(slices[0]?.pct ?? 0)}%
      </Text>
    </View>
  );
}

// ── Market health strip ──────────────────────────────────────────
function HealthStrip({ events }: { events: MarketEvent[] }) {
  const buys     = events.filter(e => classify(e).action !== 'HOLD').length;
  const bullPct  = events.length ? Math.round((buys / events.length) * 100) : 0;
  const avgChg   = events.length ? events.reduce((a, e) => a + (e.price_change_5m_pct ?? 0), 0) / events.length : 0;
  const anomalies = events.filter(e => e.anomaly || (e.price_change_5m_pct ?? 0) < -12).length;
  const gainers  = events.filter(e => (e.price_change_5m_pct ?? 0) > 0).length;
  const losers   = events.filter(e => (e.price_change_5m_pct ?? 0) < 0).length;
  const biasColor = bullPct > 55 ? T.buy : bullPct < 45 ? T.accent : T.warn;
  const biasLabel = bullPct > 55 ? 'BULLISH' : bullPct < 45 ? 'BEARISH' : 'NEUTRAL';

  const items = [
    { l: 'BUY BIAS',   v: `${bullPct}%`,                                           c: T.buy },
    { l: 'ASSETS',     v: `${events.length}`,                                       c: T.accent },
    { l: 'AVG MOVE',   v: `${avgChg >= 0 ? '+' : ''}${avgChg.toFixed(2)}%`,       c: avgChg >= 0 ? T.buy : T.sell },
    { l: 'ANOMALIES',  v: `${anomalies}`,                                           c: anomalies > 0 ? T.sell : T.tDim },
    { l: 'GAINING',    v: `${gainers}`,                                             c: T.buy },
    { l: 'LOSING',     v: `${losers}`,                                              c: T.sell },
  ];

  return (
    <View style={s.strip}>
      <View style={[s.stripBias, { borderRightColor: T.b2 }]}>
        <View style={{ width: 6, height: 6, backgroundColor: biasColor }} />
        <Text style={[s.stripBiasText, { color: biasColor }]}>{biasLabel}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'center' }}>
        {items.map((it, i) => (
          <View key={it.l} style={[s.stripItem, i < items.length - 1 && { borderRightWidth: 1, borderRightColor: T.b2, marginRight: 16 }]}>
            <Text style={s.stripLabel}>{it.l}</Text>
            <Text style={[s.stripValue, { color: it.c }]}>{it.v}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 5, paddingLeft: 6 }}>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(0,255,136,0.10)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,255,136,0.30)' }}>
          <Text style={{ fontFamily: T.mono, fontSize: 10, fontWeight: '700', color: T.buy }}>▲ {buys}</Text>
        </View>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: 'rgba(0,255,209,0.10)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,255,209,0.30)' }}>
          <Text style={{ fontFamily: T.mono, fontSize: 10, fontWeight: '700', color: T.accent }}>▼ {events.length - buys}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Portfolio hero ────────────────────────────────────────────────
const PRICE_FALLBACK: Record<string, number> = { USDC: 1, BTC: 94870, ETH: 3741.55, SOL: 138.42 };
const ASSET_COLORS: Record<string, string> = { USDC: T.accent, BTC: T.warn, ETH: T.purple, SOL: T.buy };

function Hero({ wallet, events, connected, ts }: { wallet: WalletState | null; events: MarketEvent[]; connected: boolean; ts: string }) {
  // Build live price map from market stream; fall back to static values before first fetch
  const livePrices: Record<string, number> = { USDC: 1 };
  for (const ev of events) livePrices[ev.asset] = ev.current_price;
  const PRICES = { ...PRICE_FALLBACK, ...livePrices };

  const total   = wallet ? Object.entries(wallet).reduce((sum, [k, v]) => sum + v * (PRICES[k] ?? 0), 0) : 0;
  const counted = useCountUp(total);
  return (
    <View style={[s.hero, web({ animation: 'pdxHeroPulse 5s ease-in-out infinite' }) as any]}>
      <Shimmer color={T.accent} />
      <Glow color={T.accent} />
      <FC color="rgba(0,255,209,0.35)" />

      {/* Top row */}
      <View style={s.heroTop}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Dot color={connected ? T.buy : T.sell} size={7} />
            <Text style={s.heroEyebrow}>LIVE PORTFOLIO</Text>
          </View>
          <Text style={s.heroTitle}>PARADOX{'\n'}SENTINEL</Text>
          <Text style={s.heroTagline}>MULTI-AGENT CRYPTO INTELLIGENCE</Text>
        </View>
        <View style={[s.livePill, { borderColor: connected ? 'rgba(0,255,136,0.40)' : 'rgba(255,45,85,0.40)' }]}>
          <View style={[s.liveDot, { backgroundColor: connected ? T.buy : T.sell }]} />
          <Text style={[s.liveText, { color: connected ? T.buy : T.sell }]}>{connected ? 'LIVE' : 'OFFLINE'}</Text>
          <Text style={s.liveTime}>{ts}</Text>
        </View>
      </View>

      {/* Big value */}
      <Text style={[s.heroValue, web({ textShadow: `0 0 36px rgba(0,255,209,0.55)` }) as any]}>
        ${counted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Text>
      <Text style={s.heroValueLabel}>TOTAL PORTFOLIO VALUE (USD)</Text>

      {/* Asset breakdown bars */}
      {wallet && (
        <View style={{ marginTop: 18, gap: 7 }}>
          {Object.entries(wallet).map(([asset, bal]) => {
            const usd  = bal * (PRICES[asset] ?? 0);
            const pct  = total > 0 ? (usd / total) * 100 : 0;
            const col  = ASSET_COLORS[asset] ?? T.accent;
            const rgb  = RGB[col] ?? '0,255,209';
            return (
              <View key={asset} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={[s.assetName, { color: col }]}>{asset}</Text>
                <GradBar pct={pct} color={col} height={5} />
                <Text style={s.assetPct}>{pct.toFixed(0)}%</Text>
                <Text style={s.assetUsd}>${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Stat card ────────────────────────────────────────────────────
function Stat({ label, value, sub, color, trend, delay = 0 }: {
  label: string; value: string | number; sub: string; color: string; trend?: number; delay?: number;
}) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  const rgb = RGB[color] ?? '0,255,209';
  return (
    <Animated.View style={[
      s.stat, { opacity, transform: [{ translateY }] },
      web({ boxShadow: '0 2px 12px rgba(0,0,0,0.50), 0 8px 28px rgba(0,0,0,0.60)', animation: 'pdxStatPulse 5s ease-in-out infinite' }) as any,
    ]}>
      <Shimmer color={color} />
      <Glow color={color} />
      <FC />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Dot color={color} size={5} />
        <Text style={s.statLabel}>{label}</Text>
      </View>
      <Text
        style={[s.statValue, { color },
          web({ textShadow: `0 0 24px rgba(${rgb},0.55)` }) as any,
        ]}
        numberOfLines={1} adjustsFontSizeToFit
      >
        {String(value)}
      </Text>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <Text style={s.statSub}>{sub}</Text>
        {trend !== undefined && (
          <Text style={[s.statTrend, { color: trend >= 0 ? T.buy : T.sell }]}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(0)}%
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ── Widgets row ───────────────────────────────────────────────────
function Widgets({ events }: { events: MarketEvent[] }) {
  const counts = { ANOMALY: 0, BREAKOUT: 0, STABLE: 0, NEUTRAL: 0 };
  events.forEach(e => { counts[classify(e).label]++; });
  const slices = [
    { pct: (counts.ANOMALY  / events.length) * 100, color: T.sell   },
    { pct: (counts.BREAKOUT / events.length) * 100, color: T.buy    },
    { pct: (counts.STABLE   / events.length) * 100, color: T.accent },
    { pct: (counts.NEUTRAL  / events.length) * 100, color: T.warn   },
  ].filter(sl => sl.pct > 0);

  const vixRaw   = events.length ? events.reduce((a, e) => a + Math.abs(e.price_change_5m_pct ?? 0), 0) / events.length * 10 : 0;
  const vixPct   = Math.min(100, vixRaw);
  const vixVal   = vixPct.toFixed(1);
  const vixColor = vixPct > 70 ? T.sell : vixPct > 40 ? T.warn : T.buy;
  const vixRgb   = RGB[vixColor] ?? '0,255,136';
  const vixLabel = vixPct > 70 ? 'HIGH' : vixPct > 40 ? 'MODERATE' : 'LOW';
  const histVals = [12, 18, 14, 22, 16, vixPct * 0.28, vixPct * 0.32];

  const dominant = slices.reduce((a, b) => a.pct > b.pct ? a : b, slices[0] ?? { pct: 0, color: T.warn });

  return (
    <View style={s.widgetRow}>
      {/* Signal distribution */}
      <View style={[s.widget, web({ boxShadow: '0 2px 12px rgba(0,0,0,0.50)' }) as any]}>
        <Shimmer color={dominant.color} />
        <FC />
        <Text style={s.widgetLabel}>SIGNAL DIST.</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <Donut slices={slices} />
          <View style={{ gap: 6 }}>
            {[
              { l: 'ANOMALY',  c: T.sell   },
              { l: 'BREAKOUT', c: T.buy    },
              { l: 'STABLE',   c: T.accent },
              { l: 'NEUTRAL',  c: T.warn   },
            ].map(row => (
              <View key={row.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: row.c }} />
                <Text style={[s.legendKey, { color: T.tMuted }]}>{row.l}</Text>
                <Text style={[s.legendKey, { color: row.c, fontWeight: '700' }]}>
                  {counts[row.l as keyof typeof counts]}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Volatility index */}
      <View style={[s.widget, web({ boxShadow: '0 2px 12px rgba(0,0,0,0.50)' }) as any]}>
        <Shimmer color={vixColor} />
        <Glow color={vixColor} />
        <FC />
        <Text style={s.widgetLabel}>VOLATILITY INDEX</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 10 }}>
          <View>
            <Text style={[s.vixVal, { color: vixColor }, web({ textShadow: `0 0 22px rgba(${vixRgb},0.60)` }) as any]}>
              {vixVal}
            </Text>
            <Text style={[s.vixLvl, { color: vixColor }]}>{vixLabel}</Text>
          </View>
          <Histogram vals={histVals} color={vixColor} />
        </View>
        <View style={{ marginTop: 10 }}>
          <GradBar pct={vixPct} color={vixColor} height={6} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={s.vixScale}>0</Text>
            <Text style={s.vixScale}>50</Text>
            <Text style={s.vixScale}>100</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Signal row ────────────────────────────────────────────────────
const RANK_COLORS = [T.accent, T.buy, T.warn, T.tMuted, T.tDim];

function SignalRow({ rank, event }: { rank: number; event: MarketEvent }) {
  const cls    = classify(event);
  const pct    = event.price_change_5m_pct ?? 0;
  const pctCol = pct >= 0 ? T.buy : T.accent;
  const rgb    = RGB[cls.color] ?? '0,255,209';
  const rkCol  = RANK_COLORS[rank - 1] ?? T.tDim;
  const actCol = cls.action === 'LIQUIDATE' ? T.sell : cls.action === 'BUY' ? T.buy : T.tMuted;

  const opacity    = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 1, duration: 350, delay: rank * 90, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 350, delay: rank * 90, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[s.sigRow, { borderLeftColor: cls.border, opacity, transform: [{ translateX }] }]}>
      {/* Rank */}
      <View style={[s.rank, rank <= 3 && { backgroundColor: cls.bg, borderWidth: 1, borderColor: cls.border }]}>
        <Text style={[s.rankTxt, { color: rkCol }]}>{rank}</Text>
      </View>

      {/* Body */}
      <View style={{ flex: 1, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Text style={[s.sigAsset, web({ textShadow: `0 0 14px rgba(${rgb},0.35)` }) as any]}>
            ${event.asset}
          </Text>
          <Badge c={cls} />
          <View style={[s.actTag, { backgroundColor: `rgba(${RGB[actCol] ?? '0,255,136'},0.09)`, borderColor: `rgba(${RGB[actCol] ?? '0,255,136'},0.30)` }]}>
            <Text style={[s.actTagTxt, { color: actCol }]}>→ {cls.action}</Text>
          </View>
        </View>

        {/* Strength bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GradBar pct={cls.strength} color={cls.color} height={5} />
          <Text style={[s.strNum, { color: cls.color }]}>{cls.strength}</Text>
        </View>

        <Text style={s.headline} numberOfLines={1}>{event.news_headline}</Text>
      </View>

      {/* Change */}
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={[s.pct, { color: pctCol }, web({ textShadow: `0 0 12px rgba(${RGB[pctCol] ?? '0,255,136'},0.55)` }) as any]}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </Text>
        <Text style={s.pctSub}>5M</Text>
      </View>
    </Animated.View>
  );
}

// ── Screen ────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { events, wallet, loading, connected, lastUpdated, refresh } = useMarket();
  const [refreshing, setRefreshing] = useState(false);

  const anomalyCount = events.filter(e => e.anomaly || (e.price_change_5m_pct ?? 0) < -12).length;
  const buyCount     = events.filter(e => classify(e).action !== 'HOLD').length;
  const avgChg       = events.length ? events.reduce((a, e) => a + (e.price_change_5m_pct ?? 0), 0) / events.length : 0;
  const ts = lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

  const sorted = useMemo(() => [...events].sort((a, b) => {
    const ord = { ANOMALY: 0, BREAKOUT: 1, STABLE: 2, NEUTRAL: 3 };
    return (ord[classify(a).label] ?? 4) - (ord[classify(b).label] ?? 4);
  }), [events]);

  return (
    <View style={s.root}>
      <ScanlineOverlay />
      {events.length > 0 && <HealthStrip events={events} />}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} tintColor={T.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Hero wallet={wallet} events={events} connected={connected} ts={ts} />

        {/* Stat grid 2×2 */}
        <View style={s.grid}>
          <Stat label="ANOMALIES DETECTED" value={anomalyCount} sub="threat events active"         color={anomalyCount > 0 ? T.sell : T.tDim} delay={150} />
          <Stat label="BUY SIGNALS"        value={buyCount}     sub="agent recommendations"         color={T.buy} trend={events.length ? (buyCount / events.length) * 100 : 0} delay={230} />
        </View>
        <View style={s.grid}>
          <Stat label="AVG PRICE MOVE"     value={`${avgChg >= 0 ? '+' : ''}${avgChg.toFixed(2)}%`} sub="5-minute across all assets" color={avgChg >= 0 ? T.buy : T.sell} delay={310} />
          <Stat label="ASSETS TRACKED"     value={events.length} sub="live real-time feed"          color={T.accent} delay={390} />
        </View>

        {/* Widgets */}
        {events.length > 0 && <Widgets events={events} />}

        {/* Signal feed */}
        <View style={s.secRow}>
          <Dot color={T.accent} size={7} />
          <Text style={s.secLabel}>SIGNAL FEED</Text>
          <Text style={s.secCount}>RANKED BY THREAT LEVEL</Text>
        </View>

        {loading && !events.length ? (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>Connecting to infra server…</Text>
            <Text style={s.emptyHint}>Start with: cd infra && npm start</Text>
          </View>
        ) : (
          <View style={[s.feed, web({ boxShadow: '0 2px 12px rgba(0,0,0,0.50), 0 8px 28px rgba(0,0,0,0.60)', animation: 'pdxFeedPulse 6s ease-in-out infinite' }) as any]}>
            <Shimmer color={T.accent} />
            <FC />
            <View style={s.feedHead}>
              <Text style={s.feedHeadCell}>RK</Text>
              <Text style={[s.feedHeadCell, { flex: 1 }]}>ASSET · CLASSIFICATION · ACTION</Text>
              <Text style={[s.feedHeadCell, { textAlign: 'right' }]}>Δ 5M</Text>
            </View>
            {sorted.map((ev, i) => <SignalRow key={ev.id} rank={i + 1} event={ev} />)}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

// ── StyleSheet ───────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: T.bg },
  scroll:  { flex: 1 },
  content: { paddingBottom: 28 },

  // Health strip
  strip:        { flexDirection: 'row', alignItems: 'center', height: 42, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: T.b2, backgroundColor: T.bg },
  stripBias:    { flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 14, borderRightWidth: 1, height: '100%' as any, marginRight: 14 },
  stripBiasText:{ fontFamily: T.mono, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  stripItem:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 16 },
  stripLabel:   { fontFamily: T.mono, fontSize: 10, color: T.tDim, letterSpacing: 1 },
  stripValue:   { fontFamily: T.mono, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Hero
  hero:         { margin: 14, marginBottom: 12, backgroundColor: T.bgCard, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,255,209,0.18)', padding: 20, position: 'relative', overflow: 'hidden' },
  heroTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  heroEyebrow:  { fontFamily: T.mono, fontSize: 10, color: T.tDim, letterSpacing: 1.5 },
  heroTitle:    { fontFamily: T.mono, fontSize: 26, color: T.tLoud, fontWeight: '800', letterSpacing: 3, lineHeight: 30 },
  heroTagline:  { fontFamily: T.mono, fontSize: 9,  color: T.tDim, letterSpacing: 1.8, marginTop: 4 },
  heroValue:    { fontFamily: T.mono, fontSize: 44, color: T.accent, fontWeight: '800', lineHeight: 46, marginBottom: 6 },
  heroValueLabel: { fontFamily: T.mono, fontSize: 10, color: T.tDim, letterSpacing: 1.5 },
  livePill:     { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot:      { width: 6, height: 6, borderRadius: 3 },
  liveText:     { fontFamily: T.mono, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  liveTime:     { fontFamily: T.mono, fontSize: 9,  color: T.tDim },
  assetName:    { fontFamily: T.mono, fontSize: 10, letterSpacing: 1, width: 36 },
  assetPct:     { fontFamily: T.mono, fontSize: 10, color: T.tDim, width: 28, textAlign: 'right' },
  assetUsd:     { fontFamily: T.mono, fontSize: 10, color: T.tMuted, width: 62, textAlign: 'right' },

  // Stat cards
  grid:       { flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginBottom: 10 },
  stat:       { flex: 1, backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.b2, borderRadius: 16, padding: 16, position: 'relative', overflow: 'hidden', minHeight: 116 },
  statLabel:  { fontFamily: T.mono, fontSize: 10, color: T.tDim, letterSpacing: 1.4, textTransform: 'uppercase' },
  statValue:  { fontFamily: T.mono, fontSize: 34, fontWeight: '800', lineHeight: 36, marginTop: 4 },
  statSub:    { fontFamily: T.mono, fontSize: 10, color: T.tDim },
  statTrend:  { fontFamily: T.mono, fontSize: 10, fontWeight: '700' },

  // Widgets
  widgetRow:  { flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginBottom: 10 },
  widget:     { flex: 1, backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.b2, borderRadius: 16, padding: 16, position: 'relative', overflow: 'hidden' },
  widgetLabel:{ fontFamily: T.mono, fontSize: 10, color: T.tDim, letterSpacing: 1.4 },
  legendKey:  { fontFamily: T.mono, fontSize: 9 },
  vixVal:     { fontFamily: T.mono, fontSize: 32, fontWeight: '800', lineHeight: 34 },
  vixLvl:     { fontFamily: T.mono, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 3 },
  vixScale:   { fontFamily: T.mono, fontSize: 9, color: T.tDim },

  // Section row
  secRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, marginBottom: 10 },
  secLabel: { fontFamily: T.mono, fontSize: 11, color: T.tMuted, letterSpacing: 2, flex: 1 },
  secCount: { fontFamily: T.mono, fontSize: 10, color: T.tDim },

  // Feed card
  feed:        { marginHorizontal: 14, backgroundColor: T.bgCard, borderWidth: 1, borderColor: T.b2, borderRadius: 16, overflow: 'hidden', position: 'relative', marginBottom: 4 },
  feedHead:    { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.b1, backgroundColor: T.bgPanel },
  feedHeadCell:{ fontFamily: T.mono, fontSize: 9, color: T.tDim, letterSpacing: 1 },

  // Signal row
  sigRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderLeftWidth: 2, borderBottomWidth: 1, borderBottomColor: T.b1 },
  rank:     { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rankTxt:  { fontFamily: T.mono, fontSize: 10, fontWeight: '700' },
  sigAsset: { fontFamily: T.mono, fontSize: 20, fontWeight: '800', color: T.tLoud },
  badge:    { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  badgeText:{ fontFamily: T.mono, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  actTag:   { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  actTagTxt:{ fontFamily: T.mono, fontSize: 9, fontWeight: '700' },
  strNum:   { fontFamily: T.mono, fontSize: 11, fontWeight: '700', minWidth: 22 },
  headline: { fontFamily: T.mono, fontSize: 10, color: T.tDim, lineHeight: 14 },
  pct:      { fontFamily: T.mono, fontSize: 17, fontWeight: '800', minWidth: 64, textAlign: 'right' },
  pctSub:   { fontFamily: T.mono, fontSize: 9,  color: T.tDim, textAlign: 'right', letterSpacing: 1 },

  empty:    { alignItems: 'center', paddingVertical: 52, gap: 10 },
  emptyTxt: { fontFamily: T.mono, fontSize: 14, color: T.tDim },
  emptyHint:{ fontFamily: T.mono, fontSize: 11, color: T.b3 },
});
