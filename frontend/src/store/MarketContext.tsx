import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { MarketEvent, WalletState, Transaction, PriceSnapshot } from '../types';
import { fetchMarketStream, fetchWallet, fetchTxLog } from '../api';

type Ctx = {
  events:         MarketEvent[];
  wallet:         WalletState | null;
  portfolioUSD:   number;
  txLog:          Transaction[];
  connected:      boolean;
  chaosMode:      boolean;
  lastUpdated:    Date | null;
  priceHistory:   PriceSnapshot[];
  portfolioHistory: { t: number; v: number }[];
  refresh:        () => Promise<void>;
  setChaosMode:   (v: boolean) => void;
};

const Cx = createContext<Ctx>(null!);
export const useMarket = () => useContext(Cx);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const [events,           setEvents]           = useState<MarketEvent[]>([]);
  const [wallet,           setWallet]           = useState<WalletState | null>(null);
  const [portfolioUSD,     setPortfolioUSD]     = useState(0);
  const [txLog,            setTxLog]            = useState<Transaction[]>([]);
  const [connected,        setConnected]        = useState(false);
  const [chaosMode,        setChaosMode]        = useState(false);
  const [lastUpdated,      setLastUpdated]      = useState<Date | null>(null);
  const [priceHistory,     setPriceHistory]     = useState<PriceSnapshot[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<{ t: number; v: number }[]>([]);

  const priceSnapshotRef = useRef<PriceSnapshot[]>([]);
  const portfolioRef     = useRef<{ t: number; v: number }[]>([]);

  const load = useCallback(async () => {
    try {
      const [mkt, wal] = await Promise.all([fetchMarketStream(), fetchWallet()]);
      setEvents(mkt.events ?? []);
      setChaosMode(mkt.chaos_mode ?? false);
      setConnected(true);
      setLastUpdated(new Date());

      const w: WalletState = wal.wallet ?? {};
      setWallet(w);
      const pv = wal.portfolio_value_usd ?? 0;
      setPortfolioUSD(pv);

      // Record price snapshot (keep last 60 points)
      const snap: PriceSnapshot = { t: Date.now() };
      for (const ev of (mkt.events ?? []) as MarketEvent[]) snap[ev.asset] = ev.current_price;
      priceSnapshotRef.current = [...priceSnapshotRef.current.slice(-59), snap];
      setPriceHistory([...priceSnapshotRef.current]);

      // Record portfolio snapshot
      const pvSnap = { t: Date.now(), v: pv };
      portfolioRef.current = [...portfolioRef.current.slice(-59), pvSnap];
      setPortfolioHistory([...portfolioRef.current]);
    } catch {
      setConnected(false);
    }
  }, []);

  const loadTx = useCallback(async () => {
    try {
      const data = await fetchTxLog();
      setTxLog(data.transactions ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    loadTx();
    const mktTimer = setInterval(load, 3000);
    const txTimer  = setInterval(loadTx, 8000);
    return () => { clearInterval(mktTimer); clearInterval(txTimer); };
  }, [load, loadTx]);

  const refresh = useCallback(async () => { await load(); await loadTx(); }, [load, loadTx]);

  return (
    <Cx.Provider value={{ events, wallet, portfolioUSD, txLog, connected, chaosMode, lastUpdated,
                          priceHistory, portfolioHistory, refresh, setChaosMode }}>
      {children}
    </Cx.Provider>
  );
}
