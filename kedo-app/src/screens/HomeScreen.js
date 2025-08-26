import React, { useEffect, useState } from 'react';
import { View, Text, Button, Modal, TextInput, ScrollView, TouchableOpacity, StyleSheet, Image, Animated, Easing } from 'react-native';
import * as Calendar from 'expo-calendar';
import BarChart from '../components/BarChart';
import { get, post } from '../lib/api';
import { FEATURE_FLAGS } from '../config/api';

const e = (s) => (s == null ? '' : String(s));

const DUMMY_MEALS = [
  {
    dish_name: 'Grilled Chicken Bowl',
    image: 'https://img.taste.com.au/TrsuLfz7/taste/2017/07/grilled-chicken-and-veg-barley-bowl-126589-1.jpg',
    macros: { protein: 42, carbs: 48, fat: 12 },
    ingredients: [
      { item: 'Chicken Breast', quantity: '200 g' },
      { item: 'Brown Rice', quantity: '1 cup cooked' },
      { item: 'Avocado', quantity: '1/4' },
      { item: 'Mixed Greens', quantity: '1 cup' },
    ],
    recipe_steps: [
      'Season chicken with salt, pepper, garlic.',
      'Grill 5–6 min per side until cooked.',
      'Layer bowl with rice, greens, sliced chicken, avocado.',
      'Drizzle lemon and olive oil to finish.',
    ],
    video_link: null,
  },
  {
    dish_name: 'Veggie Paneer Wrap',
    image: 'https://www.playfulcooking.com/wp-content/uploads/2011/03/paneer_roll_5.jpg',
    macros: { protein: 28, carbs: 55, fat: 14 },
    ingredients: [
      { item: 'Whole Wheat Tortilla', quantity: '1 large' },
      { item: 'Paneer', quantity: '120 g' },
      { item: 'Bell Peppers', quantity: '1/2 cup sliced' },
      { item: 'Greek Yogurt', quantity: '2 tbsp' },
    ],
    recipe_steps: [
      'Sauté paneer and peppers until lightly charred.',
      'Spread yogurt on tortilla, add filling.',
      'Roll tightly and toast 1–2 min per side.',
    ],
    video_link: null,
  },
  {
    dish_name: 'Salmon with Quinoa and Greens',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=1200&auto=format&fit=crop',
    macros: { protein: 34, carbs: 38, fat: 16 },
    ingredients: [
      { item: 'Salmon Fillet', quantity: '180 g' },
      { item: 'Quinoa', quantity: '3/4 cup cooked' },
      { item: 'Spinach', quantity: '1 cup' },
      { item: 'Olive Oil', quantity: '1 tsp' },
    ],
    recipe_steps: [
      'Pan-sear salmon 3–4 min each side.',
      'Steam or sauté spinach until wilted.',
      'Serve salmon over quinoa with greens.',
    ],
    video_link: null,
  },
];

const SLOTS = ['Breakfast','Lunch','Dinner'];

