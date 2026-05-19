import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMarket } from '../../contexts/MarketContext';

const IS_WEB = Platform.OS === 'web';

// ── CSS animations (web only) ─────────────────────────────────────
if (IS_WEB && typeof document !== 'undefined') {
  const SID = '__pdx_alerts_anim__';
  if (!document.getElementById(SID)) {
    const el = document.createElement('style');
    el.id = SID;
    el.textContent = `
      @keyframes heroCardPulse {
        0%,100% { box-shadow:0 4px 32px rgba(0,0,0,0.65),0 0 0 1px rgba(0,255,136,0.12) inset }
        50%     { box-shadow:0 4px 48px rgba(0,0,0,0.80),0 0 0 1px rgba(0,255,136,0.45) inset,0 0 60px rgba(0,255,136,0.09) }
      }
    `;
    document.head.appendChild(el);
  }
}

// ── Count-up hook ─────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200): number {
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

// ── Paradox Terminal design system ───────────────────────────────
const T = {
  bg:       '#060B12', bgCard:    '#0D1525', bgCardAlt: '#111E30',
  bgPanel:  '#040810',
  accent:   '#00FFD1', sell:      '#FF2D55', buy:       '#00FF88',
  warn:     '#FFD600',
  border1:  'rgba(255,255,255,0.07)',
  border2:  'rgba(255,255,255,0.13)',
  border3:  'rgba(255,255,255,0.17)',
  borderAccent: 'rgba(0,255,209,0.40)',
  textLoud:    '#FFFFFF',
  textDefault: 'rgba(255,255,255,0.90)',
  textMuted:   'rgba(255,255,255,0.65)',
  textDim:     'rgba(255,255,255,0.45)',
  mono: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  // legacy aliases
  get teal()      { return this.accent; },
  get crimson()   { return this.sell; },
  get green()     { return this.buy; },
  get amber()     { return this.warn; },
  get textBright(){ return this.textLoud; },
  get textBody()  { return this.textDefault; },
};

// ── Comparison data ───────────────────────────────────────────────
interface CompRow {
  asset:        string;
  event:        string;
  pct:          number;
  sentiment:    number;
  botAction:    string;
  botOutcome:   string;
  botPnL:       string;
  agentAction:  string;
  agentOutcome: string;
  agentPnL:     string;
  winner:       'agent' | 'bot' | 'tie';
}

const COMPARISON: CompRow[] = [
  {
    asset: 'SOL', pct: -15.3, sentiment: 8,
    event: 'Exploit rumor — $47M drained',
    botAction:    'SELL (generic)',
    botOutcome:   'Partial exit, slippage -2.1%',
    botPnL:       '-$345.80',
    agentAction:  'LIQUIDATE_TO_USDC',
    agentOutcome: '100% capital preserved',
    agentPnL:     '+$3,460.50 USDC secured',
    winner: 'agent',
  },
  {
    asset: 'ETH', pct: 0.12, sentiment: 62,
    event: 'Stable gas fees, neutral market',
    botAction:    'HOLD (no signal)',
    botOutcome:   'Missed accumulation window',
    botPnL:       '$0 (opportunity cost)',
    agentAction:  'BUY (context-aware)',
    agentOutcome: 'Accumulated 0.1 ETH @ $3,741',
    agentPnL:     'Position opened (+$374 exposure)',
    winner: 'agent',
  },
  {
    asset: 'BTC', pct: 3.87, sentiment: 81,
    event: 'ETF inflows, $94K breakout',
    botAction:    'BUY (price trigger)',
    botOutcome:   'Position opened',
    botPnL:       '+$948.70 (0.1 BTC)',
    agentAction:  'BUY (breakout + vol confirm)',
    agentOutcome: 'Position opened, vol-confirmed',
    agentPnL:     '+$948.70 (0.1 BTC)',
    winner: 'tie',
  },
];

// ── Metric cards ──────────────────────────────────────────────────
const METRICS = [
  { label: 'Capital Preserved (SOL crash)',  agent: '$3,460',   bot: '-$345',   agentWins: true },
  { label: 'Decisions with context',          agent: '3 / 3',    bot: '0 / 3',   agentWins: true },
  { label: 'Reasoning trace generated',       agent: 'Yes',      bot: 'No',      agentWins: true },
  { label: 'Sentiment awareness',             agent: 'Yes',      bot: 'No',      agentWins: true },
  { label: 'On-chain data used',              agent: 'Yes',      bot: 'No',      agentWins: true },
  { label: 'BTC breakout result',             agent: '+$948.70', bot: '+$948.70',agentWins: false },
];

