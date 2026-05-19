import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, CheckCircle,
  XCircle, Zap, BarChart2, Shield, DollarSign,
} from 'lucide-react';
import { useMarket } from '../store/MarketContext';
import { scoreAndDecide, sanitizeEvent, classifyEvent } from '../lib/agent';
import type { MarketEvent } from '../types';

// ── Design tokens (mirrors Dashboard) ─────────────────────────────
const ASSET_COLOR: Record<string, string> = {
  USDC:'#00FFD1', BTC:'#FFD600', ETH:'#BF5FFF', SOL:'#00FF88', FAKE:'#FF6B00',
};
const ACTION_COLOR: Record<string, string> = {
  BUY:'#00FF88', SELL:'#FF2D55', LIQUIDATE_TO_USDC:'#FF2D55',
  HOLD:'rgba(255,255,255,0.35)', HEDGE:'#FFD600', SET_STOP_LOSS:'#FFD600',
};
const PALETTE = ['#00FFD1','#00FF88','#FF2D55','#FFD600','#BF5FFF','#4DACFF'];

// ── Sub-components matching Dashboard style ────────────────────────
function LiveDot({ color = '#00FFD1', size = 6 }: { color?: string; size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ backgroundColor: color }} />
      <div className="absolute inset-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 5px ${color}` }} />
    </div>
  );
}

function Shimmer({ color }: { color: string }) {
  return (
    <div className="absolute top-0 left-0 right-0 h-px pointer-events-none" style={{
      background: `linear-gradient(90deg, transparent 5%, ${color}CC 50%, transparent 95%)`,
    }} />
  );
}

function Glow({ color }: { color: string }) {
  const rgb = color.replace('#','').match(/.{2}/g)?.map(h=>parseInt(h,16)).join(',') ?? '0,255,209';
  return (
    <div className="absolute top-0 left-0 right-0 h-20 pointer-events-none" style={{
      background: `radial-gradient(ellipse 80% 100% at 50% 0%, rgba(${rgb},0.12) 0%, transparent 100%)`,
    }} />
  );
}

// count-up hook
function useCountUp(target: number) {
  const [val, setVal] = useState(0);
  const live = useRef(false);
  useEffect(() => {
    if (!target || live.current) return;
    live.current = true;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1,(Date.now()-start)/900);
      setVal(target * (1-Math.pow(1-t,3)));
      if (t < 1) requestAnimationFrame(tick); else { setVal(target); live.current=false; }
    };
    requestAnimationFrame(tick);
  }, [target]);
  return val;
}

function StatCard({ label, value, sub, color, icon: Icon, delay=0, prefix='', suffix='' }: {
  label:string; value:number|string; sub:string; color:string; icon:any; delay?:number; prefix?:string; suffix?:string;
}) {
  const num = typeof value === 'number' ? value : 0;
  const counted = useCountUp(num);
  const display = typeof value === 'string' ? value : `${prefix}${counted % 1 === 0 ? Math.round(counted) : counted.toFixed(2)}${suffix}`;
  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay, duration:0.4 }}
      className="card flex-1 p-5 min-w-0"
      style={{ boxShadow:'0 4px 20px rgba(0,0,0,0.5)' }}>
      <Shimmer color={color} />
      <Glow color={color} />
      <div className="flex items-center gap-2 mb-4">
        <LiveDot color={color} size={5} />
        <span className="label">{label}</span>
      </div>
      <div className="text-4xl font-extrabold tracking-tight mb-2" style={{ color, textShadow:`0 0 20px ${color}55` }}>
        {display}
      </div>
      <div className="flex items-center gap-2">
        <Icon size={12} color="rgba(255,255,255,0.28)" />
        <span className="text-[11px] text-white/35">{sub}</span>
      </div>
    </motion.div>
  );
}

// Custom chart tooltip
const DarkTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'#0D1525', border:'1px solid rgba(255,255,255,0.10)', borderRadius:10, padding:'10px 14px', fontFamily:'JetBrains Mono' }}>
      {label && <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10, marginBottom:6 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color ?? p.fill ?? '#00FFD1', fontSize:11, fontWeight:700 }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(3) : p.value}
        </div>
      ))}
    </div>
  );
};

