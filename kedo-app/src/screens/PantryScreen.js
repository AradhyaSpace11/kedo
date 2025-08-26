import React, { useState } from 'react';
import { View, Text, Button, TextInput, FlatList, Modal, StyleSheet, TouchableOpacity } from 'react-native';
import { post } from '../lib/api';

export default function PantryScreen() {
  const DUMMY_PANTRY = [
    { name: 'Eggs', quantity: '12' },
    { name: 'Paneer', quantity: '200 g' },
    { name: 'Brown Rice', quantity: '1 kg' },
    { name: 'Olive Oil', quantity: '250 ml' },
    { name: 'Chicken Breast', quantity: '500 g' },
  ];
  const [items, setItems] = useState(DUMMY_PANTRY);
  const [remakeModal, setRemakeModal] = useState(false);
  const [remakeText, setRemakeText] = useState('');

  function updateQty(index, val) {
    const copy = [...items];
    copy[index].quantity = val;
    setItems(copy);
  }
  async function savePantry() { await post('/pantry/update', { items }); }
  async function analyzePantry() {
    const form = new FormData();
    form.append('text', remakeText);
    const res = await fetch('http://10.0.2.2:8000/pantry/remake', { method: 'POST', body: form });
    const data = await res.json();
    const arr = (data?.pantry?.items || []).map(x => ({ name: x.name, quantity: x.quantity }));
    setItems(arr); setRemakeModal(false); setRemakeText('');
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
      <TouchableOpacity style={[styles.cta, { backgroundColor: '#10B981' }]} onPress={() => setRemakeModal(true)}><Text style={styles.ctaText}>Remake Pantry</Text></TouchableOpacity>

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
  cta: { backgroundColor: '#7C5CFC', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#F9FAFB', fontWeight: '700' },
});