// ── Sub-components ────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLine} />
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function PnLBadge({ value, isAgent }: { value: string; isAgent: boolean }) {
  const positive = value.startsWith('+') || value.includes('secured') || value.includes('opened');
  const negative  = value.startsWith('-');
  const color = isAgent
    ? (positive ? T.green : negative ? T.crimson : T.amber)
    : (negative ? T.crimson : positive ? T.textBody : T.textDim);
  return (
    <Text style={[styles.pnlText, { color }]}>{value}</Text>
  );
}

function ComparisonCard({ row }: { row: CompRow }) {
  const pctColor = row.pct < 0 ? T.crimson : T.green;

  return (
    <View style={styles.compCard}>
      {/* Asset header */}
      <View style={styles.compAssetRow}>
        <Text style={styles.compAsset}>${row.asset}</Text>
        <Text style={[styles.compPct, { color: pctColor }]}>
          {row.pct > 0 ? '+' : ''}{row.pct}%
        </Text>
        <View style={[styles.sentimentPill, {
          backgroundColor: row.sentiment < 30 ? 'rgba(255,45,85,0.18)' : row.sentiment > 60 ? 'rgba(0,255,136,0.18)' : 'rgba(255,214,0,0.18)',
        }]}>
          <Text style={[styles.sentimentText, {
            color: row.sentiment < 30 ? T.crimson : row.sentiment > 60 ? T.green : T.amber,
          }]}>SENT {row.sentiment}</Text>
        </View>
        {row.winner === 'agent' && (
          <View style={styles.winnerBadge}>
            <Text style={styles.winnerText}>AGENT WINS</Text>
          </View>
        )}
      </View>

      <Text style={styles.eventLabel}>{row.event}</Text>

      {/* Side-by-side actions */}
      <View style={styles.vsRow}>
        {/* Bot column */}
        <View style={[styles.vsCol, styles.vsColBot]}>
          <Text style={styles.vsColTitle}>STANDARD BOT</Text>
          <Text style={styles.vsAction}>{row.botAction}</Text>
          <Text style={styles.vsOutcome}>{row.botOutcome}</Text>
          <PnLBadge value={row.botPnL} isAgent={false} />
        </View>

        <View style={styles.vsDivider}>
          <Text style={styles.vsLabel}>VS</Text>
        </View>

        {/* Agent column */}
        <View style={[styles.vsCol, styles.vsColAgent, row.winner === 'agent' && styles.vsColAgentWins]}>
          <Text style={[styles.vsColTitle, { color: T.teal }]}>PARADOX SENTINEL</Text>
          <Text style={[styles.vsAction, { color: T.textBright }]}>{row.agentAction}</Text>
          <Text style={styles.vsOutcome}>{row.agentOutcome}</Text>
          <PnLBadge value={row.agentPnL} isAgent={true} />
        </View>
      </View>
    </View>
  );
}

function MetricsTable() {
  return (
    <View style={styles.metricsCard}>
      <View style={styles.metricsHeader}>
        <Text style={styles.metricsHeaderCell}>METRIC</Text>
        <Text style={[styles.metricsHeaderCell, { color: T.textBody }]}>BOT</Text>
        <Text style={[styles.metricsHeaderCell, { color: T.teal }]}>SENTINEL</Text>
      </View>
      {METRICS.map((m, i) => (
        <View key={i} style={[styles.metricsRow, i % 2 === 0 && styles.metricsRowAlt]}>
          <Text style={styles.metricsLabel}>{m.label}</Text>
          <Text style={[styles.metricsVal, { color: m.agentWins ? T.crimson : T.textBody }]}>
            {m.bot}
          </Text>
          <Text style={[styles.metricsVal, { color: m.agentWins ? T.green : T.textBody }]}>
            {m.agent}
          </Text>
        </View>
      ))}
    </View>
  );
}

