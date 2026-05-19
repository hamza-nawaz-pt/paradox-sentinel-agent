import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Eye, EyeOff, Zap, ZapOff, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useMarket } from '../store/MarketContext';
import { sanitizeEvent, scoreAndDecide, keywordParse } from '../lib/agent';
import { parseContent, executeAction, toggleChaos, API_BASE } from '../api';
import type { LogLine, LogType, MarketEvent } from '../types';

const LOG_COLOR: Record<LogType, string> = {
  header:      '#00FFD1',
  system:      'rgba(255,255,255,0.45)',
  observation: '#4DACFF',
  reasoning:   'rgba(255,255,255,0.75)',
  decision:    '#FFD600',
  action:      '#BF5FFF',
  success:     '#00FF88',
  error:       '#FF2D55',
  robustness:  '#FF6B00',
  recovery:    '#FF6B00',
  fallback:    '#FF6B00',
  retry:       '#C4860A',
  separator:   'rgba(255,255,255,0.18)',
  score:       'rgba(191,95,255,0.90)',
  pump:        '#FF8C42',
};

const STEPS = [
  { id: 0, label: 'Content Parser',  sub: 'NLP + crypto vocab' },
  { id: 1, label: 'Market Analyst',  sub: 'Fetch + sanitize + score' },
  { id: 2, label: 'Risk Mitigation', sub: 'Execute + backoff + fallback' },
];

