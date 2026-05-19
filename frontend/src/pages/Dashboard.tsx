import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Activity, Layers, RefreshCw } from 'lucide-react';
import { useMarket } from '../store/MarketContext';
import { classifyEvent } from '../lib/agent';
import type { MarketEvent } from '../types';

const ASSET_COLOR: Record<string, string> = { USDC:'#00FFD1', BTC:'#FFD600', ETH:'#BF5FFF', SOL:'#00FF88', FAKE:'#FF6B00' };
const PRICE_FB: Record<string, number> = { USDC:1, BTC:94870, ETH:3741, SOL:138 };

function useCountUp(target: number) {
  const [val, setVal] = useState(0);
  const ref = useRef(false);
  useEffect(() => {
    if (!target || ref.current) return;
    ref.current = true;
    const start = Date.now();
    const dur = 1200;
    const tick = () => {
      const t = Math.min(1, (Date.now()-start)/dur);
      setVal(target * (1-Math.pow(1-t,3)));
      if (t < 1) requestAnimationFrame(tick); else { setVal(target); ref.current = false; }
    };
    requestAnimationFrame(tick);
  }, [target]);
  return val;
}

function LiveDot({ color = '#00FFD1', size = 7 }: { color?: string; size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full animate-ping opacity-40" style={{ backgroundColor: color }} />
      <div className="absolute inset-0 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
    </div>
  );
}

function Shimmer({ color }: { color: string }) {
  return <div className="absolute top-0 left-0 right-0 h-px" style={{
    background: `linear-gradient(90deg, transparent 5%, ${color}CC 50%, transparent 95%)`,
  }} />;
}

