import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, TrendingDown, Zap, ShieldOff, Volume2, VolumeX } from 'lucide-react';
import { useMarket } from '../store/MarketContext';
import { classifyEvent } from '../lib/agent';
import type { MarketEvent } from '../types';

type Alert = {
  id: string;
  asset: string;
  type: 'ANOMALY' | 'PUMP_RISK' | 'CRITICAL_DROP' | 'BREAKOUT';
  message: string;
  pct: number;
  ts: Date;
  read: boolean;
};

function alertFromEvent(ev: MarketEvent): Alert | null {
  const cls = classifyEvent(ev);
  const pct = ev.price_change_5m_pct ?? 0;
  if (cls.label === 'ANOMALY')
    return { id:`${ev.id}-${Date.now()}`, asset:ev.asset, type:'ANOMALY',
      message:`${ev.asset} anomaly detected: ${pct.toFixed(2)}% crash. Agent 2 will trigger LIQUIDATE_TO_USDC.`,
      pct, ts: new Date(), read: false };
  if (cls.label === 'PUMP_RISK')
    return { id:`${ev.id}-${Date.now()}`, asset:ev.asset, type:'PUMP_RISK',
      message:`${ev.asset} pump-and-dump pattern detected: +${pct.toFixed(2)}% with dead volume. Trade BLOCKED.`,
      pct, ts: new Date(), read: false };
  if (pct < -8)
    return { id:`${ev.id}-${Date.now()}`, asset:ev.asset, type:'CRITICAL_DROP',
      message:`${ev.asset} dropped ${pct.toFixed(2)}% in 5 minutes. Monitoring for anomaly confirmation.`,
      pct, ts: new Date(), read: false };
  return null;
}

const ALERT_CONFIG = {
  ANOMALY:      { color:'#FF2D55', bg:'rgba(255,45,85,0.10)',  border:'rgba(255,45,85,0.35)',  icon: ShieldOff,   label:'ANOMALY' },
  PUMP_RISK:    { color:'#FF6B00', bg:'rgba(255,107,0,0.10)', border:'rgba(255,107,0,0.35)', icon: AlertTriangle, label:'PUMP RISK' },
  CRITICAL_DROP:{ color:'#FFD600', bg:'rgba(255,214,0,0.08)', border:'rgba(255,214,0,0.30)', icon: TrendingDown,  label:'CRITICAL DROP' },
  BREAKOUT:     { color:'#00FF88', bg:'rgba(0,255,136,0.08)', border:'rgba(0,255,136,0.30)', icon: Zap,           label:'BREAKOUT' },
};

export default function Alerts() {
  const { events } = useMarket();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [muted, setMuted]   = useState(false);
  const prevEvents          = useRef<string>('');

  // Detect new anomalies from event updates
  useEffect(() => {
    const snapshot = JSON.stringify(events.map(e => ({ id:e.id, anomaly:e.anomaly, pct:Math.round((e.price_change_5m_pct??0)*10)/10 })));
    if (snapshot === prevEvents.current) return;
    prevEvents.current = snapshot;
    const newAlerts = events.map(alertFromEvent).filter(Boolean) as Alert[];
    if (newAlerts.length > 0) {
      setAlerts(p => {
        const existing = new Set(p.map(a => a.asset + a.type));
        const fresh = newAlerts.filter(a => !existing.has(a.asset + a.type));
        return [...fresh, ...p].slice(0, 50);
      });
    }
  }, [events]);

  const unread = alerts.filter(a => !a.read).length;

  function markAll() {
    setAlerts(p => p.map(a => ({ ...a, read: true })));
  }

  return (
    <div className="min-h-screen bg-bg-950">
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] sticky top-0 bg-bg-950/80 backdrop-blur z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-extrabold tracking-[0.15em] text-white">ALERTS</h1>
          {unread > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-danger text-white text-[10px] font-bold">{unread}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setMuted(v => !v)} className="btn-ghost py-1.5">
            {muted ? <VolumeX size={12}/> : <Volume2 size={12}/>}
            <span>{muted ? 'Muted' : 'Sound'}</span>
          </button>
          {unread > 0 && (
            <button onClick={markAll} className="btn-ghost py-1.5">
              <span>Mark all read</span>
            </button>
          )}
        </div>
      </div>

      <div className="px-3 sm:px-6 py-4 sm:py-6 max-w-[800px] mx-auto space-y-3">
        {alerts.length === 0 && (
          <div className="text-center py-24">
            <div className="w-14 h-14 rounded-2xl bg-success/10 border border-success/25 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={22} color="#00FF88" />
            </div>
            <p className="text-success/60 font-bold tracking-wider text-sm">NO ACTIVE ALERTS</p>
            <p className="text-white/20 text-xs mt-2">System is monitoring. Alerts appear automatically when anomalies are detected.</p>
          </div>
        )}

        <AnimatePresence>
          {alerts.map((alert, i) => {
            const cfg = ALERT_CONFIG[alert.type];
            const Icon = cfg.icon;
            return (
              <motion.div key={alert.id}
                initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:20 }}
                transition={{ delay: i < 5 ? i*0.05 : 0, duration:0.3 }}
                onClick={() => setAlerts(p => p.map(a => a.id===alert.id ? {...a,read:true} : a))}
                className="card px-3 sm:px-5 py-3 sm:py-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                style={{ borderColor: alert.read ? 'rgba(255,255,255,0.08)' : cfg.border,
                         borderLeft: `3px solid ${cfg.color}`, boxShadow: alert.read ? 'none' : `0 0 16px ${cfg.color}22` }}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{ background: cfg.bg, border:`1px solid ${cfg.border}` }}>
                    <Icon size={14} color={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded border"
                        style={{ color:cfg.color, background:cfg.bg, borderColor:cfg.border }}>
                        {cfg.label}
                      </span>
                      <span className="text-lg font-extrabold" style={{ color:cfg.color }}>{alert.asset}</span>
                      <span className={`text-sm font-bold ${alert.pct>=0?'text-success':'text-danger'}`}>
                        {alert.pct>=0?'+':''}{alert.pct.toFixed(2)}%
                      </span>
                      {!alert.read && (
                        <div className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse ml-auto" />
                      )}
                    </div>
                    <p className="text-[11px] text-white/55 leading-relaxed">{alert.message}</p>
                  </div>
                  <div className="text-[10px] text-white/25 flex-shrink-0">
                    {alert.ts.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
