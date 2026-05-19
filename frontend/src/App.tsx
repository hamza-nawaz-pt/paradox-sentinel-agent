import React, { useState } from 'react';
import { MarketProvider } from './store/MarketContext';
import Sidebar from './components/layout/Sidebar';
import Dashboard from './pages/Dashboard';
import Agent from './pages/Agent';
import Analytics from './pages/Analytics';
import Chat from './pages/Chat';
import Alerts from './pages/Alerts';
import type { Tab } from './types';

function Inner() {
  const [tab, setTab] = useState<Tab>('dashboard');
  return (
    <div className="flex h-screen overflow-hidden bg-bg-950">
      <Sidebar active={tab} onNav={setTab} />
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 md:pb-0">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'agent'     && <Agent />}
        {tab === 'analytics' && <Analytics />}
        {tab === 'chat'      && <Chat />}
        {tab === 'alerts'    && <Alerts />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <MarketProvider>
      <Inner />
    </MarketProvider>
  );
}