// Section header (matching Dashboard's "SIGNAL FEED" row)
function SectionHead({ label, sub }: { label:string; sub?:string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <LiveDot size={5} />
      <span className="text-[11px] font-bold tracking-[0.15em] text-white/50">{label}</span>
      <div className="flex-1 h-px bg-white/[0.05]" />
      {sub && <span className="label">{sub}</span>}
    </div>
  );
}

// ── Agent score bar per asset ──────────────────────────────────────
function ScoreBar({ score, asset }: { score: number; asset: string }) {
  const color = score > 0.38 ? '#00FF88' : score > 0.06 ? '#00FFD1' : score < -0.20 ? '#FF2D55' : score < -0.50 ? '#FF2D55' : '#FFD600';
  const pct   = ((score + 1) / 2) * 100; // map [-1,1] → [0,100]
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 80); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-bold w-12 flex-shrink-0" style={{ color: ASSET_COLOR[asset] ?? '#00FFD1' }}>{asset}</span>
      <div className="flex-1 relative h-5 bg-white/[0.04] rounded overflow-hidden border border-white/[0.06]">
        {/* Zero line */}
        <div className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left:'50%' }} />
        {/* Score fill from center */}
        <div className="absolute top-0.5 bottom-0.5 rounded transition-all duration-1000 ease-out" style={{
          left:  score >= 0 ? '50%' : `${pct}%`,
          width: `${Math.abs(score)/2*100}%`,
          background: `linear-gradient(${score>=0?'90deg':'270deg'}, ${color}55, ${color})`,
          boxShadow: `0 0 8px ${color}88`,
        }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-extrabold" style={{ color }}>{score >= 0 ? '+' : ''}{score.toFixed(3)}</span>
        </div>
      </div>
      <span className="text-[9px] font-bold w-16 flex-shrink-0 text-right" style={{ color }}>
        {score > 0.38 ? 'BREAKOUT' : score > 0.06 ? 'BUY' : score < -0.50 ? 'LIQUIDATE' : score < -0.20 ? 'HEDGE' : 'HOLD'}
      </span>
    </div>
  );
}

