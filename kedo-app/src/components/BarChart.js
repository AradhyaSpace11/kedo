import React from 'react';
import { View, Text } from 'react-native';

// values: {label:string, value:number, target?:number}[], max optional
// Optional styling overrides for dark mode: barColor, trackColor, textColor, cardColor
export default function BarChart({ values = [], max, targets = {}, barColor, barColors, trackColor, textColor, cardColor, calories, calorieTarget }) {
  const fallbackMax = max || Math.max(1, ...values.map(v => +v.value || 0));
  const cardBg = cardColor || '#141A22';
  const trackBg = trackColor || '#1F2937';
  const barBg = barColor || '#7C5CFC';
  const txt = textColor || '#E6EAF2';
  const lower = (s) => (s || '').toString().toLowerCase();
  const valueFor = (key) => (values.find(v => lower(v.label).includes(key))?.value) || 0;
  const targetFor = (v) => {
    const label = lower(v.label);
    const target = +v.target || +targets[v.label] || +targets[label] || 0;
    return target > 0 ? target : fallbackMax;
  };

  // Derive total calories if not explicitly provided
  let kcal = calories;
  if (kcal == null) {
    const p = +valueFor('protein') || 0;
    const c = +valueFor('carb') || 0;
    const f = +valueFor('fat') || 0;
    kcal = Math.max(0, Math.round(p * 4 + c * 4 + f * 9));
  }
  const calorieMax = +calorieTarget || 0;
  const caloriePct = calorieMax > 0 ? Math.min(1, kcal / calorieMax) : 0;

  return (
    <View style={{ padding: 12, backgroundColor: cardBg, borderRadius: 12 }}>
      <View style={{ marginBottom: 10 }}>
        <Text style={{ color: txt, fontSize: 18, fontWeight: '800' }}>Calories</Text>
        <Text style={{ color: txt, fontSize: 28, fontWeight: '800' }}>
          {kcal}{calorieMax > 0 ? ` / ${Math.round(calorieMax)}` : ''} kcal
        </Text>
        {calorieMax > 0 && (
          <View style={{ height: 10, backgroundColor: trackBg, borderRadius: 8, marginTop: 8 }}>
            <View style={{ width: `${caloriePct * 100}%`, height: '100%', backgroundColor: barBg, borderRadius: 8 }} />
          </View>
        )}
      </View>
      {values.map((v, i) => {
        const target = targetFor(v);
        const pct = Math.min(1, Math.max(0, (+v.value || 0) / target));
        const label = lower(v.label);
        const perColor = (barColors && (barColors[v.label] || barColors[label]))
          || (label.includes('protein') ? '#10B981' /* green */
          : label.includes('carb') ? '#EF4444' /* red */
          : label.includes('fat') ? '#F59E0B' /* orange */
          : barBg);
        return (
          <View key={i} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontWeight: '600', color: txt }}>{v.label}</Text>
              <Text style={{ color: txt }}>
                {(+v.value || 0).toFixed(1)}{target > 0 ? ` / ${target.toFixed(0)}` : ''} g
              </Text>
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
