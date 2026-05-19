import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MarketProvider } from '../contexts/MarketContext';
import React from 'react';
import { View, Text, ScrollView } from 'react-native';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e }; }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <View style={{ flex: 1, backgroundColor: '#060B12', padding: 24, paddingTop: 60 }}>
          <Text style={{ color: '#FF2D55', fontFamily: 'monospace', fontSize: 14, fontWeight: '700', marginBottom: 12 }}>
            RENDER ERROR — PARADOX SENTINEL
          </Text>
          <Text style={{ color: '#FFD600', fontFamily: 'monospace', fontSize: 12, marginBottom: 8 }}>
            {err.message}
          </Text>
          <ScrollView>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontSize: 10, lineHeight: 16 }}>
              {err.stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <MarketProvider>
        <StatusBar style="light" backgroundColor="#050A14" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#050A14' },
            animation: 'fade',
          }}
        />
      </MarketProvider>
    </ErrorBoundary>
  );
}