// ── Factor breakdown radar ─────────────────────────────────────────
function FactorBreakdown({ components }: { components: Record<string, string> }) {
  const factors = [
    { factor:'Price', value: Math.abs(+components.price)*100, raw: +components.price },
    { factor:'Volume', value: Math.abs(+components.volume)*100, raw: +components.volume },
    { factor:'On-Chain', value: Math.abs(+components.onchain)*100, raw: +components.onchain },
    { factor:'Sentiment', value: Math.abs(+components.sentiment)*100, raw: +components.sentiment },
    { factor:'Order Book', value: Math.abs(+components.book)*100, raw: +components.book },
  ];
  return (
    <ResponsiveContainer width="100%" height={160}>
      <RadarChart data={factors} margin={{ top:10, right:20, bottom:10, left:20 }}>
        <PolarGrid stroke="rgba(255,255,255,0.06)" />
        <PolarAngleAxis dataKey="factor"
          tick={{ fill:'rgba(255,255,255,0.35)', fontSize:9, fontFamily:'JetBrains Mono' }} />
        <PolarRadiusAxis domain={[0,100]} tick={false} axisLine={false} />
        <Radar dataKey="value" stroke="#00FFD1" fill="#00FFD1" fillOpacity={0.12}
          strokeWidth={1.5} dot={{ r:2, fill:'#00FFD1' }} />
        <Tooltip content={<DarkTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── Market health strip ────────────────────────────────────────────
function HealthStrip({ events }: { events: MarketEvent[] }) {
  const scores  = events.map(e => scoreAndDecide(sanitizeEvent(e).sanitized).score ?? 0);
  const avgScore = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : 0;
  const bullish  = scores.filter(s => s > 0.06).length;
  const bearish  = scores.filter(s => s < -0.06).length;
  const avgChg   = events.length ? events.reduce((a,e)=>a+(e.price_change_5m_pct??0),0)/events.length : 0;
  const anomalies = events.filter(e => e.anomaly||(e.price_change_5m_pct??0)<-12).length;
  const items = [
    { l:'AVG SCORE',    v: `${avgScore>=0?'+':''}${avgScore.toFixed(3)}`, c: avgScore>=0.06?'#00FF88':avgScore<-0.06?'#FF2D55':'#FFD600' },
    { l:'BULLISH',      v: `${bullish}`,                                  c:'#00FF88' },
    { l:'BEARISH',      v: `${bearish}`,                                  c:'#FF2D55' },
    { l:'AVG MOVE',     v: `${avgChg>=0?'+':''}${avgChg.toFixed(2)}%`,   c: avgChg>=0?'#00FF88':'#FF2D55' },
    { l:'ANOMALIES',    v: `${anomalies}`,                                c: anomalies>0?'#FF2D55':'rgba(255,255,255,0.25)' },
    { l:'ASSETS',       v: `${events.length}`,                           c:'#00FFD1' },
  ];
  const bias = bullish > bearish ? 'BULLISH' : bullish < bearish ? 'BEARISH' : 'NEUTRAL';
  const biasCol = bias === 'BULLISH' ? '#00FF88' : bias === 'BEARISH' ? '#FF2D55' : '#FFD600';
  return (
    <div className="flex items-center h-10 px-6 border-b border-white/[0.06] gap-0 overflow-x-auto">
      <div className="flex items-center gap-2 pr-5 border-r border-white/[0.06] mr-5 flex-shrink-0">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: biasCol, boxShadow:`0 0 4px ${biasCol}` }} />
        <span className="text-[10px] font-extrabold tracking-[0.15em]" style={{ color: biasCol }}>{bias}</span>
      </div>
      {items.map((it, i) => (
        <div key={it.l} className="flex items-center gap-2 pr-5 mr-5 flex-shrink-0"
          style={{ borderRight: i < items.length-1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
          <span className="text-[9px] text-white/30 tracking-widest">{it.l}</span>
          <span className="text-[11px] font-extrabold" style={{ color: it.c }}>{it.v}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function Analytics() {
  const { txLog, portfolioHistory, priceHistory, events, portfolioUSD } = useMarket();

  // ── Derived stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total     = txLog.length;
    const buys      = txLog.filter(t => t.action === 'BUY').length;
    const exits     = txLog.filter(t => ['SELL','LIQUIDATE_TO_USDC'].includes(t.action)).length;
    const hedges    = txLog.filter(t => t.action === 'HEDGE').length;
    const successRate = total ? Math.round(((total - exits) / total) * 100) : 0;
    return { total, buys, exits, hedges, successRate };
  }, [txLog]);

  // Live agent scores for each asset
  const liveScores = useMemo(() =>
    events.map(e => {
      const { sanitized, hasMissingData, hasConflictingData } = sanitizeEvent(e);
      const d = scoreAndDecide(sanitized);
      return { asset: e.asset, score: d.score ?? 0, components: d.components ?? {}, action: d.action };
    }), [events]);

  // Decision distribution
  const decisionDist = useMemo(() => {
    const m: Record<string,number> = {};
    for (const tx of txLog) m[tx.action] = (m[tx.action]??0) + 1;
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [txLog]);

  // Asset trade count
  const assetTrades = useMemo(() => {
    const m: Record<string,number> = {};
    for (const tx of txLog) m[tx.asset] = (m[tx.asset]??0) + 1;
    return Object.entries(m).map(([name, value]) => ({ name, value }));
  }, [txLog]);

  // Portfolio chart — only show last 30 points, readable labels
  const portfolioChartData = useMemo(() =>
    portfolioHistory.slice(-30).map((p, i) => ({
      t: new Date(p.t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
      v: +p.v.toFixed(2),
    })), [portfolioHistory]);

  // Asset live % change for performance bar
  const assetPerf = useMemo(() =>
    [...events]
      .sort((a,b) => (b.price_change_5m_pct??0) - (a.price_change_5m_pct??0))
      .map(e => ({
        asset: e.asset,
        pct:   +(e.price_change_5m_pct ?? 0).toFixed(2),
        color: (e.price_change_5m_pct??0) >= 0 ? '#00FF88' : '#FF2D55',
      })), [events]);

  // Factor breakdown — average across all assets
  const avgComponents = useMemo(() => {
    if (!liveScores.length || !liveScores[0].components) return null;
    const keys = Object.keys(liveScores[0].components);
    const avg: Record<string,string> = {};
    for (const k of keys) {
      const mean = liveScores.reduce((s,e) => s + (+( e.components[k] ?? 0)), 0) / liveScores.length;
      avg[k] = mean.toFixed(3);
    }
    return avg;
  }, [liveScores]);

  const pv = useCountUp(portfolioUSD);

  return (
    <div className="min-h-screen bg-bg-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] sticky top-0 bg-bg-950/90 backdrop-blur z-20">
        <div>
          <h1 className="text-sm font-extrabold tracking-[0.15em] text-white">ANALYTICS</h1>
          <p className="text-[10px] text-white/30 tracking-wider mt-0.5 hidden sm:block">
            LIVE SCORES · PORTFOLIO PERFORMANCE · DECISION METRICS
          </p>
        </div>
        <div className="flex items-center gap-2 px-2 sm:px-3 py-1.5 card">
          <LiveDot color="#00FFD1" size={5} />
          <span className="text-[11px] font-bold text-white/50 hidden sm:block">Portfolio</span>
          <span className="text-[12px] sm:text-[13px] font-extrabold text-accent sm:ml-1" style={{ textShadow:'0 0 14px rgba(0,255,209,0.5)' }}>
            ${pv.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
          </span>
        </div>
      </div>

      {/* Market health strip */}
      {events.length > 0 && <HealthStrip events={events} />}

      <div className="px-3 sm:px-6 py-4 sm:py-6 space-y-6 sm:space-y-8 max-w-[1400px] mx-auto">

        {/* ── Stat cards row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
          <StatCard label="Total Trades"  value={stats.total}       sub="pipeline executions"     color="#00FFD1" icon={Activity}     delay={0.05} />
          <StatCard label="Buy Orders"    value={stats.buys}        sub="accumulation + breakout" color="#00FF88" icon={TrendingUp}    delay={0.12} />
          <StatCard label="Exits"         value={stats.exits}       sub="sell · liquidate"        color="#FF2D55" icon={TrendingDown}  delay={0.19} />
          <StatCard label="Hedges"        value={stats.hedges}      sub="put options placed"      color="#FFD600" icon={Shield}        delay={0.26} />
          <StatCard label="Success Rate"  value={stats.successRate} sub="non-exit trades"         color="#BF5FFF" icon={CheckCircle}   delay={0.33} suffix="%" />
        </div>

        {/* ── Live Agent Scores ── */}
        <div>
          <SectionHead label="Live Agent Scores" sub="computed per asset · updates every 3s" />
          <div className="card p-6" style={{ boxShadow:'0 4px 24px rgba(0,0,0,0.5)' }}>
            <Shimmer color="#00FFD1" />
            <Glow color="#00FFD1" />
            {liveScores.length === 0 ? (
              <div className="py-8 text-center text-white/20 text-sm">Waiting for market stream…</div>
            ) : (
              <div className="space-y-4">
                {liveScores.map(s => <ScoreBar key={s.asset} asset={s.asset} score={s.score} />)}
              </div>
            )}
            {/* Score legend */}
            <div className="flex gap-4 mt-5 pt-4 border-t border-white/[0.06] flex-wrap">
              {[
                { label:'BREAKOUT  > +0.38', color:'#00FF88' },
                { label:'BUY  > +0.06',      color:'#00FFD1' },
                { label:'HOLD  ±0.06',        color:'#FFD600' },
                { label:'HEDGE  < −0.20',     color:'#FF6B00' },
                { label:'LIQUIDATE  < −0.50', color:'#FF2D55' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color, boxShadow:`0 0 4px ${l.color}` }} />
                  <span className="text-[9px] text-white/30 tracking-wider">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Portfolio + factor row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Portfolio area chart — full width on mobile, 2 cols on desktop */}
          <div className="lg:col-span-2 card p-5 sm:p-6" style={{ boxShadow:'0 4px 24px rgba(0,0,0,0.5)' }}>
            <Shimmer color="#00FFD1" />
            <Glow color="#00FFD1" />
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <LiveDot size={5} />
                  <span className="label">Portfolio Value Over Time</span>
                </div>
                <div className="text-[10px] text-white/20 mt-1">Snapshots every 3s · last 30 data points</div>
              </div>
              <div className="text-right">
                <div className="text-xl font-extrabold text-accent" style={{ textShadow:'0 0 16px rgba(0,255,209,0.45)' }}>
                  ${portfolioUSD.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
                </div>
                <div className="label">current value</div>
              </div>
            </div>
            {portfolioChartData.length >= 3 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={portfolioChartData} margin={{ top:4, right:4, left:0, bottom:4 }}>
                  <defs>
                    <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#00FFD1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#00FFD1" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="t"
                    tick={{ fill:'rgba(255,255,255,0.22)', fontSize:9, fontFamily:'JetBrains Mono' }}
                    tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis
                    tick={{ fill:'rgba(255,255,255,0.22)', fontSize:9, fontFamily:'JetBrains Mono' }}
                    tickLine={false} axisLine={false}
                    tickFormatter={v => `$${(v/1000).toFixed(1)}k`} width={52} />
                  <Tooltip content={<DarkTooltip />} />
                  <Area type="monotone" dataKey="v" name="Value $" stroke="#00FFD1" strokeWidth={2}
                    fill="url(#pvGrad)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[200px] flex flex-col items-center justify-center gap-2">
                <Activity size={22} className="text-white/15" />
                <p className="text-white/20 text-xs">Building history… prices drift every 8s</p>
                <div className="flex gap-1.5 mt-1">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent/40"
                      style={{ animation:`blink 1.2s ${i*0.3}s ease-in-out infinite` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Factor breakdown radar — 1 col */}
          <div className="card p-6" style={{ boxShadow:'0 4px 24px rgba(0,0,0,0.5)' }}>
            <Shimmer color="#BF5FFF" />
            <Glow color="#BF5FFF" />
            <div className="flex items-center gap-2 mb-1">
              <LiveDot color="#BF5FFF" size={5} />
              <span className="label">Scoring Factors</span>
            </div>
            <div className="text-[10px] text-white/20 mb-4">Avg across all assets</div>
            {avgComponents ? (
              <>
                <FactorBreakdown components={avgComponents} />
                <div className="space-y-2 mt-2">
                  {[
                    { k:'price',     label:'Price Momentum',   w:'0.28', color:'#00FF88' },
                    { k:'volume',    label:'Volume Spike',      w:'0.26', color:'#00FFD1' },
                    { k:'onchain',   label:'On-Chain',          w:'0.20', color:'#BF5FFF' },
                    { k:'sentiment', label:'Social Sentiment',  w:'0.16', color:'#4DACFF' },
                    { k:'book',      label:'Order Book',        w:'0.10', color:'#FFD600' },
                  ].map(f => {
                    const v = +(avgComponents[f.k] ?? 0);
                    const pct = Math.min(100, Math.abs(v) * 100);
                    return (
                      <div key={f.k} className="flex items-center gap-2">
                        <span className="text-[9px] text-white/30 w-24 flex-shrink-0">{f.label}</span>
                        <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{
                            width:`${pct}%`, backgroundColor: f.color,
                            boxShadow:`0 0 6px ${f.color}88`,
                          }} />
                        </div>
                        <span className="text-[9px] font-bold w-10 text-right" style={{ color: f.color }}>
                          {v >= 0 ? '+' : ''}{v.toFixed(2)}
                        </span>
                        <span className="text-[9px] text-white/20 w-8">{f.w}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="h-[160px] flex items-center justify-center text-white/20 text-xs">
                Waiting for market data…
              </div>
            )}
          </div>
        </div>

        {/* ── Asset performance + Decision dist ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Asset live % change - horizontal bar */}
          <div className="card p-4 sm:p-6" style={{ boxShadow:'0 4px 24px rgba(0,0,0,0.5)' }}>
            <Shimmer color="#4DACFF" />
            <Glow color="#4DACFF" />
            <div className="flex items-center gap-2 mb-5">
              <LiveDot color="#4DACFF" size={5} />
              <span className="label">Asset Performance (5M)</span>
            </div>
            {assetPerf.length === 0 ? (
              <div className="h-[180px] flex items-center justify-center text-white/20 text-sm">No market data</div>
            ) : (
              <div className="space-y-4">
                {assetPerf.map(a => {
                  const maxAbs = Math.max(...assetPerf.map(x => Math.abs(x.pct)), 1);
                  const barPct = (Math.abs(a.pct) / maxAbs) * 100;
                  return (
                    <div key={a.asset} className="flex items-center gap-3">
                      <span className="text-[12px] font-extrabold w-12 flex-shrink-0"
                        style={{ color: ASSET_COLOR[a.asset] ?? '#00FFD1' }}>{a.asset}</span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-6 bg-white/[0.04] rounded overflow-hidden border border-white/[0.06] relative">
                          <div className="absolute top-0.5 bottom-0.5 rounded transition-all duration-1000 ease-out"
                            style={{
                              left:  a.pct >= 0 ? '50%' : `${50 - barPct/2}%`,
                              width: `${barPct/2}%`,
                              background: `linear-gradient(${a.pct>=0?'90deg':'270deg'}, ${a.color}44, ${a.color})`,
                              boxShadow: `0 0 8px ${a.color}88`,
                            }} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-extrabold" style={{ color: a.color }}>
                              {a.pct >= 0 ? '+' : ''}{a.pct}%
                            </span>
                          </div>
                        </div>
                      </div>
                      {(() => {
                        const ev = events.find(e => e.asset === a.asset);
                        return ev ? (
                          <span className="text-[11px] text-white/35 w-24 text-right font-mono">
                            ${ev.current_price >= 1 ? ev.current_price.toLocaleString('en-US',{maximumFractionDigits:2}) : ev.current_price.toFixed(5)}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Decision donut */}
          <div className="card p-4 sm:p-6" style={{ boxShadow:'0 4px 24px rgba(0,0,0,0.5)' }}>
            <Shimmer color="#FFD600" />
            <Glow color="#FFD600" />
            <div className="flex items-center gap-2 mb-5">
              <LiveDot color="#FFD600" size={5} />
              <span className="label">Decision Distribution</span>
            </div>
            {decisionDist.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center gap-2">
                <BarChart2 size={22} className="text-white/15" />
                <p className="text-white/20 text-xs">Run the agent pipeline to record decisions</p>
              </div>
            ) : (
              <div className="flex items-center gap-4 sm:gap-6">
                <div className="relative flex-shrink-0" style={{ width: 140, height: 140 }}>
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={decisionDist} cx="50%" cy="50%" innerRadius={44} outerRadius={72}
                        dataKey="value" paddingAngle={4} startAngle={90} endAngle={-270}>
                        {decisionDist.map((entry, i) => (
                          <Cell key={i}
                            fill={ACTION_COLOR[entry.name] ?? PALETTE[i % PALETTE.length]}
                            stroke="#060B12" strokeWidth={2}
                            style={{ filter:`drop-shadow(0 0 4px ${ACTION_COLOR[entry.name] ?? PALETTE[i%PALETTE.length]}88)` }} />
                        ))}
                      </Pie>
                      <Tooltip content={<DarkTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-2xl font-extrabold text-white">{txLog.length}</span>
                    <span className="label">trades</span>
                  </div>
                </div>
                <div className="flex-1 space-y-3">
                  {decisionDist.map((entry, i) => {
                    const col = ACTION_COLOR[entry.name] ?? PALETTE[i % PALETTE.length];
                    const pct = Math.round((entry.value / txLog.length) * 100);
                    return (
                      <div key={entry.name}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: col, boxShadow:`0 0 4px ${col}` }} />
                            <span className="text-[11px] text-white/50">{entry.name}</span>
                          </div>
                          <span className="text-[11px] font-bold" style={{ color: col }}>{entry.value}</span>
                        </div>
                        <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{
                            width:`${pct}%`, backgroundColor: col, boxShadow:`0 0 4px ${col}`,
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Trades per asset bar ── */}
        {assetTrades.length > 0 && (
          <div className="card p-6" style={{ boxShadow:'0 4px 24px rgba(0,0,0,0.5)' }}>
            <Shimmer color="#00FF88" />
            <Glow color="#00FF88" />
            <div className="flex items-center gap-2 mb-5">
              <LiveDot color="#00FF88" size={5} />
              <span className="label">Trade Frequency by Asset</span>
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={assetTrades} margin={{ top:4, right:4, left:0, bottom:4 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="name"
                  tick={{ fill:'rgba(255,255,255,0.45)', fontSize:11, fontFamily:'JetBrains Mono', fontWeight:700 }}
                  tickLine={false} axisLine={false} />
                <YAxis tick={{ fill:'rgba(255,255,255,0.22)', fontSize:10, fontFamily:'JetBrains Mono' }}
                  tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="value" name="Trades" radius={[5,5,0,0]}>
                  {assetTrades.map((entry,i) => (
                    <Cell key={i}
                      fill={ASSET_COLOR[entry.name] ?? PALETTE[i%PALETTE.length]}
                      style={{ filter:`drop-shadow(0 0 6px ${ASSET_COLOR[entry.name] ?? PALETTE[i%PALETTE.length]}88)` }} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Transaction log ── */}
        <div>
          <SectionHead label={`Transaction Log`} sub={`${txLog.length} total`} />
          <div className="card overflow-hidden" style={{ boxShadow:'0 4px 24px rgba(0,0,0,0.5)' }}>
            <Shimmer color="#00FFD1" />
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-bg-900/60">
                    {['TX ID','Time','Asset','Action','Size','Price','Summary'].map(h => (
                      <th key={h} className="px-4 py-3 text-left label whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txLog.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-14 text-center text-white/20">
                        No transactions yet — run the agent pipeline from Agent Core
                      </td>
                    </tr>
                  ) : (
                    [...txLog].reverse().map((tx, i) => {
                      const col  = ACTION_COLOR[tx.action] ?? 'rgba(255,255,255,0.40)';
                      const aCol = ASSET_COLOR[tx.asset] ?? '#00FFD1';
                      return (
                        <motion.tr key={tx.tx_id}
                          initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay: Math.min(i,10)*0.03 }}
                          className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors"
                          style={{ borderLeft: `2px solid ${col}55` }}>
                          <td className="px-4 py-3 text-white/25">{tx.tx_id.slice(0,16)}…</td>
                          <td className="px-4 py-3 text-white/35 whitespace-nowrap">
                            {new Date(tx.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                          </td>
                          <td className="px-4 py-3 font-extrabold" style={{ color: aCol, textShadow:`0 0 8px ${aCol}55` }}>
                            {tx.asset}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2.5 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap"
                              style={{ color:col, borderColor:`${col}44`, background:`${col}15` }}>
                              {tx.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/50">{tx.size}</td>
                          <td className="px-4 py-3 text-white/50 whitespace-nowrap">
                            ${(+tx.price_at_execution).toLocaleString('en-US',{maximumFractionDigits:2})}
                          </td>
                          <td className="px-4 py-3 text-white/35 max-w-[240px] truncate">{tx.summary}</td>
                        </motion.tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="h-8" />
      </div>
    </div>
  );
}