function StatCard({ label, value, sub, color, icon: Icon, delay = 0 }: {
  label: string; value: string|number; sub: string; color: string; icon: any; delay?: number;
}) {
  return (
    <motion.div initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay, duration:0.4 }}
      className="card flex-1 p-5 min-w-0"
      style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
      <Shimmer color={color} />
      <div className="flex items-center gap-2 mb-4">
        <LiveDot color={color} size={6} />
        <span className="label">{label}</span>
      </div>
      <div className="text-4xl font-extrabold tracking-tight mb-2" style={{ color, textShadow: `0 0 20px ${color}55` }}>
        {String(value)}
      </div>
      <div className="flex items-center gap-2">
        <Icon size={12} color="rgba(255,255,255,0.30)" />
        <span className="text-[11px] text-white/35">{sub}</span>
      </div>
    </motion.div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const d = data.map((v, i) => ({ i, v }));
  if (d.length < 2) return <div className="h-10 w-full opacity-20 text-center text-[9px] text-white/30 flex items-center justify-center">no data</div>;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={d} margin={{ top:4, bottom:4, left:0, right:0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AssetCard({ ev, sparkData }: { ev: MarketEvent; sparkData: number[] }) {
  const cls = classifyEvent(ev);
  const pct = ev.price_change_5m_pct ?? 0;
  const col = ASSET_COLOR[ev.asset] ?? '#00FFD1';
  const up  = pct >= 0;

  return (
    <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.35 }}
      className="card p-4" style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.45)' }}>
      <Shimmer color={col} />
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xl font-extrabold tracking-wider" style={{ color: col, textShadow:`0 0 12px ${col}55` }}>
            {ev.asset}
          </div>
          <div className="text-[10px] text-white/30 mt-0.5">{ev.news_headline?.slice(0,40)}…</div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-extrabold ${up ? 'text-success' : 'text-danger'}`}>
            {up ? '+' : ''}{pct.toFixed(2)}%
          </div>
          <div className="label mt-0.5">5M</div>
        </div>
      </div>

      <Sparkline data={sparkData} color={col} />

      <div className="flex items-center justify-between mt-3">
        <div>
          <div className="text-white font-bold text-sm">
            ${ev.current_price >= 1 ? ev.current_price.toLocaleString('en-US',{maximumFractionDigits:2}) : ev.current_price.toFixed(5)}
          </div>
          <div className="label mt-0.5">{ev.volume_spike_multiplier}× vol</div>
        </div>
        <div className="px-2.5 py-1 rounded-full text-[10px] font-bold border" style={{
          color: cls.color, background: cls.bg, borderColor: cls.border,
        }}>
          {cls.label}
        </div>
      </div>
    </motion.div>
  );
}

function PortfolioBar({ asset, pct, usd, color }: { asset: string; pct: number; usd: number; color: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 120); return () => clearTimeout(t); }, [pct]);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] font-bold w-10 text-right" style={{ color }}>{asset}</span>
      <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{
          width: `${Math.min(100,w)}%`,
          background: `linear-gradient(90deg, ${color}66, ${color})`,
          boxShadow: `0 0 8px ${color}88`,
        }} />
      </div>
      <span className="text-[10px] text-white/40 w-8 text-right">{pct.toFixed(0)}%</span>
      <span className="text-[11px] text-white/50 w-20 text-right font-bold">
        ${usd >= 1000 ? (usd/1000).toFixed(1)+'k' : usd.toFixed(0)}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { events, wallet, portfolioUSD, connected, lastUpdated, priceHistory, refresh } = useMarket();
  const [refreshing, setRefreshing] = useState(false);

  const anomalies = events.filter(e => e.anomaly || (e.price_change_5m_pct??0) < -12).length;
  const buys = events.filter(e => classifyEvent(e).action !== 'HOLD').length;
  const avgChg = events.length ? events.reduce((a,e) => a + (e.price_change_5m_pct??0), 0) / events.length : 0;
  const counted = useCountUp(portfolioUSD);

  const ts = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })
    : '—';

  const livePrices: Record<string,number> = { USDC: 1 };
  for (const ev of events) livePrices[ev.asset] = ev.current_price;
  const PRICES = { ...PRICE_FB, ...livePrices };

  // Build sparkline data per asset from priceHistory
  const sparkData = (asset: string) =>
    priceHistory.map(s => s[asset] ?? 0).filter(v => v > 0);

  const sorted = [...events].sort((a,b) => {
    const ord = { ANOMALY:0, PUMP_RISK:1, BREAKOUT:2, STABLE:3, NEUTRAL:4 };
    return (ord[classifyEvent(a).label as keyof typeof ord]??5) - (ord[classifyEvent(b).label as keyof typeof ord]??5);
  });

  async function doRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  return (
    <div className="min-h-screen bg-bg-950 scan-overlay">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] bg-bg-950/80 backdrop-blur sticky top-0 z-20">
        <div>
          <h1 className="text-sm font-extrabold tracking-[0.15em] text-white">DASHBOARD</h1>
          <p className="text-[10px] text-white/30 tracking-wider mt-0.5 hidden sm:block">MULTI-AGENT INTELLIGENCE OVERVIEW</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <LiveDot color={connected ? '#00FF88' : '#FF2D55'} size={6} />
            <span className="text-[11px] font-bold text-white/40 hidden sm:block">{ts}</span>
          </div>
          <button onClick={doRefresh} className="btn-ghost py-1.5">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6 max-w-[1400px] mx-auto">

        {/* Hero + stat row */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* Portfolio hero */}
          <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}
            className="card p-5 sm:p-6 md:w-72 md:flex-shrink-0 glow-card"
            style={{ border: '1px solid rgba(0,255,209,0.18)', boxShadow: '0 4px 32px rgba(0,0,0,0.6)' }}>
            <Shimmer color="#00FFD1" />
            <div className="absolute top-0 left-0 right-0 h-20 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(0,255,209,0.10) 0%, transparent 100%)' }} />
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <LiveDot color={connected ? '#00FF88' : '#FF2D55'} />
                  <span className="label">Live Portfolio</span>
                </div>
                <div className="text-[10px] text-white/25 tracking-widest">PARADOX SENTINEL</div>
              </div>
              <div className="px-2.5 py-1 rounded-full text-[10px] font-bold border border-accent/30 text-accent bg-accent/10">
                {events.length} ASSETS
              </div>
            </div>
            <div className="text-4xl font-extrabold tracking-tight text-accent mb-1"
              style={{ textShadow: '0 0 28px rgba(0,255,209,0.50)' }}>
              ${counted.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}
            </div>
            <div className="label mb-5">TOTAL VALUE (USD)</div>

            {wallet && (
              <div className="space-y-2.5 mt-2">
                {Object.entries(wallet).map(([asset, bal]) => {
                  const usd  = (bal ?? 0) * (PRICES[asset] ?? 0);
                  const pct  = portfolioUSD > 0 ? (usd / portfolioUSD) * 100 : 0;
                  const col  = ASSET_COLOR[asset] ?? '#00FFD1';
                  return <PortfolioBar key={asset} asset={asset} pct={pct} usd={usd} color={col} />;
                })}
              </div>
            )}
          </motion.div>

          {/* Stat cards — 2×2 grid on all sizes */}
          <div className="grid grid-cols-2 gap-3 w-full md:flex-1">
            <StatCard label="Anomalies" value={anomalies}
              sub="threat events" color={anomalies > 0 ? '#FF2D55' : 'rgba(255,255,255,0.25)'}
              icon={AlertTriangle} delay={0.1} />
            <StatCard label="Buy Signals" value={buys}
              sub="agent recommendations" color="#00FF88" icon={TrendingUp} delay={0.18} />
            <StatCard label="Avg 5M Move" value={`${avgChg>=0?'+':''}${avgChg.toFixed(2)}%`}
              sub="across all assets" color={avgChg>=0?'#00FF88':'#FF2D55'}
              icon={avgChg>=0?TrendingUp:TrendingDown} delay={0.26} />
            <StatCard label="Assets" value={events.length}
              sub="live real-time feed" color="#4DACFF" icon={Activity} delay={0.34} />
          </div>
        </div>

        {/* Asset cards */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <LiveDot size={6} />
            <span className="label text-white/50">Live Asset Feed</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="label">Drift every 8s</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {events.map(ev => (
              <AssetCard key={ev.id} ev={ev} sparkData={sparkData(ev.asset)} />
            ))}
          </div>
        </div>

        {/* Signal feed table */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <LiveDot size={6} />
            <span className="label text-white/50">Signal Feed</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="label">Ranked by threat level</span>
          </div>
          <div className="card overflow-hidden" style={{ boxShadow:'0 4px 24px rgba(0,0,0,0.55)' }}>
            <Shimmer color="#00FFD1" />
            {/* Table header */}
            <div className="flex items-center px-3 sm:px-5 py-3 border-b border-white/[0.06] bg-bg-900/60">
              <span className="label w-6 sm:w-8">RK</span>
              <span className="label flex-1">ASSET · SIGNAL · ACTION</span>
              <span className="label w-16 sm:w-20 text-center hidden sm:block">SCORE</span>
              <span className="label w-16 sm:w-20 text-right">Δ 5M</span>
            </div>
            {sorted.map((ev, i) => {
              const cls = classifyEvent(ev);
              const pct = ev.price_change_5m_pct ?? 0;
              const up  = pct >= 0;
              return (
                <motion.div key={ev.id}
                  initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
                  transition={{ delay: i * 0.06, duration:0.3 }}
                  className="flex items-center px-3 sm:px-5 py-3 sm:py-4 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors"
                  style={{ borderLeft: `2px solid ${cls.border}` }}>
                  <div className="w-6 sm:w-8 flex-shrink-0">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: cls.bg, border:`1px solid ${cls.border}`, color: cls.color }}>
                      {i+1}
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <span className="text-xl font-extrabold min-w-[52px]" style={{ color: cls.color, textShadow:`0 0 12px ${cls.color}55` }}>
                      {ev.asset}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border flex-shrink-0"
                      style={{ color:cls.color, background:cls.bg, borderColor:cls.border }}>
                      {cls.label}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded border flex-shrink-0"
                      style={{
                        color: cls.action==='LIQUIDATE'?'#FF2D55':cls.action==='BUY'?'#00FF88':'rgba(255,255,255,0.40)',
                        borderColor: 'rgba(255,255,255,0.10)', background:'rgba(255,255,255,0.04)',
                      }}>
                      → {cls.action}
                    </span>
                    <span className="text-[10px] text-white/25 truncate hidden lg:block">
                      {ev.news_headline}
                    </span>
                  </div>
                  <div className="w-16 sm:w-20 text-center hidden sm:block">
                    <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mx-2">
                      <div className="h-full rounded-full" style={{
                        width:`${Math.min(100,Math.abs(pct)*3)}%`,
                        background: up ? 'linear-gradient(90deg,#00FF8866,#00FF88)' : 'linear-gradient(90deg,#FF2D5566,#FF2D55)',
                      }} />
                    </div>
                  </div>
                  <div className="w-16 sm:w-20 text-right">
                    <span className={`text-sm sm:text-base font-extrabold ${up?'text-success':'text-danger'}`}>
                      {up?'+':''}{pct.toFixed(2)}%
                    </span>
                    <div className="label mt-0.5">5M</div>
                  </div>
                </motion.div>
              );
            })}
            {events.length === 0 && (
              <div className="py-16 text-center">
                <Layers size={28} className="mx-auto mb-3 text-white/20" />
                <p className="text-white/30 text-sm">Connecting to market stream…</p>
                <p className="text-white/15 text-xs mt-1">Start backend: cd infra && npm start</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
