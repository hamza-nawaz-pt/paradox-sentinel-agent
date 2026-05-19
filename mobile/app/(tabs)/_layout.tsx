import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// ── Paradox design tokens ─────────────────────────────────────────
const accent  = '#00FFD1';
const textDim = 'rgba(255,255,255,0.45)';
const mono    = Platform.OS === 'ios' ? 'Courier New' : 'monospace';

function TabIcon({ name, label, focused }: { name: any; label: string; focused: boolean }) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} size={21} color={focused ? accent : textDim} />
      <Text style={[styles.iconLabel, focused && styles.iconLabelActive]}>
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="pulse-outline" label="FEED" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="hardware-chip-outline" label="AGENT" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon name="analytics-outline" label="ANALYSIS" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#060B12',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.13)',
    height: Platform.OS === 'ios' ? 82 : 62,
    paddingTop: 6,
  },
  iconWrap: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 18,
    paddingVertical: 5,
    borderRadius: 0,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(0,255,209,0.10)',
  },
  iconLabel: {
    fontSize: 9,
    fontFamily: mono,
    color: textDim,
    letterSpacing: 1.2,
  },
  iconLabelActive: {
    color: accent,
  },
});
