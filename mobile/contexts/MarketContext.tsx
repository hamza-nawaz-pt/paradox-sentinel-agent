import React, { createContext, useContext } from 'react';
import { useMarketData, MarketEvent, WalletState, ExecuteResult } from '../hooks/useMarketData';

interface MarketContextValue {
  events: MarketEvent[];
  wallet: WalletState | null;
  loading: boolean;
  connected: boolean;
  lastUpdated: Date | null;
  anomalySignal: number;
  refresh: () => Promise<void>;
  executeAction: (asset: string, action: string, size: number) => Promise<ExecuteResult | null>;
}

const MarketContext = createContext<MarketContextValue | null>(null);

export function MarketProvider({ children }: { children: React.ReactNode }) {
  const value = useMarketData();
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarket() {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarket must be used inside <MarketProvider>');
  return ctx;
}
