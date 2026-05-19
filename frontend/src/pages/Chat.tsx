import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Cpu, RefreshCw } from 'lucide-react';
import { useMarket } from '../store/MarketContext';
import { sendChat } from '../api';

type Msg = { id: string; role: 'user'|'assistant'; text: string; ts: Date };

const SUGGESTIONS = [
  'What is Sentinel doing right now?',
  'How does the scoring engine work?',
  'What is the current risk level?',
  'Tell me about BTC',
  'Explain chaos mode',
  'Show my portfolio',
  'What were the last trades?',
  'Why was SOL liquidated?',
];

const WELCOME = `Hello. I'm Sentinel AI, your autonomous market intelligence assistant.

I have real-time access to the live market stream, agent decisions, and your simulated wallet.

Ask me anything about:
• Current market conditions and anomalies
• How the 3-agent scoring pipeline works
• Recent trade decisions and rationale
• Portfolio composition and risk exposure
• System features like Chaos Mode and Sentinel Mode`;

function MsgBubble({ msg }: { msg: Msg }) {
  const isBot = msg.role === 'assistant';
  return (
    <motion.div
      initial={{ opacity:0, y:10 }}
      animate={{ opacity:1, y:0 }}
      transition={{ duration:0.25 }}
      className={`flex gap-3 ${isBot ? '' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center border ${
        isBot ? 'bg-accent/10 border-accent/30' : 'bg-white/[0.06] border-white/15'
      }`}>
        {isBot ? <Bot size={13} color="#00FFD1"/> : <User size={13} color="rgba(255,255,255,0.50)"/>}
      </div>
      {/* Bubble */}
      <div className={`max-w-[78%] rounded-2xl px-4 py-3 ${
        isBot
          ? 'bg-bg-800 border border-white/[0.08] rounded-tl-sm'
          : 'bg-accent/10 border border-accent/20 rounded-tr-sm'
      }`}>
        <pre className={`text-[12px] leading-[1.7] whitespace-pre-wrap font-mono ${
          isBot ? 'text-white/80' : 'text-accent'
        }`}>{msg.text}</pre>
        <div className="text-[9px] text-white/20 mt-1.5">
          {msg.ts.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' })}
        </div>
      </div>
    </motion.div>
  );
}

export default function Chat() {
  const { events, wallet, portfolioUSD, txLog, chaosMode } = useMarket();
  const [messages, setMessages] = useState<Msg[]>([
    { id:'welcome', role:'assistant', text: WELCOME, ts: new Date() },
  ]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9999, behavior:'smooth' });
  }, [messages.length]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(p => [...p, { id: Date.now().toString(), role:'user', text: msg, ts: new Date() }]);
    setLoading(true);

    try {
      const data = await sendChat(msg);
      setMessages(p => [...p, { id: (Date.now()+1).toString(), role:'assistant', text: data.response ?? 'No response.', ts: new Date() }]);
    } catch {
      // Fallback: client-side smart responses when backend unavailable
      const reply = clientFallback(msg.toLowerCase(), { events, wallet, portfolioUSD, txLog, chaosMode });
      setMessages(p => [...p, { id:(Date.now()+1).toString(), role:'assistant', text: reply, ts: new Date() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="h-screen flex flex-col bg-bg-950">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-white/[0.06] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center">
            <Cpu size={14} color="#00FFD1" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-[0.15em] text-white">SENTINEL AI</h1>
            <p className="text-[10px] text-white/30 tracking-wider">Context-aware market assistant</p>
          </div>
        </div>
        <button onClick={() => setMessages([{ id:'reset', role:'assistant', text: WELCOME, ts: new Date() }])}
          className="btn-ghost py-1.5">
          <RefreshCw size={11} />
          <span>Clear</span>
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-5 space-y-4">
        {messages.map(m => <MsgBubble key={m.id} msg={m} />)}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-accent/10 border border-accent/30 flex items-center justify-center flex-shrink-0">
              <Bot size={13} color="#00FFD1" />
            </div>
            <div className="bg-bg-800 border border-white/[0.08] rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1 items-center h-5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent/60"
                    style={{ animation:`blink 1.2s ${i*0.2}s ease-in-out infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="px-3 sm:px-6 py-2 border-t border-white/[0.04] flex gap-2 overflow-x-auto flex-shrink-0">
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => send(s)}
            className="flex-shrink-0 px-3 py-1.5 text-[10px] font-bold text-white/40 border border-white/[0.08] rounded-full
                       hover:border-accent/30 hover:text-accent transition-all duration-200 whitespace-nowrap">
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-3 sm:px-6 pb-4 sm:pb-5 pt-3 flex-shrink-0">
        <div className="flex gap-3 bg-bg-800 border border-white/10 rounded-2xl px-4 py-3 focus-within:border-accent/30 transition-colors">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
            placeholder="Ask about market conditions, agent decisions, scoring…"
            className="flex-1 bg-transparent text-[12px] text-white/80 placeholder-white/20 focus:outline-none font-mono"
            disabled={loading}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()}
            className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center
                       hover:bg-accent/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">
            <Send size={13} color="#00FFD1" />
          </button>
        </div>
        <p className="text-[9px] text-white/15 text-center mt-2 tracking-wider">
          Reads live market data · trade history · wallet state
        </p>
      </div>
    </div>
  );
}

// Client-side fallback when backend /api/chat is unavailable
function clientFallback(msg: string, ctx: any): string {
  const { events, wallet, portfolioUSD, txLog, chaosMode } = ctx;
  const anomalies = (events as any[]).filter((e:any) => e.anomaly || (e.price_change_5m_pct??0) < -12);

  if (msg.includes('doing') || msg.includes('status') || msg.includes('happening')) {
    let r = `System status:\n\n• Monitoring ${events.length} assets in real-time\n• Portfolio: $${(+portfolioUSD).toLocaleString('en-US',{maximumFractionDigits:2})}\n`;
    if (anomalies.length) r += `• ⚠ ${anomalies.length} anomaly signal(s): ${anomalies.map((e:any)=>e.asset).join(', ')}\n`;
    else r += `• No anomalies — markets stable\n`;
    if (chaosMode) r += `• ⚡ Chaos Mode ACTIVE\n`;
    if (txLog.length) r += `\nLast trade: ${txLog[txLog.length-1]?.summary}`;
    return r;
  }
  if (msg.includes('scor') || msg.includes('weight') || msg.includes('how') && msg.includes('work')) {
    return `Multi-Factor Scoring Engine v4.0:\n\n• Price Momentum   (0.28) — normalized 5m change\n• Volume Spike     (0.26) — log-normalized vs baseline\n• On-Chain Data    (0.20) — whale sell pressure\n• Social Sentiment (0.16) — AFINN NLP score\n• Order Book       (0.10) — spread + bid collapse\n\nScore range [-1.0, +1.0]:\n> +0.38 → BUY (Breakout)\n+0.06 to +0.38 → BUY (Accumulation)\n-0.20 to +0.06 → HOLD\n-0.50 to -0.20 → HEDGE\n< -0.50 → LIQUIDATE`;
  }
  if (msg.includes('btc') || msg.includes('bitcoin')) {
    const e = (events as any[]).find((e:any) => e.asset==='BTC');
    if (!e) return 'BTC data unavailable — start the backend server.';
    return `BTC current status:\n\n• Price: $${(+e.current_price).toLocaleString('en-US',{maximumFractionDigits:2})}\n• 5m Change: ${(e.price_change_5m_pct>=0?'+':'')}${e.price_change_5m_pct.toFixed(2)}%\n• Sentiment: ${e.social_sentiment_score}/100\n• Volume: ${e.volume_spike_multiplier}×\n• Anomaly: ${e.anomaly?'⚠ YES':'No'}`;
  }
  if (msg.includes('eth') || msg.includes('ethereum')) {
    const e = (events as any[]).find((e:any) => e.asset==='ETH');
    if (!e) return 'ETH data unavailable.';
    return `ETH current status:\n\n• Price: $${(+e.current_price).toLocaleString('en-US',{maximumFractionDigits:2})}\n• 5m Change: ${(e.price_change_5m_pct>=0?'+':'')}${e.price_change_5m_pct.toFixed(2)}%\n• Sentiment: ${e.social_sentiment_score}/100\n• Volume: ${e.volume_spike_multiplier}×`;
  }
  if (msg.includes('sol') || msg.includes('solana')) {
    const e = (events as any[]).find((e:any) => e.asset==='SOL');
    if (!e) return 'SOL data unavailable.';
    return `SOL current status:\n\n• Price: $${(+e.current_price).toLocaleString('en-US',{maximumFractionDigits:2})}\n• 5m Change: ${(e.price_change_5m_pct>=0?'+':'')}${e.price_change_5m_pct.toFixed(2)}%\n• Anomaly: ${e.anomaly?'⚠ YES — EMERGENCY LIQUIDATION TRIGGER':'No'}`;
  }
  if (msg.includes('portfolio') || msg.includes('wallet') || msg.includes('balance')) {
    let r = `Portfolio breakdown:\n\n`;
    if (wallet) for (const [asset, bal] of Object.entries(wallet)) {
      const ev = (events as any[]).find((e:any) => e.asset===asset);
      const price = ev?.current_price ?? (asset==='USDC'?1:0);
      r += `• ${asset}: ${bal} @ $${price.toFixed(2)} = $${((bal as number)*price).toFixed(2)}\n`;
    }
    r += `\nTotal: $${(+portfolioUSD).toLocaleString('en-US',{maximumFractionDigits:2})}`;
    return r;
  }
  if (msg.includes('chaos')) {
    return chaosMode
      ? `⚡ Chaos Mode is ACTIVE.\n\nAll /api/execute-action calls return HTTP 500. Agent 2 will retry 3× with exponential backoff (1s → 2s), then route to the Fallback Secondary Liquidity Bridge.\n\nToggle it off from the sidebar or Agent tab.`
      : `Chaos Mode is currently OFF.\n\nWhen enabled, it injects HTTP 500 into the execution endpoint to demonstrate Agent 2's retry + fallback recovery logic.`;
  }
  if (msg.includes('risk') || msg.includes('danger') || msg.includes('threat')) {
    const lvl = anomalies.length >= 2 ? '🔴 HIGH' : anomalies.length === 1 ? '🟡 ELEVATED' : '🟢 LOW';
    let r = `Risk level: ${lvl}\n\n`;
    if (!anomalies.length) r += 'All assets showing normal signals. No active threats.';
    else r += anomalies.map((e:any) => `• ${e.asset}: ${e.price_change_5m_pct.toFixed(2)}% ${e.anomaly?'— CONFIRMED ANOMALY':''}`).join('\n');
    return r;
  }
  if (msg.includes('trade') || msg.includes('history') || msg.includes('last')) {
    if (!txLog.length) return 'No trades executed yet. Run the Agent pipeline to begin.';
    return `Last ${Math.min(5,txLog.length)} trades:\n\n` +
      [...txLog].slice(-5).reverse().map((t:any) => `• ${t.tx_id.slice(0,12)}… ${t.summary}`).join('\n');
  }
  if (msg.includes('sentinel')) {
    return `Paradox Sentinel is a 3-agent autonomous crypto intelligence system:\n\nAGENT 0 — Content Parser\nIngests unstructured text → sentiment, risk signals, asset mentions via AFINN NLP.\n\nAGENT 1 — Market Analyst\nFetches live prices, sanitizes data, runs 5-factor scoring engine.\n\nAGENT 2 — Risk Mitigation\nSizes positions, executes trades, handles failures with exponential backoff + fallback bridge.\n\nSentinel Mode: autonomous 5s polling — triggers pipeline automatically on anomaly detection.`;
  }
  return `I'm monitoring ${events.length} assets in real-time.\n\nPortfolio: $${(+portfolioUSD).toLocaleString('en-US',{maximumFractionDigits:2})} | Anomalies: ${anomalies.length} | Chaos: ${chaosMode?'ON':'off'}\n\nTry asking: "current risk", "how does scoring work", "tell me about BTC", "explain chaos mode", or "show my portfolio".`;
}