function CardContainer({ loading, children }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (loading) {
      anim.setValue(0);
      Animated.loop(
        Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: false })
      ).start();
    }
  }, [loading]);
  const borderColor = loading
    ? anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['#7C5CFC', '#10B981', '#7C5CFC'] })
    : '#1F2937';
  return (
    <Animated.View style={[styles.card, { borderColor, borderWidth: 1 }]}> 
      {children}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const [meals, setMeals] = useState(DUMMY_MEALS.map((m, i) => ({ ...m, _slot: SLOTS[i] || 'Meal' })));
  const [totals, setTotals] = useState({ protein: 0, carbs: 0, fat: 0 });
  const [targets, setTargets] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [clarModal, setClarModal] = useState(false);
  const [mealTimes, setMealTimes] = useState({ breakfast: '08:00', lunch: '13:00', dinner: '20:00' });
  const [customModal, setCustomModal] = useState(false);
  const [customText, setCustomText] = useState('');

  async function fetchMeals() {
    try {
      const r = await get('/meals/recommendations');
      if (r.state === 'NEED_CLARIFICATION') { setClarModal(true); setMeals(DUMMY_MEALS.map((m, i) => ({ ...m, _slot: SLOTS[i] || 'Meal' }))); return; }
      if (r.error) { setMeals(DUMMY_MEALS.map((m, i) => ({ ...m, _slot: SLOTS[i] || 'Meal' }))); return; }
      const arr = Array.isArray(r.meals) && r.meals.length ? r.meals : DUMMY_MEALS;
      setMeals(arr.map((m, i) => ({ ...m, _slot: SLOTS[i] || m._slot || 'Meal' })));
    } catch (e) {
      setMeals(DUMMY_MEALS.map((m, i) => ({ ...m, _slot: SLOTS[i] || 'Meal' })));
    }
  }
  async function resolveClar() {
    await post('/clarifications/resolve', { meal_times: mealTimes });
    setClarModal(false);
    fetchMeals();
  }
  useEffect(() => {
    fetchMeals();
    (async () => {
      try {
        const t = await get('/macros/targets');
        if (t?.targets) setTargets(t.targets);
        const d = await get('/macros/today');
        if (d?.totals) setTotals(d.totals);
      } catch {}
    })();
  }, []);

  async function onEaten(m) {
    setTotals(t => ({
      protein: t.protein + (m.macros?.protein || 0),
      carbs: t.carbs + (m.macros?.carbs || 0),
      fat: t.fat + (m.macros?.fat || 0),
    }));
    const r = await post('/meals/log_eaten', m);
    if (r?.totals) setTotals(r.totals);
  }
  function toggleEaten(idx) {
    setMeals(old => {
      if (!old) return old;
      const copy = [...old];
      const curr = { ...(copy[idx] || {}) };
      const nextVal = !curr._eaten;
      curr._eaten = nextVal;
      copy[idx] = curr;
      if (nextVal) { onEaten(curr); }
      return copy;
    });
  }
  async function suggestAnother(slot, idx) {
    setMeals(old => { if (!old) return old; const copy = [...old]; copy[idx] = { ...(copy[idx]||{}), _loading: true }; return copy; });
    const r = await get('/meals/suggest_another', { slot });
    if (!r || r.error) { setMeals(old => { if (!old) return old; const copy = [...old]; if (copy[idx]) copy[idx]._loading = false; return copy; }); return; }
    const oneRaw = Array.isArray(r.meal) ? r.meal[0] : r.meal;
    if (!oneRaw || typeof oneRaw !== 'object') { setMeals(old => { if (!old) return old; const copy = [...old]; if (copy[idx]) copy[idx]._loading = false; return copy; }); return; }
    const one = {
      dish_name: oneRaw.dish_name || 'Meal',
      image: oneRaw.image || null,
      macros: oneRaw.macros || { protein: 0, carbs: 0, fat: 0 },
      ingredients: Array.isArray(oneRaw.ingredients) ? oneRaw.ingredients : [],
      recipe_steps: Array.isArray(oneRaw.recipe_steps) ? oneRaw.recipe_steps : [],
      video_link: oneRaw.video_link || null,
      _slot: SLOTS[idx] || oneRaw._slot || 'Meal',
      _loading: false,
    };
    setMeals(old => { if (!old) return old; const copy = [...old]; copy[idx] = one; return copy; });
  }
  async function addToCalendar() {
    if (!FEATURE_FLAGS.CALENDAR_INTEGRATION) {
      Alert.alert('Feature Disabled', 'Calendar integration is currently disabled. Please check your configuration.');
      return;
    }

    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Calendar permission is required to add meal reminders.');
        return;
      }
      
      const list = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const calId = list[0]?.id;
      if (!calId || !meals) {
        Alert.alert('Error', 'No calendar available or no meals to add.');
        return;
      }

      const today = new Date();
      const slots = ['breakfast','lunch','dinner'];
      let eventsCreated = 0;
      
      for (let i = 0; i < slots.length; i++) {
        const key = slots[i]; 
        const time = mealTimes[key] || '08:00';
        const [H, M] = time.split(':').map(Number);
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), H, M);
        const end = new Date(start.getTime() + 45*60*1000);
        const title = `${key[0].toUpperCase()+key.slice(1)}: ${meals[i]?.dish_name || ''}`;
        
        try {
          await Calendar.createEventAsync(calId, { 
            title, 
            startDate: start, 
            endDate: end, 
            notes: 'Open in Kedo for recipe details' 
          });
          eventsCreated++;
        } catch (error) {
          console.error(`Failed to create event for ${key}:`, error);
        }
      }
      
      if (eventsCreated > 0) {
        Alert.alert('Success', `Created ${eventsCreated} meal reminders in your calendar!`);
      } else {
        Alert.alert('Error', 'Failed to create calendar events. Please try again.');
      }
    } catch (error) {
      console.error('Calendar error:', error);
      Alert.alert('Error', 'Failed to access calendar. Please check your permissions.');
    }
  }
  async function submitCustomFood() {
    if (!customText.trim()) { setCustomModal(false); return; }
    const r = await post('/meals/log_custom', { free_text: customText });
    const m = r?.macros || { protein: 0, carbs: 0, fat: 0 };
    setTotals(t => ({ protein: t.protein + (+m.protein || 0), carbs: t.carbs + (+m.carbs || 0), fat: t.fat + (+m.fat || 0) }));
    setCustomText(''); setCustomModal(false);
  }
  async function recommendSnack() {
    // add placeholder loading card
    setMeals(old => (old ? [...old, { dish_name: 'Thinking…', _slot: 'Snack', _loading: true, macros: { protein: 0, carbs: 0, fat: 0 }, ingredients: [], recipe_steps: [] }] : [{ dish_name: 'Thinking…', _slot: 'Snack', _loading: true, macros: { protein: 0, carbs: 0, fat: 0 }, ingredients: [], recipe_steps: [] }]));
    const r = await get('/meals/recommend_snack', { max_calories: 300 });
    if (!r || r.error) { setMeals(old => (old ? old.filter((m, i) => i !== old.length - 1) : old)); return; }
    const snackRaw = Array.isArray(r.meal) ? r.meal[0] : r.meal;
    if (!snackRaw || typeof snackRaw !== 'object') { setMeals(old => (old ? old.filter((m, i) => i !== old.length - 1) : old)); return; }
    const withSlot = {
      dish_name: snackRaw.dish_name || 'Snack',
      image: snackRaw.image || null,
      macros: snackRaw.macros || { protein: 0, carbs: 0, fat: 0 },
      ingredients: Array.isArray(snackRaw.ingredients) ? snackRaw.ingredients : [],
      recipe_steps: Array.isArray(snackRaw.recipe_steps) ? snackRaw.recipe_steps : [],
      video_link: snackRaw.video_link || null,
      _slot: 'Snack',
      _loading: false,
    };
    setMeals(old => { if (!old) return [withSlot]; const copy = [...old]; copy[copy.length - 1] = withSlot; return copy; });
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, backgroundColor: '#0B1117' }}>
      <Text style={styles.h1}>Daily Macros</Text>
      {!!targets?.calories && (
        <Text style={{ color: '#9CA3AF', marginBottom: 6 }}>
          {Math.round((totals.protein*4 + totals.carbs*4 + totals.fat*9))}/{Math.round(targets.calories)} kcal
        </Text>
      )}
      <BarChart
        values={[
          { label: 'Protein', value: totals.protein },
          { label: 'Carbs', value: totals.carbs },
          { label: 'Fat', value: totals.fat },
        ]}
        barColors={{ Protein: '#10B981', Carbs: '#EF4444', Fat: '#F59E0B', protein: '#10B981', carbs: '#EF4444', fat: '#F59E0B' }}
        trackColor="#1F2937"
        textColor="#E6EAF2"
        cardColor="#141A22"
      />

      <View style={{ marginVertical: 12 }}>
        <Text style={styles.h2}>Today’s Meal Schedule</Text>
        <Text style={{ color: '#C7D2FE' }}>Breakfast: {mealTimes.breakfast} | Lunch: {mealTimes.lunch} | Dinner: {mealTimes.dinner}</Text>
        <View style={{ height: 8 }} />
        <TouchableOpacity 
          style={[
            styles.cta, 
            !FEATURE_FLAGS.CALENDAR_INTEGRATION && { backgroundColor: '#6B7280' }
          ]} 
          onPress={addToCalendar}
        >
          <Text style={styles.ctaText}>
            {FEATURE_FLAGS.CALENDAR_INTEGRATION ? '📅 Add to Calendar' : '📅 Calendar (Disabled)'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.h2}>Recommendations</Text>
      {!meals && <Text style={{ color: '#9CA3AF' }}>Loading or waiting for clarification…</Text>}

      {meals && meals.filter(Boolean).map((m, idx) => (
        <CardContainer key={idx} loading={!!m._loading}>
          {!!m.image && (
            <Image source={{ uri: m.image }} style={styles.cardImage} resizeMode="cover" />
          )}
          {!!m._slot && (
            <View style={styles.badge}><Text style={styles.badgeText}>{m._slot}</Text></View>
          )}
          <Text style={styles.title}>{m.dish_name}</Text>
          <Text style={{ color: '#9CA3AF', marginTop: 2 }}>
            P {m.macros?.protein ?? 0} g • C {m.macros?.carbs ?? 0} g • F {m.macros?.fat ?? 0} g
          </Text>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={() => suggestAnother(SLOTS[idx] || 'Meal', idx)}>
              <Text style={styles.btnText}>Suggest Something Else</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.checkbox} onPress={() => toggleEaten(idx)}>
              <View style={[styles.checkMark, m._eaten && styles.checkOn]} />
              <Text style={styles.checkLabel}>Ate This!</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.btn, { marginTop: 8 }]} onPress={() => {
            m._open = !m._open; setMeals([...meals]);
          }}>
            <Text style={styles.btnText}>{m._open ? 'Hide Recipe' : 'View Recipe'}</Text>
          </TouchableOpacity>

          {m._open && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.bold}>Ingredients</Text>
              {m.ingredients?.map((ing, i) => <Text key={i} style={{ color: '#E6EAF2' }}>• {e(ing.item)}: {e(ing.quantity)}</Text>)}
              <Text style={[styles.bold, { marginTop: 6 }]}>Steps</Text>
              {m.recipe_steps?.map((s, i) => <Text key={i} style={{ color: '#E6EAF2' }}>{i + 1}. {e(s)}</Text>)}
              {!!m.video_link && <Text style={{ marginTop: 6, color: '#93C5FD' }}>Video: {e(m.video_link)}</Text>}
            </View>
          )}
        </CardContainer>
      ))}

      <View style={{ height: 8 }} />
      <TouchableOpacity style={styles.cta} onPress={() => setCustomModal(true)}>
        <Text style={styles.ctaText}>I Ate Something Else</Text>
      </TouchableOpacity>
      <View style={{ height: 8 }} />
      <TouchableOpacity style={[styles.cta, { backgroundColor: '#10B981' }]} onPress={recommendSnack}>
        <Text style={styles.ctaText}>Recommend Snack</Text>
      </TouchableOpacity>

      {/* Clarification Modal (HITL meal times) */}
      <Modal visible={clarModal} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Set Meal Times (HH:MM)</Text>
            {['breakfast','lunch','dinner'].map(k => (
              <View key={k} style={{ marginVertical: 6 }}>
                <Text style={styles.bold}>{k[0].toUpperCase()+k.slice(1)}</Text>
                <TextInput
                  style={styles.input}
                  value={mealTimes[k]}
                  onChangeText={(v) => setMealTimes({ ...mealTimes, [k]: v })}
                  placeholder="08:00"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            ))}
            <TouchableOpacity style={styles.cta} onPress={resolveClar}>
              <Text style={styles.ctaText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Custom Food Modal */}
      <Modal visible={customModal} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>What did you eat?</Text>
            <TextInput
              style={[styles.input, { height: 100 }]}
              value={customText}
              onChangeText={setCustomText}
              placeholder="Be descriptive: item + quantity (e.g., 2 eggs, 100g paneer)..."
              placeholderTextColor="#9CA3AF"
              multiline
            />
            <View style={{ height: 8 }} />
            <TouchableOpacity style={styles.cta} onPress={submitCustomFood}>
              <Text style={styles.ctaText}>Submit</Text>
            </TouchableOpacity>
            <View style={{ height: 8 }} />
            <TouchableOpacity style={[styles.cta, { backgroundColor: '#EF4444' }]} onPress={() => setCustomModal(false)}>
              <Text style={styles.ctaText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: '700', marginBottom: 8, color: '#E6EAF2' },
  h2: { fontSize: 18, fontWeight: '600', marginVertical: 8, color: '#E6EAF2' },
  card: { backgroundColor: '#141A22', borderRadius: 14, padding: 14, marginVertical: 8, borderWidth: 1, borderColor: '#1F2937' },
  cardImage: { width: '100%', height: 140, borderRadius: 10, marginBottom: 10 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#1F2937', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 6, borderWidth: 1, borderColor: '#334155' },
  badgeText: { color: '#C7D2FE', fontWeight: '700', fontSize: 12, letterSpacing: 0.3 },
  title: { fontSize: 16, fontWeight: '600', color: '#F3F4F6' },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { backgroundColor: '#7C5CFC', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  btnSecondary: { backgroundColor: '#6366F1' },
  btnGhost: { backgroundColor: '#334155' },
  btnText: { color: '#F9FAFB', fontWeight: '600' },
  cta: { backgroundColor: '#7C5CFC', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#F9FAFB', fontWeight: '700' },
  bold: { fontWeight: '700', color: '#E6EAF2' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#0F172A', padding: 16, borderRadius: 14, width: '90%', borderWidth: 1, borderColor: '#1F2937' },
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 10, marginTop: 4, color: '#E6EAF2', backgroundColor: '#111827' },
  checkbox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141A22', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#1F2937' },
  checkMark: { width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: '#334155', marginRight: 8 },
  checkOn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  checkLabel: { color: '#E6EAF2', fontWeight: '600' },
});
