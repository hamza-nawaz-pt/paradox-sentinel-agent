import { useState, useEffect, useCallback, useRef } from 'react';

export const API_BASE = 'http://localhost:3001';
const POLL_MS = 3000;

export interface MarketEvent {
  id: string;
  asset: string;
  timestamp: string;
  current_price: number;
  price_change_5m_pct: number;
  volume_24h: number;
  social_sentiment_score: number;
  news_headline: string;
  anomaly: boolean;
  anomaly_type: string | null;
  volume_spike_multiplier: number;
  order_book: { bid: number; ask: number; spread_pct: number; bid_depth_collapse: boolean };
  on_chain: { large_transfers_count: number; exchange_inflow_usd: number; whale_sell_pressure: string };
}

export interface WalletState {
  USDC: number;
  BTC: number;
  ETH: number;
  SOL: number;
  [key: string]: number;
}

export interface ExecuteResult {
  status: string;
  transaction: {
    tx_id: string;
    timestamp: string;
    asset: string;
    action: string;
    size: number;
    price_at_execution: number;
    summary: string;
    success: boolean;
  };
  state_change: { before: WalletState; after: WalletState };
}

export function useMarketData() {
  const [events,        setEvents]        = useState<MarketEvent[]>([]);
  const [wallet,        setWallet]        = useState<WalletState | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [connected,     setConnected]     = useState(false);
  const [lastUpdated,   setLastUpdated]   = useState<Date | null>(null);
  const [anomalySignal, setAnomalySignal] = useState(0);  // increments on new anomaly
  const timer       = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevSnapshot = useRef<string>('');

  const fetchAll = useCallback(async () => {
    try {
      const [sRes, wRes] = await Promise.all([
        fetch(`${API_BASE}/api/market-stream`),
        fetch(`${API_BASE}/api/wallet`),
      ]);
      const sData = await sRes.json();
      const wData = await wRes.json();
      const incoming: MarketEvent[] = sData.events ?? [];

      // Detect meaningful market changes (price moves > 2% or new anomaly flags)
      const newSnapshot = JSON.stringify(
        incoming.map((e) => ({ id: e.id, anomaly: e.anomaly, pct: Math.round(e.price_change_5m_pct * 10) / 10 }))
      );
      if (newSnapshot !== prevSnapshot.current && prevSnapshot.current !== '') {
        const hasAnomaly = incoming.some((e) => e.anomaly || Math.abs(e.price_change_5m_pct ?? 0) > 10);
        if (hasAnomaly) setAnomalySignal((n) => n + 1);
      }
      prevSnapshot.current = newSnapshot;

      setEvents(incoming);
      setWallet(wData.wallet ?? null);
      setConnected(true);
      setLastUpdated(new Date());
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const executeAction = useCallback(async (
    asset: string,
    action: string,
    size: number,
  ): Promise<ExecuteResult | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/execute-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset, action, size }),
      });
      if (!res.ok) return null;
      const data = await res.json() as ExecuteResult;
      await fetchAll();
      return data;
    } catch {
      return null;
    }
  }, [fetchAll]);

  useEffect(() => {
    fetchAll();
    timer.current = setInterval(fetchAll, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [fetchAll]);

  return { events, wallet, loading, connected, lastUpdated, anomalySignal, refresh: fetchAll, executeAction };
}
