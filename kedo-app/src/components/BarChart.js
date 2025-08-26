import React from 'react';
import { View, Text } from 'react-native';

// values: {label:string, value:number}[], max optional
// Optional styling overrides for dark mode: barColor, trackColor, textColor, cardColor
export default function BarChart({ values = [], max, barColor, barColors, trackColor, textColor, cardColor, calories }) {
  const maxVal = max || Math.max(1, ...values.map(v => +v.value || 0));
  const cardBg = cardColor || '#141A22';
  const trackBg = trackColor || '#1F2937';
  const barBg = barColor || '#7C5CFC';
  const txt = textColor || '#E6EAF2';
  // Derive total calories if not explicitly provided
  let kcal = calories;
  if (kcal == null) {
    const lower = (s) => (s || '').toString().toLowerCase();
    const get = (key) => (values.find(v => lower(v.label).includes(key))?.value) || 0;
    const p = +get('protein') || 0;
    const c = +get('carb') || 0;
    const f = +get('fat') || 0;
    kcal = Math.max(0, Math.round(p * 4 + c * 4 + f * 9));
  }
  return (
    <View style={{ padding: 12, backgroundColor: cardBg, borderRadius: 12 }}>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ color: txt, fontSize: 18, fontWeight: '800' }}>Calories</Text>
        <Text style={{ color: txt, fontSize: 28, fontWeight: '800' }}>{kcal} kcal</Text>
      </View>
      {values.map((v, i) => {
        const pct = Math.min(1, (v.value || 0) / maxVal);
        const lower = (v.label || '').toString().toLowerCase();
        const perColor = (barColors && (barColors[v.label] || barColors[lower]))
          || (lower.includes('protein') ? '#10B981' /* green */
          : lower.includes('carb') ? '#EF4444' /* red */
          : lower.includes('fat') ? '#F59E0B' /* orange */
          : barBg);
        return (
          <View key={i} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontWeight: '600', color: txt }}>{v.label}</Text>
              <Text style={{ color: txt }}>{(v.value || 0).toFixed(1)} g</Text>
            </View>
            <View style={{ height: 10, backgroundColor: trackBg, borderRadius: 8 }}>
              <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: perColor, borderRadius: 8 }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
