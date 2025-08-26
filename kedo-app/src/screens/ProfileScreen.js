import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { post, postForm } from '../lib/api';

export default function ProfileScreen() {
  const [name, setName] = useState('');
  const [age, setAge] = useState('26');
  const [gender, setGender] = useState('female');
  const [height, setHeight] = useState('158');
  const [weight, setWeight] = useState('60');
  const [goal, setGoal] = useState('weight_loss');
  const [restrictions, setRestrictions] = useState('');
  const [allergies, setAllergies] = useState('');
  const [activity, setActivity] = useState('moderate');

  async function save() {
    await post('/user/profile', {
      name, age: +age, gender, height: +height, weight: +weight, goal,
      restrictions: restrictions ? restrictions.split(',').map(s => s.trim()).filter(Boolean) : [],
      allergies: allergies ? allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
      activity
    });
  }

  const [prescriptionUri, setPrescriptionUri] = useState('');
  async function choosePrescription() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!res.canceled) {
      const uri = res.assets?.[0]?.uri || '';
      setPrescriptionUri(uri);
    }
  }
  async function uploadPrescription() {
    if (!prescriptionUri) return;
    const form = new FormData();
    const name = prescriptionUri.split('/').pop() || 'prescription.jpg';
    form.append('file', { uri: prescriptionUri, name, type: 'image/jpeg' });
    await postForm('/user/prescription', form);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, backgroundColor: '#0B1117' }}>
      <Text style={styles.h1}>My Profile</Text>
      <Field label="Name" v={name} set={setName} />
      <Field label="Age" v={age} set={setAge} kb="numeric" />
      <Field label="Gender" v={gender} set={setGender} />
      <Field label="Height (cm)" v={height} set={setHeight} kb="numeric" />
      <Field label="Weight (kg)" v={weight} set={setWeight} kb="numeric" />
      <Field label="Goal" v={goal} set={setGoal} />
      <Field label="Restrictions (comma-separated)" v={restrictions} set={setRestrictions} />
      <Field label="Allergies (comma-separated)" v={allergies} set={setAllergies} />
      <Field label="Activity" v={activity} set={setActivity} />
      <View style={{ height: 8 }} />
      <TouchableOpacity style={styles.cta} onPress={save}><Text style={styles.ctaText}>Update Profile</Text></TouchableOpacity>
      <View style={{ height: 12 }} />
      <Text style={styles.label}>Prescription (optional)</Text>
      {prescriptionUri ? (
        <Image source={{ uri: prescriptionUri }} style={{ width: '100%', height: 180, borderRadius: 12, marginBottom: 8 }} />
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity style={[styles.cta, { flex: 1 }]} onPress={choosePrescription}><Text style={styles.ctaText}>Choose Image</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.cta, { flex: 1, backgroundColor: '#10B981' }]} onPress={uploadPrescription}><Text style={styles.ctaText}>Upload</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Field({ label, v, set, kb }) {
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={String(v)} onChangeText={set} keyboardType={kb || 'default'} />
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: '700', marginBottom: 8, color: '#E6EAF2' },
  label: { fontWeight: '600', marginBottom: 4, color: '#E6EAF2' },
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 10, color: '#E6EAF2', backgroundColor: '#111827' },
  fieldCard: { marginBottom: 10, backgroundColor: '#141A22', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1F2937' },
  cta: { backgroundColor: '#7C5CFC', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#F9FAFB', fontWeight: '700' },
});
