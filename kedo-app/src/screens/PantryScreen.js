import React, { useState } from 'react';
import { View, Text, Alert, TextInput, FlatList, Modal, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { get, post } from '../lib/api';

const DEFAULT_KETO_PANTRY = [
  { name: 'Eggs', quantity: '12' },
  { name: 'Paneer', quantity: '500 g' },
  { name: 'Chicken breast', quantity: '700 g' },
  { name: 'Fish fillets', quantity: '500 g' },
  { name: 'Greek yogurt', quantity: '500 g' },
  { name: 'Cheese', quantity: '300 g' },
  { name: 'Ghee', quantity: '250 g' },
  { name: 'Coconut oil', quantity: '250 ml' },
  { name: 'Spinach', quantity: '2 bunches' },
  { name: 'Cauliflower', quantity: '1 head' },
  { name: 'Mushrooms', quantity: '250 g' },
  { name: 'Bell peppers', quantity: '3' },
  { name: 'Cucumber', quantity: '2' },
  { name: 'Avocado', quantity: '2' },
  { name: 'Almonds', quantity: '250 g' },
  { name: 'Walnuts', quantity: '200 g' },
  { name: 'Coconut milk', quantity: '400 ml' },
  { name: 'Fresh cream', quantity: '200 ml' },
  { name: 'Lemon', quantity: '3' },
  { name: 'Coriander', quantity: '1 bunch' },
  { name: 'Green chilli', quantity: '6' },
  { name: 'Ginger', quantity: '100 g' },
  { name: 'Garlic', quantity: '100 g' },
  { name: 'Salt', quantity: '500 g' },
  { name: 'Black pepper', quantity: '100 g' },
  { name: 'Turmeric', quantity: '100 g' },
  { name: 'Cumin', quantity: '100 g' },
  { name: 'Garam masala', quantity: '100 g' },
  { name: 'Red chilli powder', quantity: '100 g' },
];

export default function PantryScreen({ navigation }) {
  const [items, setItems] = useState(DEFAULT_KETO_PANTRY);
  const [addModal, setAddModal] = useState(false);
  const [addText, setAddText] = useState('');
  const [remakeModal, setRemakeModal] = useState(false);
  const [remakeText, setRemakeText] = useState('');
  const [generating, setGenerating] = useState(false);
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!generating) return;
    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [generating, pulse]);

  const loadPantry = React.useCallback(async () => {
    try {
      const res = await get('/pantry');
      if (Array.isArray(res?.pantry?.items) && res.pantry.items.length) {
        setItems(res.pantry.items);
      }
    } catch {}
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadPantry();
    }, [loadPantry])
  );

  function updateQty(index, val) {
    const copy = [...items];
    copy[index].quantity = val;
    setItems(copy);
  }
  async function savePantry() {
    try {
      setGenerating(true);
      await post('/pantry/update', { items });
      const result = await get('/meals/recommendations');
      if (result?.state !== 'COMPLETE') {
        Alert.alert('Could not generate meals', 'Try adding a few more keto pantry items.');
        return;
      }
      navigation.navigate('Home');
    } catch (error) {
      Alert.alert('Could not save', error.message);
    } finally {
      setGenerating(false);
    }
  }

  async function analyzePantry() {
    try {
      const data = await post('/pantry/remake', { text: remakeText });
      if (!data?.ok) {
        Alert.alert('Could not analyze pantry', 'Add a pantry description first.');
        return;
      }
      const arr = (data?.pantry?.items || []).map(x => ({ name: x.name, quantity: x.quantity }));
      setItems(arr);
      setRemakeModal(false);
      setRemakeText('');
    } catch (error) {
      Alert.alert('Could not analyze pantry', error.message);
    }
  }

  async function addPantryItems() {
    try {
      const data = await post('/pantry/add', { text: addText });
      if (!data?.ok) {
        Alert.alert('Could not add items', 'Add a pantry description first.');
        return;
      }
      const arr = (data?.pantry?.items || []).map(x => ({ name: x.name, quantity: x.quantity }));
      setItems(arr);
      setAddModal(false);
      setAddText('');
    } catch (error) {
      Alert.alert('Could not add items', error.message);
    }
  }

  return (
    <View style={{ padding: 16, flex: 1, backgroundColor: '#0B1117' }}>
      <Text style={styles.h1}>Your Current Pantry</Text>
      <FlatList
        data={items}
        keyExtractor={(it, idx) => String(idx)}
        renderItem={({ item, index }) => (
          <View style={styles.cardRow}>
            <Text style={{ flex: 1, color: '#E6EAF2' }}>{item.name}</Text>
            <TextInput style={styles.input} value={String(item.quantity || '')} onChangeText={(v) => updateQty(index, v)} />
          </View>
        )}
        ListEmptyComponent={<Text style={{ color: '#9CA3AF' }}>No items yet. Use “Remake Pantry”.</Text>}
      />
      <View style={{ height: 8 }} />
      <TouchableOpacity style={styles.cta} onPress={savePantry}><Text style={styles.ctaText}>Update Pantry</Text></TouchableOpacity>
      <View style={{ height: 8 }} />
      <TouchableOpacity style={[styles.cta, { backgroundColor: '#6366F1' }]} onPress={() => setAddModal(true)}><Text style={styles.ctaText}>Add Items</Text></TouchableOpacity>
      <View style={{ height: 8 }} />
      <TouchableOpacity style={[styles.cta, { backgroundColor: '#10B981' }]} onPress={() => setRemakeModal(true)}><Text style={styles.ctaText}>Remake Pantry</Text></TouchableOpacity>

      <Modal visible={addModal} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Add pantry items</Text>
            <TextInput
              style={[styles.input, { height: 140 }]}
              value={addText}
              onChangeText={setAddText}
              multiline
              placeholder="Add 6 bananas, 1 liter milk, and 500g oats"
              placeholderTextColor="#9CA3AF"
            />
            <View style={{ height: 8 }} />
            <TouchableOpacity style={styles.cta} onPress={addPantryItems}><Text style={styles.ctaText}>Add to Pantry</Text></TouchableOpacity>
            <View style={{ height: 8 }} />
            <TouchableOpacity style={[styles.cta, { backgroundColor: '#EF4444' }]} onPress={() => setAddModal(false)}><Text style={styles.ctaText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={remakeModal} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Describe your pantry/fridge</Text>
            <Text style={{ marginBottom: 8 }}>Use “item: quantity” per line.</Text>
            <TextInput
              style={[styles.input, { height: 140 }]}
              value={remakeText}
              onChangeText={setRemakeText}
              multiline
              placeholder="Eggs: 12\nPaneer: 200g\nOlive Oil: 100ml"
              placeholderTextColor="#9CA3AF"
            />
            <View style={{ height: 8 }} />
            <TouchableOpacity style={styles.cta} onPress={analyzePantry}><Text style={styles.ctaText}>Analyze Pantry</Text></TouchableOpacity>
            <View style={{ height: 8 }} />
            <TouchableOpacity style={[styles.cta, { backgroundColor: '#EF4444' }]} onPress={() => setRemakeModal(false)}><Text style={styles.ctaText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={generating} transparent animationType="fade">
        <View style={styles.generatingWrap}>
          <Animated.View style={[styles.generatingCard, { opacity: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.85, 1, 0.85] }) }]}>
            <ActivityIndicator size="large" color="#7C5CFC" />
            <Text style={styles.generatingTitle}>Generating recommendations</Text>
            <Text style={styles.generatingText}>Building breakfast, lunch, and dinner from this pantry.</Text>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: '700', marginBottom: 8, color: '#E6EAF2' },
  h2: { fontSize: 18, fontWeight: '600', color: '#E6EAF2' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, backgroundColor: '#141A22', paddingHorizontal: 12, borderRadius: 12, marginVertical: 6, borderWidth: 1, borderColor: '#1F2937' },
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 10, minWidth: 100, color: '#E6EAF2', backgroundColor: '#111827' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#0F172A', padding: 16, borderRadius: 14, width: '90%', borderWidth: 1, borderColor: '#1F2937' },
  generatingWrap: { flex: 1, backgroundColor: 'rgba(5,8,13,0.76)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  generatingCard: { backgroundColor: '#0F172A', padding: 18, borderRadius: 14, width: '92%', borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  generatingTitle: { color: '#F9FAFB', fontSize: 18, fontWeight: '800', marginTop: 12 },
  generatingText: { color: '#CBD5E1', marginTop: 6, textAlign: 'center' },
  cta: { backgroundColor: '#7C5CFC', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#F9FAFB', fontWeight: '700' },
});
