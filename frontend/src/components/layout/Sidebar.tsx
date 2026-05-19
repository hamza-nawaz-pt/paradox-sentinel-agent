import React from 'react';
import { LayoutDashboard, Cpu, BarChart2, MessageSquare, Bell, Zap } from 'lucide-react';
import type { Tab } from '../../types';
import { useMarket } from '../../store/MarketContext';
import { toggleChaos } from '../../api';

const NAV = [
  { id: 'dashboard' as Tab, label: 'Dashboard',   shortLabel: 'HOME',     icon: LayoutDashboard },
  { id: 'agent'     as Tab, label: 'Agent Core',   shortLabel: 'AGENT',    icon: Cpu },
  { id: 'analytics' as Tab, label: 'Analytics',    shortLabel: 'DATA',     icon: BarChart2 },
  { id: 'chat'      as Tab, label: 'AI Assistant', shortLabel: 'CHAT',     icon: MessageSquare },
  { id: 'alerts'    as Tab, label: 'Alerts',        shortLabel: 'ALERTS',   icon: Bell },
];

export default function Sidebar({ active, onNav }: { active: Tab; onNav: (t: Tab) => void }) {
  const { connected, chaosMode, setChaosMode, events } = useMarket();
  const anomalies = events.filter(e => e.anomaly || (e.price_change_5m_pct ?? 0) < -12).length;

  async function handleChaos() {
    const data = await toggleChaos();
    setChaosMode(data.chaos_mode);
  }

  return (
    <>
      {/* ─── Desktop sidebar (hidden on mobile) ─────────────────────── */}
      <aside className="hidden md:flex w-[220px] flex-shrink-0 flex-col h-screen border-r border-white/[0.06] bg-bg-950">
        {/* Logo */}
        <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/35 flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-accent" style={{ boxShadow: '0 0 8px #00FFD1' }} />
            </div>
            <span className="text-white font-extrabold text-sm tracking-[0.12em]">PARADOX</span>
          </div>
          <div className="text-[10px] text-white/30 tracking-[0.18em] pl-9">SENTINEL v2.0</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-4 space-y-1">
          {NAV.map(({ id, label, icon: Icon }) => {
            const isActive = active === id;
            const hasBadge = id === 'alerts' && anomalies > 0;
            return (
              <button
                key={id}
                onClick={() => onNav(id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 relative group"
                style={{
                  background: isActive ? 'rgba(0,255,209,0.08)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(0,255,209,0.25)' : 'transparent'}`,
                }}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-accent rounded-r"
                    style={{ boxShadow: '0 0 8px #00FFD1' }} />
                )}
                <Icon size={15} color={isActive ? '#00FFD1' : 'rgba(255,255,255,0.35)'}
                  className="transition-colors group-hover:!text-white/60" />
                <span className={`text-[12px] font-bold tracking-wide transition-colors ${
                  isActive ? 'text-accent' : 'text-white/40 group-hover:text-white/60'
                }`}>{label}</span>
                {hasBadge && (
                  <span className="ml-auto w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
                    {anomalies}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="px-3 pb-5 space-y-2 border-t border-white/[0.06] pt-4">
          <button
            onClick={handleChaos}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200"
            style={{
              background: chaosMode ? 'rgba(255,45,85,0.09)' : 'transparent',
              border: `1px solid ${chaosMode ? 'rgba(255,45,85,0.30)' : 'rgba(255,255,255,0.07)'}`,
            }}
          >
            <Zap size={14} color={chaosMode ? '#FF2D55' : 'rgba(255,255,255,0.30)'} />
            <span className={`text-[11px] font-bold ${chaosMode ? 'text-danger' : 'text-white/30'}`}>
              {chaosMode ? 'CHAOS ON' : 'Chaos Mode'}
            </span>
            <div className={`ml-auto w-7 h-3.5 rounded-full transition-colors relative ${chaosMode ? 'bg-danger/40' : 'bg-white/10'}`}>
              <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${
                chaosMode ? 'right-0.5 bg-danger' : 'left-0.5 bg-white/30'}`} />
            </div>
          </button>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-danger'}`}
              style={{ boxShadow: connected ? '0 0 6px #00FF88' : '0 0 6px #FF2D55' }} />
            <span className={`text-[10px] font-bold tracking-wider ${connected ? 'text-success/70' : 'text-danger/70'}`}>
              {connected ? 'CONNECTED' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </aside>

      {/* ─── Mobile bottom nav bar ───────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center
                      h-16 bg-bg-950/97 backdrop-blur-md border-t border-white/[0.08]"
        style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        {NAV.map(({ id, shortLabel, icon: Icon }) => {
          const isActive = active === id;
          const hasBadge = id === 'alerts' && anomalies > 0;
          return (
            <button
              key={id}
              onClick={() => onNav(id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 h-full relative"
            >
              {/* Active indicator bar at top */}
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{ background: '#00FFD1', boxShadow: '0 0 8px #00FFD1' }} />
              )}
              {/* Icon with optional badge */}
              <div className="relative">
                <Icon
                  size={20}
                  color={isActive ? '#00FFD1' : 'rgba(255,255,255,0.28)'}
                  style={isActive ? { filter: 'drop-shadow(0 0 5px rgba(0,255,209,0.7))' } : {}}
                />
                {hasBadge && (
                  <span className="absolute -top-1 -right-2 w-3.5 h-3.5 rounded-full bg-danger
                                   text-white text-[7px] font-extrabold flex items-center justify-center"
                    style={{ boxShadow: '0 0 4px #FF2D55' }}>
                    {anomalies}
                  </span>
                )}
              </div>
              <span className={`text-[8px] font-extrabold tracking-wider ${
                isActive ? 'text-accent' : 'text-white/22'
              }`}>{shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
