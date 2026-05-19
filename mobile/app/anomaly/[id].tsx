import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const API = "http://localhost:3001";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#FF3B30",
  high: "#FF9500",
  medium: "#FFD60A",
  low: "#30D158",
};

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}

export default function AnomalyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/anomalies/${id}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <ActivityIndicator style={{ flex: 1, backgroundColor: "#0A0F1E" }} color="#00FF88" />;
  if (!data || data.error) return (
    <View style={styles.errorContainer}>
      <Ionicons name="alert-circle-outline" size={48} color="#FF3B30" />
      <Text style={styles.errorText}>Anomaly not found</Text>
    </View>
  );

  const pct = data.price_data?.change_pct;
  const pctColor = pct < 0 ? "#FF3B30" : "#00FF88";

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.severityBadge, { backgroundColor: SEVERITY_COLOR[data.severity] + "22", borderColor: SEVERITY_COLOR[data.severity] }]}>
          <Text style={[styles.severityText, { color: SEVERITY_COLOR[data.severity] }]}>{data.severity.toUpperCase()}</Text>
        </View>
        <Text style={styles.symbol}>{data.symbol}</Text>
        <Text style={[styles.pct, { color: pctColor }]}>{pct > 0 ? "+" : ""}{pct}%</Text>
        <Text style={styles.company}>{data.company}</Text>
        <Text style={styles.type}>{data.type.replace(/_/g, " ").toUpperCase()}</Text>
      </View>

      {/* AI Signal */}
      <View style={[styles.signalCard, { borderColor: SEVERITY_COLOR[data.severity] + "55" }]}>
        <Text style={styles.cardTitle}>AI SIGNAL</Text>
        <Text style={[styles.action, { color: SEVERITY_COLOR[data.severity] }]}>{data.agent_signals?.recommended_action}</Text>
        <Text style={styles.suggestion}>{data.agent_signals?.suggested_response}</Text>
        <View style={styles.confidenceRow}>
          <Text style={styles.confLabel}>Confidence</Text>
          <View style={styles.confBar}>
            <View style={[styles.confFill, { width: `${data.agent_signals?.confidence * 100}%` as any, backgroundColor: SEVERITY_COLOR[data.severity] }]} />
          </View>
          <Text style={[styles.confPct, { color: SEVERITY_COLOR[data.severity] }]}>{Math.round(data.agent_signals?.confidence * 100)}%</Text>
        </View>
      </View>

      {/* Price Data */}
      <Text style={styles.sectionHeader}>PRICE DATA</Text>
      <View style={styles.statGrid}>
        <Stat label="Current" value={`$${data.price_data?.current}`} color={pctColor} />
        <Stat label="Prev Close" value={`$${data.price_data?.previous_close}`} />
        <Stat label="52W High" value={`$${data.price_data?.["52w_high"]}`} />
        <Stat label="52W Low" value={`$${data.price_data?.["52w_low"]}`} />
      </View>

      {/* Volume */}
      <Text style={styles.sectionHeader}>VOLUME</Text>
      <View style={styles.statGrid}>
        <Stat label="Volume" value={`${(data.volume_data?.current_volume / 1e6).toFixed(1)}M`} color="#FF9500" />
        <Stat label="Avg Volume" value={`${(data.volume_data?.avg_daily_volume / 1e6).toFixed(1)}M`} />
        <Stat label="Volume Ratio" value={`${data.volume_data?.volume_ratio}x`} color={data.volume_data?.volume_ratio > 3 ? "#FF9500" : "#FFFFFF"} />
      </View>

      {/* Indicators */}
      {data.indicators && (
        <>
          <Text style={styles.sectionHeader}>INDICATORS</Text>
          <View style={styles.statGrid}>
            <Stat label="RSI 14" value={`${data.indicators.rsi_14}`} color={data.indicators.rsi_14 < 30 ? "#FF3B30" : data.indicators.rsi_14 > 70 ? "#FF9500" : "#FFFFFF"} />
            <Stat label="MACD" value={`${data.indicators.macd}`} color={data.indicators.macd > 0 ? "#00FF88" : "#FF3B30"} />
            <Stat label="VWAP Dev" value={`${data.indicators.vwap_deviation_pct}%`} color={pctColor} />
          </View>
        </>
      )}

      {/* Context */}
      <Text style={styles.sectionHeader}>CONTEXT</Text>
      <View style={styles.contextCard}>
        <Text style={styles.trigger}>{data.context?.possible_trigger}</Text>
        <Text style={styles.contextDetail}>Market Regime: <Text style={{ color: "#FFFFFF" }}>{data.context?.market_regime?.replace(/_/g, " ")}</Text></Text>
        <Text style={styles.contextDetail}>Sentiment: <Text style={{ color: (data.context?.news_sentiment ?? 0) < 0 ? "#FF3B30" : "#00FF88" }}>{data.context?.news_sentiment?.toFixed(2)}</Text></Text>
        {data.context?.correlated_movers && (
          <Text style={styles.contextDetail}>Related: <Text style={{ color: "#9CA3AF" }}>{data.context.correlated_movers.join(", ")}</Text></Text>
        )}
        <Text style={styles.contextDetail}>{data.context?.sector_impact}</Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0F1E" },
  header: { padding: 24, alignItems: "flex-start", gap: 6 },
  severityBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, marginBottom: 4 },
  severityText: { fontSize: 11, fontWeight: "700", letterSpacing: 2 },
  symbol: { color: "#FFFFFF", fontSize: 32, fontWeight: "700" },
  pct: { fontSize: 24, fontWeight: "600" },
  company: { color: "#6B7280", fontSize: 14 },
  type: { color: "#374151", fontSize: 11, letterSpacing: 1 },
  signalCard: { marginHorizontal: 16, marginBottom: 16, padding: 16, backgroundColor: "#0D1426", borderRadius: 12, borderWidth: 1 },
  cardTitle: { color: "#4A5568", fontSize: 11, letterSpacing: 2, marginBottom: 8 },
  action: { fontSize: 22, fontWeight: "700", marginBottom: 8 },
  suggestion: { color: "#9CA3AF", fontSize: 14, lineHeight: 20, marginBottom: 14 },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  confLabel: { color: "#4A5568", fontSize: 12 },
  confBar: { flex: 1, height: 6, backgroundColor: "#111827", borderRadius: 3, overflow: "hidden" },
  confFill: { height: "100%", borderRadius: 3 },
  confPct: { fontSize: 12, fontWeight: "600", width: 36, textAlign: "right" },
  sectionHeader: { color: "#4A5568", fontSize: 11, letterSpacing: 2, marginHorizontal: 16, marginTop: 8, marginBottom: 8 },
  statGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: 16, gap: 8, marginBottom: 8 },
  stat: { flex: 1, minWidth: "45%", backgroundColor: "#0D1426", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#1A2035" },
  statLabel: { color: "#4A5568", fontSize: 11, marginBottom: 4 },
  statValue: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  contextCard: { marginHorizontal: 16, padding: 16, backgroundColor: "#0D1426", borderRadius: 12, borderWidth: 1, borderColor: "#1A2035", gap: 8 },
  trigger: { color: "#FFFFFF", fontSize: 15, fontWeight: "500", lineHeight: 22, marginBottom: 4 },
  contextDetail: { color: "#6B7280", fontSize: 13, lineHeight: 19 },
  errorContainer: { flex: 1, backgroundColor: "#0A0F1E", alignItems: "center", justifyContent: "center", gap: 16 },
  errorText: { color: "#FF3B30", fontSize: 18 },
});