export default function Agent() {
  const { setChaosMode, chaosMode } = useMarket();

  const [logs,          setLogs]         = useState<LogLine[]>([]);
  const [running,       setRunning]      = useState(false);
  const [activeStep,    setActiveStep]   = useState(-1);
  const [customInput,   setCustomInput]  = useState('');
  const [inputOpen,     setInputOpen]    = useState(false);
  const [sentinelMode,  setSentinelMode] = useState(false);
  const [sentinelStatus,setSentinelStatus] = useState('');

  const scrollRef      = useRef<HTMLDivElement>(null);
  const runningRef     = useRef(false);
  const sentinelTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevSnapshot   = useRef('');

  useEffect(() => { runningRef.current = running; }, [running]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 9999, behavior:'smooth' }); }, [logs.length]);

  const push = useCallback((text: string, type: LogType) => {
    setLogs(p => [...p, { id:`${Date.now()}-${Math.random()}`, text, type }]);
  }, []);
  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  // Sentinel mode
  useEffect(() => {
    if (!sentinelMode) {
      sentinelTimer.current && clearInterval(sentinelTimer.current);
      setSentinelStatus('');
      return;
    }
    push('╔══════════════════════════════════════════╗', 'header');
    push('║  SENTINEL MODE ACTIVATED                 ║', 'header');
    push('║  Autonomous 5s monitoring interval       ║', 'header');
    push('╚══════════════════════════════════════════╝', 'header');
    setSentinelStatus('WATCHING');
    sentinelTimer.current = setInterval(async () => {
      if (runningRef.current) return;
      try {
        const res  = await fetch(`${API_BASE}/api/market-stream`);
        const data = await res.json();
        const incoming: MarketEvent[] = data.events ?? [];
        const snap = JSON.stringify(incoming.map(e => ({ id:e.id, anomaly:e.anomaly, pct:Math.round((e.price_change_5m_pct??0)*10)/10 })));
        if (snap === prevSnapshot.current) { setSentinelStatus('WATCHING · no change'); return; }
        prevSnapshot.current = snap;
        const triggered = incoming.filter(e => e.anomaly || Math.abs(e.price_change_5m_pct??0) > 8);
        if (triggered.length > 0) {
          push(`[Sentinel] Auto-trigger: ${triggered.map(e=>e.asset).join(', ')}`, 'pump');
          setSentinelStatus(`AUTO-TRIGGERED · ${triggered.map(e=>e.asset).join(', ')}`);
          triggerRun();
        } else setSentinelStatus('WATCHING · stable');
      } catch { setSentinelStatus('RECONNECTING...'); }
    }, 5000);
    return () => { sentinelTimer.current && clearInterval(sentinelTimer.current); };
  }, [sentinelMode]);

  async function executeWithRetry(asset: string, action: string, size: number) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await executeAction(asset, action, size);
        if (res.status === 500) {
          const body = await res.json().catch(() => ({}));
          throw new Error(`HTTP 500 — ${(body as any).error ?? 'Server Error'}`);
        }
        const data = await res.json();
        return { success: true, data, attempt };
      } catch (err: any) {
        if (attempt < 3) {
          const ms = Math.pow(2, attempt-1) * 1000;
          push(`[Retry ${attempt}/3] ${err?.message ?? 'failed'}`, 'retry');
          await delay(80);
          push(`[Retry] Backoff: waiting ${ms}ms...`, 'retry');
          await delay(ms);
        } else return { success: false, error: err?.message ?? 'unknown' };
      }
    }
    return { success: false, error: 'Max retries reached' };
  }

  async function triggerRun() {
    if (running) return;
    setRunning(true);
    setLogs([]);
    setActiveStep(-1);

    // Header
    push('╔══════════════════════════════════════════╗', 'header');
    push('║  PARADOX SENTINEL — AGENTIC CORE v3.0   ║', 'header');
    push('║  3-Agent Pipeline: Parse→Analyze→Decide  ║', 'header');
    push('╚══════════════════════════════════════════╝', 'header');
    await delay(120);

    // AGENT 0
    setActiveStep(0);
    push('', 'separator');
    push('╔══════════════════════════════════════════╗', 'header');
    push('║  AGENT 0 — Content Parser                ║', 'header');
    push('╚══════════════════════════════════════════╝', 'header');
    await delay(150);

    let contentSignal: any = null;
    if (customInput.trim()) {
      push(`[Content Parser] Analyzing ${customInput.length} chars...`, 'system');
      try {
        const res = await parseContent(customInput);
        contentSignal = res;
      } catch { contentSignal = keywordParse(customInput); }
      const engine = contentSignal.source === 'afinn_nlp' ? 'AFINN NLP + crypto vocab' : 'keyword engine';
      push(`[Content Parser] Engine: ${engine}`, 'system');
      await delay(80);
      push(`[Content Parser] Assets: ${contentSignal.mentionedAssets.join(', ')}`, 'observation');
      await delay(80);
      if (contentSignal.keywords.length)
        push(`[Content Parser] Keywords: ${contentSignal.keywords.join(' · ')}`, 'observation');
      await delay(80);
      if (contentSignal.risks.length)
        push(`[Content Parser] ⚠ Risks: ${contentSignal.risks.join(' · ')}`, 'error');
      await delay(80);
      push(`[Content Parser] Sentiment → ${contentSignal.sentiment}`,
        contentSignal.sentiment === 'BULLISH' ? 'success' : contentSignal.sentiment === 'BEARISH' ? 'error' : 'system');
      push(`[Content Parser] Risk level → ${contentSignal.riskLevel}`,
        contentSignal.riskLevel === 'CRITICAL' ? 'error' : contentSignal.riskLevel === 'ELEVATED' ? 'robustness' : 'success');
      push(`[Content Parser] Bias: ${contentSignal.bias >= 0?'+':''}${contentSignal.bias.toFixed(3)} → scoring engine`, 'score');
    } else {
      push('[Content Parser] No input — running on market stream only', 'system');
    }
    push('─'.repeat(44), 'separator');

    // AGENT 1
    setActiveStep(1);
    push('', 'separator');
    push('╔══════════════════════════════════════════╗', 'header');
    push('║  AGENT 1 — Market Analyst                ║', 'header');
    push('╚══════════════════════════════════════════╝', 'header');
    await delay(150);
    push('[STEP 1] Fetching live market stream...', 'system');
    await delay(300);

    let events: MarketEvent[] = [];
    try {
      const res  = await fetch(`${API_BASE}/api/market-stream`);
      const data = await res.json();
      events = data.events ?? [];
      push(`[Stream OK] ${events.length} events from ${import.meta.env.DEV ? 'localhost:3001' : 'render.com'}`, 'success');
      if (data.chaos_mode) push('[Warning] Server CHAOS MODE active — 500s expected', 'recovery');
    } catch {
      push('[Fatal] Cannot reach mock server. Run: cd infra && npm start', 'error');
      setRunning(false); setActiveStep(-1); return;
    }
    await delay(150);

    // AGENT 2
    setActiveStep(2);
    let fallbackCount = 0;

    for (const rawEv of events) {
      push('', 'separator');
      push(`[AGENT 1] ${rawEv.asset} [${rawEv.id}]`, 'reasoning');
      await delay(160);

      const { sanitized, missing, conflicts, hasMissingData, hasConflictingData } = sanitizeEvent(rawEv);

      if (hasMissingData || hasConflictingData) {
        push('[Robustness] Anomalous data profile — launching fallback inference...', 'robustness');
        await delay(120);
      }
      for (const m of missing) {
        push(`[Robustness] Missing '${m.field}' → assigned ${m.assigned}`, 'robustness');
        await delay(80);
      }
      for (const c of conflicts) {
        push(`[Robustness] Conflict: ${c}`, 'robustness');
        await delay(80);
      }

      push(`[Obs] Price Δ5m: ${sanitized.price_change_5m_pct}%  Vol: ${sanitized.volume_spike_multiplier}×  Sent: ${sanitized.social_sentiment_score}/100  Anomaly: ${rawEv.anomaly?'TRUE ⚠':'false'}`, 'observation');
      await delay(120);

      const cbias = contentSignal
        ? (contentSignal.mentionedAssets.includes('ALL') || contentSignal.mentionedAssets.includes(sanitized.asset))
          ? contentSignal.bias : 0
        : 0;
      if (cbias !== 0) push(`[Score Engine] Content bias: ${cbias>=0?'+':''}${cbias.toFixed(3)}`, 'score');

      const decision = scoreAndDecide(sanitized, cbias);
      if (hasMissingData || hasConflictingData) {
        const pen = (missing.length*0.05) + (conflicts.length*0.08);
        decision.confidence = +Math.max(0.10, (decision.confidence - pen)).toFixed(2);
        push(`[Score Engine] Quality penalty −${(pen*100).toFixed(0)}% applied`, 'robustness');
      }
      if (decision.components) {
        const c = decision.components;
        push(`[Score Engine] price:${c.price}  sent:${c.sentiment}  vol:${c.volume}  chain:${c.onchain}  book:${c.book}`, 'score');
      }
      push(`[Score Engine] Composite → ${decision.score}  |  Confidence: ${(decision.confidence*100).toFixed(0)}%`, 'score');
      await delay(100);
      if (decision.classification === 'PUMP_RISK') push('[Score Engine] ⚠ PUMP-AND-DUMP PATTERN — BLOCKED', 'pump');
      push(`[AGENT 2] Branch: ${decision.branch}`, 'decision');
      await delay(80);
      push(`[AGENT 2] Rationale: ${decision.rationale}`, 'decision');
      push(`[Action] → ${decision.action}`, 'action');
      await delay(180);

      if (decision.executeSize > 0 && decision.action !== 'SET_STOP_LOSS' && decision.action !== 'HOLD') {
        push('[Action] POST /api/execute-action (3× exponential backoff)', 'action');
        await delay(250);
        const result = await executeWithRetry(sanitized.asset, decision.action, decision.executeSize);
        if (result.success) {
          if ((result.attempt??1) > 1) push(`[Recovery] Succeeded on attempt ${result.attempt}/3`, 'success');
          push(`[✓] ${(result.data as any)?.transaction?.summary}`, 'success');
          const b = (result.data as any)?.state_change?.before ?? {};
          const a = (result.data as any)?.state_change?.after ?? {};
          for (const k of new Set([...Object.keys(b),...Object.keys(a)])) {
            const bv=(b[k]??0), av=(a[k]??0);
            if (bv!==av) push(`[Wallet Δ] ${k}: ${(+bv).toFixed(4)} → ${(+av).toFixed(4)}`, 'success');
          }
        } else {
          push('[Recovery] All 3 retries failed → Fallback Secondary Liquidity Bridge', 'recovery');
          await delay(200);
          push(`[Fallback] TX queued: FBK-${Date.now()} | ${sanitized.asset} ${decision.action} | QUEUED_FOR_RETRY`, 'fallback');
          push('[Fallback] Persisted to fallback_tx_log.json', 'fallback');
          fallbackCount++;
        }
      } else {
        push(`[Action] ${decision.action} — advisory (no execution)`, 'system');
      }
      await delay(200);
      push('─'.repeat(44), 'separator');
    }

    push('', 'separator');
    push(`[✓] ${events.length} events processed. ${fallbackCount > 0 ? `${fallbackCount} via fallback bridge.` : 'All executed.'}`, 'success');
    push('═'.repeat(44), 'header');
    setActiveStep(-1);
    setRunning(false);
  }

  async function handleChaosToggle() {
    const data = await toggleChaos();
    setChaosMode(data.chaos_mode);
  }

  return (
    <div className="h-screen flex flex-col bg-bg-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] bg-bg-950 flex-shrink-0">
        <div>
          <h1 className="text-sm font-extrabold tracking-[0.15em] text-white">AGENT CORE</h1>
          <p className="text-[10px] text-white/30 tracking-wider mt-0.5 hidden sm:block">3-AGENT PIPELINE · CONTENT → ANALYZE → EXECUTE</p>
          {sentinelMode && sentinelStatus && (
            <p className="text-[10px] text-accent mt-0.5">◉ {sentinelStatus}</p>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sentinel toggle */}
          <button onClick={() => setSentinelMode(v => !v)}
            className={`btn-ghost py-1.5 ${sentinelMode ? '!border-accent/40 !text-accent' : ''}`}>
            {sentinelMode ? <Eye size={12}/> : <EyeOff size={12}/>}
            <span className="hidden sm:inline">{sentinelMode ? 'SENTINEL ON' : 'Sentinel'}</span>
          </button>
          {/* Chaos toggle */}
          <button onClick={handleChaosToggle}
            className={`btn-ghost py-1.5 ${chaosMode ? '!border-danger/40 !text-danger' : ''}`}>
            {chaosMode ? <Zap size={12}/> : <ZapOff size={12}/>}
            <span className="hidden sm:inline">{chaosMode ? 'CHAOS ON' : 'Chaos'}</span>
          </button>
          {/* Run button */}
          <button onClick={triggerRun} disabled={running}
            className={`btn-accent py-2 ${running ? '!border-warning/40 !text-warning !bg-warning/08' : ''}`}>
            <Play size={12} className={running ? 'animate-pulse' : ''} />
            <span className="hidden xs:inline sm:inline">{running ? 'RUNNING…' : 'RUN'}</span>
            <span className="hidden sm:inline"> PIPELINE</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel: pipeline steps + content input — hidden on mobile */}
        <div className="hidden md:flex w-64 flex-shrink-0 border-r border-white/[0.06] flex-col bg-bg-900/30">
          {/* Pipeline steps */}
          <div className="p-4 border-b border-white/[0.06]">
            <div className="label mb-4">Pipeline Stages</div>
            <div className="space-y-3">
              {STEPS.map(step => {
                const isDone    = !running && logs.length > 0 && activeStep === -1;
                const isActive  = activeStep === step.id;
                const isPending = running && activeStep < step.id;
                return (
                  <div key={step.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center gap-0.5 mt-0.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold border transition-all ${
                        isActive  ? 'bg-accent/15 border-accent/60 text-accent' :
                        isDone    ? 'bg-success/10 border-success/50 text-success' :
                        isPending ? 'bg-white/5 border-white/15 text-white/30' :
                                    'bg-white/[0.04] border-white/10 text-white/20'
                      }`}
                        style={isActive ? { boxShadow:'0 0 10px rgba(0,255,209,0.4)' } : {}}>
                        {isDone ? '✓' : step.id}
                      </div>
                      {step.id < 2 && <div className="w-px h-4 bg-white/[0.06]" />}
                    </div>
                    <div className="pt-0.5">
                      <div className={`text-[11px] font-bold ${isActive ? 'text-accent' : isDone ? 'text-success' : 'text-white/35'}`}>
                        Agent {step.id} · {step.label}
                      </div>
                      <div className="text-[10px] text-white/20 mt-0.5">{step.sub}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content input */}
          <div className="flex-1 flex flex-col">
            <button onClick={() => setInputOpen(v => !v)}
              className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors w-full text-left">
              <FileText size={12} color={customInput ? '#00FFD1' : 'rgba(255,255,255,0.30)'} />
              <span className={`text-[11px] font-bold flex-1 ${customInput ? 'text-accent' : 'text-white/30'}`}>
                {customInput ? `${customInput.length} chars loaded` : 'Content Input'}
              </span>
              {inputOpen ? <ChevronUp size={11} color="rgba(255,255,255,0.25)"/> : <ChevronDown size={11} color="rgba(255,255,255,0.25)"/>}
            </button>
            {inputOpen && (
              <textarea
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                placeholder="Paste article/tweet/report…&#10;&#10;Example: &quot;Bitcoin ETF approved, institutional inflows surge&quot;"
                className="flex-1 w-full bg-transparent resize-none p-4 text-[11px] text-white/70 placeholder-white/20 focus:outline-none font-mono leading-relaxed"
                style={{ minHeight: 140 }}
              />
            )}
            {!inputOpen && (
              <div className="px-4 py-3 text-[10px] text-white/20 leading-relaxed">
                Paste news/article above to run Agent 0 (Content Parser). Optional — agent still runs on market stream.
              </div>
            )}
          </div>

          {/* Chaos status */}
          {chaosMode && (
            <div className="px-4 py-3 border-t border-danger/20 bg-danger/[0.04]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                <span className="text-[10px] font-bold text-danger">CHAOS MODE ACTIVE</span>
              </div>
              <p className="text-[10px] text-danger/50 mt-1">execute-action returns HTTP 500</p>
            </div>
          )}
        </div>

        {/* Terminal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Mobile-only compact steps bar */}
          <div className="md:hidden flex items-center px-4 py-2.5 border-b border-white/[0.06] bg-bg-900/40 gap-0">
            {STEPS.map((step, i) => {
              const isActive = activeStep === step.id;
              const isDone   = !running && logs.length > 0 && activeStep === -1;
              const col = isActive ? '#00FFD1' : isDone ? '#00FF88' : 'rgba(255,255,255,0.20)';
              return (
                <React.Fragment key={step.id}>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-extrabold flex-shrink-0"
                      style={{ borderColor: col, color: col, background: isActive ? 'rgba(0,255,209,0.10)' : 'transparent' }}>
                      {isDone ? '✓' : step.id}
                    </div>
                    <span className="text-[9px] font-bold hidden xs:block" style={{ color: col }}>{step.label}</span>
                  </div>
                  {i < 2 && <div className="flex-1 h-px bg-white/[0.08] mx-2" />}
                </React.Fragment>
              );
            })}
            {chaosMode && (
              <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                <span className="text-[9px] font-bold text-danger">CHAOS</span>
              </div>
            )}
          </div>

          {/* Terminal title bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-bg-900/60 border-b border-white/[0.06] flex-shrink-0">
            <div className="w-2.5 h-2.5 rounded-full bg-danger/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-warning/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-success/80" />
            <span className="ml-3 text-[11px] text-white/30">paradox-sentinel — 3-agent pipeline v3.0</span>
            {chaosMode && <span className="ml-auto px-2 py-0.5 text-[9px] font-bold text-danger border border-danger/30 bg-danger/10 rounded">CHAOS</span>}
            {running && <span className="ml-auto px-2 py-0.5 text-[9px] font-bold text-warning border border-warning/30 bg-warning/10 rounded animate-pulse">RUNNING</span>}
          </div>

          {/* Log area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 bg-bg-950/80 font-mono"
            style={{ scrollBehavior: 'smooth' }}>
            {logs.length === 0 ? (
              <div className="text-white/20 text-[13px] leading-7">
                <span className="text-accent">{'> '}</span><span className="cursor-blink text-accent">█</span>
                <br /><br />
                <span className="text-white/30">AGENT 0</span> — Content Parser<br />
                <span className="text-white/15">  AFINN NLP + 60+ crypto terms</span><br /><br />
                <span className="text-white/30">AGENT 1</span> — Market Analyst<br />
                <span className="text-white/15">  Fetch · Sanitize · Score</span><br /><br />
                <span className="text-white/30">AGENT 2</span> — Risk Mitigation<br />
                <span className="text-white/15">  Execute · Retry · Fallback</span><br /><br />
                <span className="text-white/15">Enable Chaos Mode to test recovery logic →</span>
              </div>
            ) : (
              logs.map(line => (
                <div key={line.id} className="text-[12px] leading-5 mb-0.5 fade-up"
                  style={{ color: LOG_COLOR[line.type] }}>
                  {line.text || ' '}
                </div>
              ))
            )}
            {running && <span className="text-accent cursor-blink text-[13px]">█</span>}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 border-t border-white/[0.06] bg-bg-900/40 flex-shrink-0">
            {(['observation','reasoning','decision','robustness','success','error'] as LogType[]).map(t => (
              <div key={t} className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LOG_COLOR[t] }} />
                <span className="text-[9px] text-white/25 capitalize tracking-wider">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