function KeyDifferences() {
  const diffs = [
    { icon: 'bulb-outline' as const, text: 'Sentinel constructs an explicit Workplan and Reasoning Trace before acting. The bot fires on a fixed price threshold.' },
    { icon: 'shield-checkmark-outline' as const, text: 'During the SOL exploit, Sentinel liquidated 100% to USDC, preserving $3,460. The bot issued a generic SELL with 2.1% slippage.' },
    { icon: 'search-outline' as const, text: 'Sentinel used sentiment score, whale on-chain data, volume multiplier, and anomaly flags. The bot used price change alone.' },
    { icon: 'git-network-outline' as const, text: 'Sentinel operates as a two-agent pipeline (Market Analyst → Risk Mitigation). The bot is a single if-else function.' },
  ];

  return (
    <View style={styles.diffsCard}>
      <Text style={styles.diffsTitle}>WHY AGENTIC SYSTEMS WIN</Text>
      {diffs.map((d, i) => (
        <View key={i} style={styles.diffRow}>
          <Ionicons name={d.icon} size={16} color={T.teal} style={{ marginTop: 1 }} />
          <Text style={styles.diffText}>{d.text}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────
export default function AlertsScreen() {
  const { connected } = useMarket();
  const heroCount     = useCountUp(3460.50, 1300);
  const botCount      = useCountUp(345.80,  1000);
  const agentCount    = useCountUp(3460.50, 1300);

  return (
    <View style={styles.root}>
      <View style={styles.screenHeader}>
        <Text style={[styles.screenTitle, IS_WEB && { textShadow: '0 0 22px rgba(0,255,209,0.65)' } as any]}>ANALYSIS</Text>
        <Text style={styles.screenSub}>AGENTIC vs NON-AGENTIC COMPARISON</Text>
        <View style={[styles.statusPill, { borderColor: connected ? 'rgba(0,255,136,0.30)' : 'rgba(255,45,85,0.30)' }]}>
          <View style={[styles.statusDot, { backgroundColor: connected ? T.green : T.crimson }]} />
          <Text style={[styles.statusText, { color: connected ? T.green : T.crimson }]}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Hero stat */}
        <FadeSlide delay={80}>
          <View style={[styles.heroCard, IS_WEB && { animation: 'heroCardPulse 5s ease-in-out infinite' } as any]}>
            <Text style={styles.heroLabel}>CAPITAL PRESERVED IN SOL CRASH</Text>
            <Text style={[styles.heroValue, IS_WEB && { textShadow: '0 0 32px rgba(0,255,136,0.65)' } as any]}>
              ${heroCount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            <Text style={styles.heroSub}>Paradox Sentinel executed LIQUIDATE_TO_USDC in 0ms</Text>
            <View style={styles.heroComparison}>
              <View style={styles.heroCol}>
                <Text style={styles.heroColLabel}>STANDARD BOT</Text>
                <Text style={[styles.heroColValue, { color: T.crimson }]}>
                  -${botCount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
              <View style={styles.heroColDivider} />
              <View style={styles.heroCol}>
                <Text style={[styles.heroColLabel, { color: T.teal }]}>PARADOX SENTINEL</Text>
                <Text style={[styles.heroColValue, { color: T.green }]}>
                  +${agentCount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>
          </View>
        </FadeSlide>

        <FadeSlide delay={200}>
          <SectionHeader title="EVENT-BY-EVENT BREAKDOWN" />
          {COMPARISON.map((row, i) => <ComparisonCard key={row.asset} row={row} />)}
        </FadeSlide>

        <FadeSlide delay={350}>
          <SectionHeader title="PERFORMANCE METRICS" />
          <MetricsTable />
        </FadeSlide>

        <FadeSlide delay={500}>
          <SectionHeader title="KEY ARCHITECTURAL DIFFERENCES" />
          <KeyDifferences />
        </FadeSlide>

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: T.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 16 },

  screenHeader: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: T.border3 },
  screenTitle:  { fontFamily: T.mono, fontSize: 22, color: T.accent, letterSpacing: 3, fontWeight: '700' },
  screenSub:    { fontFamily: T.mono, fontSize: 10, color: T.textDim, letterSpacing: 2, marginTop: 3, marginBottom: 8 },
  statusPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusText:   { fontFamily: T.mono, fontSize: 9, letterSpacing: 1 },

  sectionHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 14 },
  sectionLine:  { flex: 1, height: 1, backgroundColor: T.border3 },
  sectionTitle: { fontFamily: T.mono, fontSize: 10, color: T.textMuted, letterSpacing: 2 },

  // Hero
  heroCard: {
    backgroundColor: T.bgCard, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(0,255,136,0.25)', padding: 18, marginTop: 16,
    shadowColor: T.buy, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.28, shadowRadius: 24, elevation: 10,
  },
  heroLabel:     { fontFamily: T.mono, fontSize: 10, color: T.textDim, letterSpacing: 2, marginBottom: 8 },
  heroValue:     { fontFamily: T.mono, fontSize: 44, color: T.buy, fontWeight: '800', marginBottom: 4 },
  heroSub:       { fontFamily: T.mono, fontSize: 11, color: T.textMuted, marginBottom: 16 },
  heroComparison:{ flexDirection: 'row', backgroundColor: T.bgPanel, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: T.border2 },
  heroCol:       { flex: 1, alignItems: 'center', padding: 12 },
  heroColLabel:  { fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 6 },
  heroColValue:  { fontFamily: T.mono, fontSize: 24, fontWeight: '800' },
  heroColDivider:{ width: 1, backgroundColor: T.border2 },

  // Comparison card
  compCard: { backgroundColor: T.bgCard, borderRadius: 12, borderWidth: 1, borderColor: T.border3, marginBottom: 10, overflow: 'hidden' },
  compAssetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 6 },
  compAsset: { fontFamily: T.mono, fontSize: 22, color: T.textLoud, fontWeight: '800' },
  compPct:   { fontFamily: T.mono, fontSize: 17, fontWeight: '800' },
  sentimentPill: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  sentimentText: { fontFamily: T.mono, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  winnerBadge:   { marginLeft: 'auto' as any, backgroundColor: 'rgba(0,255,136,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(0,255,136,0.32)' },
  winnerText:    { fontFamily: T.mono, fontSize: 9, color: T.buy, letterSpacing: 1 },
  eventLabel:    { fontFamily: T.mono, fontSize: 11, color: T.textMuted, paddingHorizontal: 12, paddingBottom: 10 },

  vsRow:          { flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.border3 },
  vsCol:          { flex: 1, padding: 12, gap: 4 },
  vsColBot:       { borderRightWidth: 1, borderRightColor: T.border3, backgroundColor: T.bgPanel },
  vsColAgent:     { backgroundColor: T.bgCard },
  vsColAgentWins: { backgroundColor: 'rgba(0,255,136,0.06)' },
  vsColTitle:     { fontFamily: T.mono, fontSize: 9, color: T.textDim, letterSpacing: 1, marginBottom: 4 },
  vsAction:       { fontFamily: T.mono, fontSize: 14, color: T.textDefault, fontWeight: '700' },
  vsOutcome:      { fontFamily: T.mono, fontSize: 11, color: T.textMuted, lineHeight: 15 },
  pnlText:        { fontFamily: T.mono, fontSize: 13, fontWeight: '700', marginTop: 4 },
  vsDivider:      { width: 1, backgroundColor: T.border3, alignItems: 'center', justifyContent: 'center' },
  vsLabel:        { fontFamily: T.mono, fontSize: 9, color: T.textDim, backgroundColor: T.bgCard, paddingVertical: 4, paddingHorizontal: 2 },

  // Metrics
  metricsCard:      { backgroundColor: T.bgCard, borderRadius: 12, borderWidth: 1, borderColor: T.border3, overflow: 'hidden' },
  metricsHeader:    { flexDirection: 'row', backgroundColor: T.bgCardAlt, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: T.border3 },
  metricsHeaderCell:{ fontFamily: T.mono, fontSize: 8, color: T.textDim, letterSpacing: 1, flex: 1 },
  metricsRow:       { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10 },
  metricsRowAlt:    { backgroundColor: 'rgba(255,255,255,0.015)' },
  metricsLabel:     { fontFamily: T.mono, fontSize: 11, color: T.textDefault, flex: 2, lineHeight: 17 },
  metricsVal:       { fontFamily: T.mono, fontSize: 11, fontWeight: '700', flex: 1, textAlign: 'right' },

  // Key diffs
  diffsCard: { backgroundColor: T.bgCard, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,255,209,0.20)', padding: 14, gap: 12 },
  diffsTitle:{ fontFamily: T.mono, fontSize: 10, color: T.accent, letterSpacing: 2, marginBottom: 4 },
  diffRow:   { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  diffText:  { fontFamily: T.mono, fontSize: 12, color: T.textDefault, flex: 1, lineHeight: 18 },
});
