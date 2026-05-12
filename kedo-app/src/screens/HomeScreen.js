import React, { useEffect, useState } from 'react';
import { View, Text, Alert, Modal, ScrollView, TouchableOpacity, StyleSheet, Image, Animated, Easing, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import BarChart from '../components/BarChart';
import VoiceTextInput from '../components/VoiceTextInput';
import { API, get, post } from '../lib/api';
import { apiMessage } from '../lib/messages';

const e = (s) => (s == null ? '' : String(s));

const generatedFoodImageUrl = (query) => {
  const clean = String(query || 'simple keto meal').replace(/\s+/g, ' ').trim();
  return `${API}/images/meal?query=${encodeURIComponent(clean)}&v=photo-fallback-2`;
};

const imagePromptForMeal = (meal) => {
  const ingredients = Array.isArray(meal?.ingredients)
    ? meal.ingredients.slice(0, 4).map((item) => item?.item).filter(Boolean).join(' ')
    : '';
  return `${meal?.dish_name || 'simple keto meal'} ${ingredients}`.trim();
};

function withRenderableImage(meal) {
  return {
    ...meal,
    image: generatedFoodImageUrl(imagePromptForMeal(meal)),
    _imageReady: false,
    _imageFailed: false,
  };
}

function prefetchMealImages(items) {
  (items || []).forEach((meal) => {
    if (meal?.image) Image.prefetch(meal.image).catch(() => {});
  });
}

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

const DAY_LABELS = [
  ['monday', 'Mon'],
  ['tuesday', 'Tue'],
  ['wednesday', 'Wed'],
  ['thursday', 'Thu'],
  ['friday', 'Fri'],
  ['saturday', 'Sat'],
  ['sunday', 'Sun'],
];

const defaultReminderSchedule = () => Object.fromEntries(
  DAY_LABELS.map(([day]) => [day, { fasting: false, breakfast: '08:00', lunch: '13:00', dinner: '20:00' }])
);

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
  const [meals, setMeals] = useState(null);
  const [notice, setNotice] = useState('');
  const [totals, setTotals] = useState({ protein: 0, carbs: 0, fat: 0 });
  const [targets, setTargets] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [clarModal, setClarModal] = useState(false);
  const [mealTimes, setMealTimes] = useState({ breakfast: '08:00', lunch: '13:00', dinner: '20:00' });
  const [customModal, setCustomModal] = useState(false);
  const [customText, setCustomText] = useState('');
  const [directionModal, setDirectionModal] = useState(false);
  const [directionText, setDirectionText] = useState('');
  const [directionTarget, setDirectionTarget] = useState(null);
  const [reminderModal, setReminderModal] = useState(false);
  const [reminders, setReminders] = useState(defaultReminderSchedule());
  const [todayKey, setTodayKey] = useState('');
  const [fastingToday, setFastingToday] = useState(false);

  async function fetchMeals() {
    try {
      setNotice('');
      const plan = await get('/plan/today');
      if (plan?.state === 'FASTING') {
        setFastingToday(true);
        setMeals([]);
        setNotice(plan.message || 'Today is marked as a fasting day.');
        return;
      }
      if (Array.isArray(plan?.meals) && plan.meals.length === 3) {
        const nextMeals = plan.meals.map((m, i) => withRenderableImage({ ...m, _slot: SLOTS[i] || m._slot || 'Meal' }));
        prefetchMealImages(nextMeals);
        setMeals(nextMeals);
        return;
      }
      const r = await get('/meals/recommendations');
      if (r.state === 'FASTING') {
        setFastingToday(true);
        setMeals([]);
        setNotice(r.message || 'Today is marked as a fasting day.');
        return;
      }
      if (r.state === 'NEED_CLARIFICATION') { setClarModal(true); setMeals([]); return; }
      if (r.state === 'NEED_PANTRY') { setNotice(r.message || 'Add pantry items before requesting meals.'); setMeals([]); return; }
      if (r.state === 'LLM_ERROR' || r.error) {
        const partial = Array.isArray(r.meals) ? r.meals : [];
        const nextMeals = partial.map((m, i) => withRenderableImage({ ...m, _slot: SLOTS[i] || m._slot || 'Meal' }));
        prefetchMealImages(nextMeals);
        setMeals(nextMeals);
        setNotice(partial.length ? 'Showing the pantry-only meals available from this pantry.' : 'Could not make pantry-only recommendations from the current pantry.');
        return;
      }
      const arr = Array.isArray(r.meals) ? r.meals : [];
      const nextMeals = arr.map((m, i) => withRenderableImage({ ...m, _slot: SLOTS[i] || m._slot || 'Meal' }));
      prefetchMealImages(nextMeals);
      setMeals(nextMeals);
    } catch (e) {
      setNotice('Could not reach the meal server.');
      setMeals([]);
    }
  }

  async function fetchReminders() {
    try {
      const data = await get('/reminders');
      if (data?.schedule) setReminders(data.schedule);
      if (data?.today_key) setTodayKey(data.today_key);
      if (data?.today) {
        setFastingToday(!!data.today.fasting);
        setMealTimes({
          breakfast: data.today.breakfast || '08:00',
          lunch: data.today.lunch || '13:00',
          dinner: data.today.dinner || '20:00',
        });
      }
    } catch {}
  }

  async function fetchMacros() {
    try {
      const t = await get('/macros/targets');
      if (t?.targets) setTargets(t.targets);
      const d = await get('/macros/today');
      if (d?.totals) setTotals(d.totals);
    } catch {}
  }

  useFocusEffect(
    React.useCallback(() => {
      fetchReminders();
      fetchMeals();
      fetchMacros();
    }, [])
  );

  async function resolveClar() {
    try {
      const result = await post('/clarifications/resolve', { meal_times: mealTimes });
      if (!result?.ok) {
        Alert.alert('Could not save meal times', apiMessage(result, 'Use 24-hour times like 08:00.'));
        return;
      }
      setClarModal(false);
      fetchMeals();
    } catch (error) {
      Alert.alert('Could not save meal times', apiMessage(error, 'Use 24-hour times like 08:00.'));
    }
  }
  useEffect(() => {
    fetchMacros();
  }, []);

  async function toggleEaten(idx) {
    const meal = meals?.[idx];
    if (!meal || meal._eaten || meal._logging) return;
    setMeals(old => {
      if (!old?.[idx]) return old;
      const copy = [...old];
      copy[idx] = { ...copy[idx], _logging: true };
      return copy;
    });
    try {
      const payload = {
        dish_name: meal.dish_name || 'Meal',
        image: meal.image || null,
        macros: meal.macros || { protein: 0, carbs: 0, fat: 0 },
        ingredients: Array.isArray(meal.ingredients) ? meal.ingredients : [],
        recipe_steps: Array.isArray(meal.recipe_steps) ? meal.recipe_steps : [],
        video_link: meal.video_link || null,
      };
      const r = await post('/meals/log_eaten', payload);
      if (r?.totals) setTotals(r.totals);
      setMeals(old => {
        if (!old?.[idx]) return old;
        const copy = [...old];
        copy[idx] = { ...copy[idx], _eaten: true, _logging: false };
        return copy;
      });
    } catch (error) {
      setMeals(old => {
        if (!old?.[idx]) return old;
        const copy = [...old];
        copy[idx] = { ...copy[idx], _logging: false };
        return copy;
      });
      Alert.alert('Could not log meal', error.message);
    }
  }
  async function suggestAnother(slot, idx, guidance = '') {
    setMeals(old => { if (!old) return old; const copy = [...old]; copy[idx] = { ...(copy[idx]||{}), _loading: true }; return copy; });
    let r;
    try {
      const params = guidance.trim() ? { slot, guidance: guidance.trim() } : { slot };
      r = await get('/meals/suggest_another', params);
    } catch (error) {
      Alert.alert('Could not suggest a meal', apiMessage(error, 'Please try again.'));
      setMeals(old => { if (!old) return old; const copy = [...old]; if (copy[idx]) copy[idx]._loading = false; return copy; });
      return;
    }
    if (!r || r.error) {
      Alert.alert('Could not suggest a meal', apiMessage(r?.error || r, 'Please give a clear food preference.'));
      setMeals(old => { if (!old) return old; const copy = [...old]; if (copy[idx]) copy[idx]._loading = false; return copy; });
      return;
    }
    const oneRaw = Array.isArray(r.meal) ? r.meal[0] : r.meal;
    if (!oneRaw || typeof oneRaw !== 'object') { setMeals(old => { if (!old) return old; const copy = [...old]; if (copy[idx]) copy[idx]._loading = false; return copy; }); return; }
    const one = withRenderableImage({
      dish_name: oneRaw.dish_name || 'Meal',
      image: oneRaw.image,
      macros: oneRaw.macros || { protein: 0, carbs: 0, fat: 0 },
      ingredients: Array.isArray(oneRaw.ingredients) ? oneRaw.ingredients : [],
      recipe_steps: Array.isArray(oneRaw.recipe_steps) ? oneRaw.recipe_steps : [],
      video_link: oneRaw.video_link || null,
      _slot: SLOTS[idx] || oneRaw._slot || 'Meal',
      _loading: false,
    }, SLOTS[idx] || 'Meal');
    prefetchMealImages([one]);
    setMeals(old => { if (!old) return old; const copy = [...old]; copy[idx] = one; return copy; });
  }

  function openDirectedSuggest(slot, idx) {
    setDirectionTarget({ slot, idx });
    setDirectionText('');
    setDirectionModal(true);
  }

  async function submitDirectedSuggest() {
    if (!directionTarget) return;
    const target = directionTarget;
    const text = directionText;
    setDirectionModal(false);
    setDirectionTarget(null);
    setDirectionText('');
    await suggestAnother(target.slot, target.idx, text);
  }
  function updateReminder(day, key, value) {
    setReminders(current => ({
      ...current,
      [day]: {
        ...(current?.[day] || { fasting: false, breakfast: '08:00', lunch: '13:00', dinner: '20:00' }),
        [key]: value,
      },
    }));
  }

  async function saveReminders() {
    try {
      const result = await post('/reminders', { schedule: reminders });
      if (!result?.ok) {
        Alert.alert('Could not save reminders', apiMessage(result, 'Use times like 08:00, 13:00, and 20:00.'));
        return;
      }
      setReminderModal(false);
      await fetchReminders();
      await fetchMeals();
      await fetchMacros();
      Alert.alert('Reminders saved', result?.fasting_today ? 'Today is now a fasting day, so recommendations are paused.' : 'Meal reminder times are updated.');
    } catch (error) {
      Alert.alert('Could not save reminders', apiMessage(error, 'Please try again.'));
    }
  }
  async function submitCustomFood() {
    if (!customText.trim()) { setCustomModal(false); return; }
    let r;
    try {
      r = await post('/meals/log_custom', { free_text: customText });
    } catch (error) {
      Alert.alert('Could not log food', apiMessage(error, 'Please try again.'));
      return;
    }
    if (!r?.ok && r?.error) {
      Alert.alert('Could not log food', apiMessage(r, 'Please describe the food you ate.'));
      return;
    }
    const m = r?.macros || { protein: 0, carbs: 0, fat: 0 };
    setTotals(t => ({ protein: t.protein + (+m.protein || 0), carbs: t.carbs + (+m.carbs || 0), fat: t.fat + (+m.fat || 0) }));
    setCustomText(''); setCustomModal(false);
  }
  async function recommendSnack() {
    // add placeholder loading card
    setMeals(old => (old ? [...old, { dish_name: 'Thinking…', _slot: 'Snack', _loading: true, macros: { protein: 0, carbs: 0, fat: 0 }, ingredients: [], recipe_steps: [] }] : [{ dish_name: 'Thinking…', _slot: 'Snack', _loading: true, macros: { protein: 0, carbs: 0, fat: 0 }, ingredients: [], recipe_steps: [] }]));
    let r;
    try {
      r = await get('/meals/recommend_snack', { max_calories: 300 });
    } catch (error) {
      Alert.alert('Could not recommend snack', error.message);
      setMeals(old => (old ? old.filter((m, i) => i !== old.length - 1) : old));
      return;
    }
    if (!r || r.error) { setMeals(old => (old ? old.filter((m, i) => i !== old.length - 1) : old)); return; }
    const snackRaw = Array.isArray(r.meal) ? r.meal[0] : r.meal;
    if (!snackRaw || typeof snackRaw !== 'object') { setMeals(old => (old ? old.filter((m, i) => i !== old.length - 1) : old)); return; }
    const withSlot = withRenderableImage({
      dish_name: snackRaw.dish_name || 'Snack',
      image: snackRaw.image,
      macros: snackRaw.macros || { protein: 0, carbs: 0, fat: 0 },
      ingredients: Array.isArray(snackRaw.ingredients) ? snackRaw.ingredients : [],
      recipe_steps: Array.isArray(snackRaw.recipe_steps) ? snackRaw.recipe_steps : [],
      video_link: snackRaw.video_link || null,
      _slot: 'Snack',
      _loading: false,
    }, 'Snack');
    prefetchMealImages([withSlot]);
    setMeals(old => { if (!old) return [withSlot]; const copy = [...old]; copy[copy.length - 1] = withSlot; return copy; });
  }

  const currentCalories = Math.round(
    (+totals.protein || 0) * 4
    + (+totals.carbs || 0) * 4
    + (+totals.fat || 0) * 9
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, backgroundColor: '#0B1117' }}>
      <Text style={styles.h1}>Daily Macros</Text>
      {!!targets?.calories && (
        <Text style={{ color: '#9CA3AF', marginBottom: 6 }}>
          {currentCalories}/{Math.round(targets.calories)} kcal
        </Text>
      )}
      <BarChart
        values={[
          { label: 'Protein', value: totals.protein, target: targets.protein },
          { label: 'Carbs', value: totals.carbs, target: targets.carbs },
          { label: 'Fat', value: totals.fat, target: targets.fat },
        ]}
        calories={currentCalories}
        calorieTarget={targets.calories}
        barColors={{ Protein: '#10B981', Carbs: '#EF4444', Fat: '#F59E0B', protein: '#10B981', carbs: '#EF4444', fat: '#F59E0B' }}
        trackColor="#1F2937"
        textColor="#E6EAF2"
        cardColor="#141A22"
      />

      <View style={{ marginVertical: 12 }}>
        <Text style={styles.h2}>Today’s Meal Schedule</Text>
        {fastingToday ? (
          <Text style={{ color: '#FBBF24' }}>Fasting day active. Meal recommendations are paused today.</Text>
        ) : (
          <Text style={{ color: '#C7D2FE' }}>Breakfast: {mealTimes.breakfast} | Lunch: {mealTimes.lunch} | Dinner: {mealTimes.dinner}</Text>
        )}
        <View style={{ height: 8 }} />
        <TouchableOpacity 
          style={styles.cta}
          onPress={() => setReminderModal(true)}
        >
          <Text style={styles.ctaText}>
            Set Reminders
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.h2}>Recommendations</Text>
      {!!notice && <Text style={{ color: '#FBBF24', marginBottom: 8 }}>{notice}</Text>}
      {Array.isArray(meals) && meals.length === 0 && !notice && (
        <Text style={{ color: '#9CA3AF', marginBottom: 8 }}>No pantry-only meals available yet.</Text>
      )}
      {!meals && <Text style={{ color: '#9CA3AF' }}>Generating today's recommendations...</Text>}

      {meals && meals.filter(Boolean).map((m, idx) => (
        <CardContainer key={idx} loading={!!m._loading}>
          <View style={styles.cardImage}>
            <View style={[StyleSheet.absoluteFillObject, styles.cardImageFallback]}>
              <Text style={styles.cardImageFallbackText}>{m.dish_name || 'Keto meal'}</Text>
              {!m._imageFailed && <Text style={styles.cardImageHint}>Loading image...</Text>}
            </View>
            {!!m.image && !m._imageFailed && (
              <Image
                key={m.image}
                source={{ uri: m.image }}
                style={[styles.cardImageLayer, !m._imageReady && styles.cardImageHidden]}
                resizeMode="cover"
                onLoadStart={() => {
                  setMeals(old => {
                    if (!old?.[idx]) return old;
                    const copy = [...old];
                    copy[idx] = { ...copy[idx], _imageReady: false, _imageFailed: false };
                    return copy;
                  });
                }}
                onLoad={() => {
                  setMeals(old => {
                    if (!old?.[idx]) return old;
                    const copy = [...old];
                    copy[idx] = { ...copy[idx], _imageReady: true };
                    return copy;
                  });
                }}
                onError={() => {
                  setMeals(old => {
                    if (!old?.[idx]) return old;
                    const copy = [...old];
                    const current = copy[idx];
                    copy[idx] = { ...current, image: null, _imageFailed: true, _imageReady: false };
                    return copy;
                  });
                }}
              />
            )}
          </View>
          {!!m._slot && (
            <View style={styles.badge}><Text style={styles.badgeText}>{m._slot}</Text></View>
          )}
          <Text style={styles.title}>{m.dish_name}</Text>
          <Text style={{ color: '#9CA3AF', marginTop: 2 }}>
            P {m.macros?.protein ?? 0} g • C {m.macros?.carbs ?? 0} g • F {m.macros?.fat ?? 0} g
          </Text>

          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => suggestAnother(SLOTS[idx] || 'Meal', idx)}
              onLongPress={() => openDirectedSuggest(SLOTS[idx] || 'Meal', idx)}
              delayLongPress={450}
            >
              <Text style={styles.btnText}>Suggest Something Else</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.checkbox, m._eaten && styles.checkboxDone]}
              onPress={() => toggleEaten(idx)}
              disabled={!!m._eaten || !!m._logging}
            >
              <View style={[styles.checkMark, m._eaten && styles.checkOn]} />
              <Text style={styles.checkLabel}>{m._logging ? 'Logging...' : m._eaten ? 'Logged' : 'Ate This!'}</Text>
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
      {!fastingToday && (
        <>
          <View style={{ height: 8 }} />
          <TouchableOpacity style={[styles.cta, { backgroundColor: '#10B981' }]} onPress={recommendSnack}>
            <Text style={styles.ctaText}>Recommend Snack</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Clarification Modal (HITL meal times) */}
      <Modal visible={clarModal} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Set Meal Times (HH:MM)</Text>
            {['breakfast','lunch','dinner'].map(k => (
              <View key={k} style={{ marginVertical: 6 }}>
                <Text style={styles.bold}>{k[0].toUpperCase()+k.slice(1)}</Text>
                <VoiceTextInput
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
            <VoiceTextInput
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

      <Modal visible={directionModal} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>What would you like?</Text>
            <VoiceTextInput
              style={[styles.input, { height: 100 }]}
              value={directionText}
              onChangeText={setDirectionText}
              placeholder="Example: something spicy, no paneer, more protein..."
              placeholderTextColor="#9CA3AF"
              multiline
            />
            <View style={{ height: 8 }} />
            <TouchableOpacity style={styles.cta} onPress={submitDirectedSuggest}>
              <Text style={styles.ctaText}>Submit</Text>
            </TouchableOpacity>
            <View style={{ height: 8 }} />
            <TouchableOpacity style={[styles.cta, { backgroundColor: '#EF4444' }]} onPress={() => setDirectionModal(false)}>
              <Text style={styles.ctaText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={reminderModal} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <Text style={styles.h2}>Weekly Reminders</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {DAY_LABELS.map(([day, label]) => {
                const item = reminders?.[day] || { fasting: false, breakfast: '08:00', lunch: '13:00', dinner: '20:00' };
                return (
                  <View key={day} style={[styles.reminderDay, todayKey === day && styles.reminderToday]}>
                    <View style={styles.reminderHeader}>
                      <Text style={styles.reminderDayText}>{label}</Text>
                      <TouchableOpacity
                        style={[styles.fastToggle, item.fasting && styles.fastToggleOn]}
                        onPress={() => updateReminder(day, 'fasting', !item.fasting)}
                      >
                        <Text style={styles.fastToggleText}>{item.fasting ? 'Fasting' : 'Meals'}</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={[styles.reminderTimes, item.fasting && styles.reminderTimesDisabled]}>
                      {['breakfast', 'lunch', 'dinner'].map(slot => (
                        <View key={slot} style={styles.reminderTimeField}>
                          <Text style={styles.reminderSlot}>{slot[0].toUpperCase() + slot.slice(1)}</Text>
                          <TextInput
                            style={styles.reminderInput}
                            value={String(item[slot] || '')}
                            onChangeText={(value) => updateReminder(day, slot, value)}
                            placeholder="08:00"
                            placeholderTextColor="#64748B"
                            keyboardType="numbers-and-punctuation"
                            editable={!item.fasting}
                          />
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View style={{ height: 8 }} />
            <TouchableOpacity style={styles.cta} onPress={saveReminders}>
              <Text style={styles.ctaText}>Save Reminders</Text>
            </TouchableOpacity>
            <View style={{ height: 8 }} />
            <TouchableOpacity style={[styles.cta, { backgroundColor: '#EF4444' }]} onPress={() => setReminderModal(false)}>
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
  cardImage: { width: '100%', height: 140, borderRadius: 10, marginBottom: 10, overflow: 'hidden', backgroundColor: '#1F2937' },
  cardImageLayer: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  cardImageHidden: { opacity: 0 },
  cardImageFallback: { backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  cardImageFallbackText: { color: '#C7D2FE', fontWeight: '700', textAlign: 'center' },
  cardImageHint: { color: '#94A3B8', fontSize: 12, marginTop: 6 },
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
  checkboxDone: { borderColor: '#10B981' },
  checkMark: { width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: '#334155', marginRight: 8 },
  checkOn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  checkLabel: { color: '#E6EAF2', fontWeight: '600' },
  reminderDay: { backgroundColor: '#141A22', borderRadius: 12, borderWidth: 1, borderColor: '#1F2937', padding: 10, marginBottom: 8 },
  reminderToday: { borderColor: '#7C5CFC' },
  reminderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reminderDayText: { color: '#E6EAF2', fontWeight: '800' },
  fastToggle: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  fastToggleOn: { backgroundColor: '#F59E0B' },
  fastToggleText: { color: '#F9FAFB', fontWeight: '800' },
  reminderTimes: { flexDirection: 'row', gap: 8 },
  reminderTimesDisabled: { opacity: 0.45 },
  reminderTimeField: { flex: 1 },
  reminderSlot: { color: '#94A3B8', fontSize: 11, marginBottom: 4 },
  reminderInput: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 8, color: '#E6EAF2', backgroundColor: '#111827', textAlign: 'center' },
});
