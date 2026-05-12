import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Modal } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { get, post, postForm } from '../lib/api';
import { apiMessage } from '../lib/messages';

const DEFAULT_EMAIL = 'gaonkararadhya2711@gmail.com';

export default function ProfileScreen() {
  const [name, setName] = useState('Aradhya Gaonkar');
  const [age, setAge] = useState('21');
  const [gender, setGender] = useState('male');
  const [height, setHeight] = useState('178');
  const [weight, setWeight] = useState('72');
  const [goal, setGoal] = useState('keto style diet');
  const [restrictions, setRestrictions] = useState('Indian keto style, no beef, no pork');
  const [allergies, setAllergies] = useState('');
  const [activity, setActivity] = useState('moderate');
  const [prescriptionUri, setPrescriptionUri] = useState('');
  const [prescriptionStatus, setPrescriptionStatus] = useState('');
  const [prescriptionContext, setPrescriptionContext] = useState(null);
  const [prescriptionBusy, setPrescriptionBusy] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const [authEmail, setAuthEmail] = useState(DEFAULT_EMAIL);
  const [loginModal, setLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState(DEFAULT_EMAIL);
  const [loginPassword, setLoginPassword] = useState('');

  React.useEffect(() => {
    get('/auth/session')
      .then((session) => {
        setLoggedIn(!!session?.logged_in);
        setAuthEmail(session?.email || DEFAULT_EMAIL);
      })
      .catch(() => {});
  }, []);

  async function save() {
    if (!loggedIn) {
      setLoginModal(true);
      return;
    }
    try {
      await post('/user/profile', {
        name, age: +age, gender, height: +height, weight: +weight, goal,
        restrictions: restrictions ? restrictions.split(',').map(s => s.trim()).filter(Boolean) : [],
        allergies: allergies ? allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        activity
      });
      Alert.alert('Saved', 'Profile updated.');
    } catch (error) {
      Alert.alert('Could not save profile', error.message);
    }
  }

  async function usePrescriptionImage(asset) {
    if (!loggedIn) {
      setLoginModal(true);
      return;
    }
    const uri = asset?.uri || '';
    if (!uri) return;
    setPrescriptionUri(uri);
    setPrescriptionStatus('Analyzing prescription...');
    setPrescriptionContext(null);
    setPrescriptionBusy(true);

    const form = new FormData();
    const name = uri.split('/').pop() || 'prescription.jpg';
    form.append('file', {
      uri,
      name,
      type: asset?.mimeType || 'image/jpeg',
    });

    try {
      const result = await postForm('/user/prescription', form);
      if (!result?.ok) {
        setPrescriptionUri('');
        setPrescriptionStatus('');
        Alert.alert('Invalid prescription image', apiMessage(result, 'Please upload a clear prescription or medical document.'));
        return;
      }
      setPrescriptionContext(result?.context || null);
      setPrescriptionStatus('Prescription context saved for recommendations.');
    } catch (error) {
      setPrescriptionStatus('');
      Alert.alert('Could not analyze prescription', apiMessage(error, 'Please try again.'));
    } finally {
      setPrescriptionBusy(false);
    }
  }

  async function clickPrescription() {
    if (!loggedIn) {
      setLoginModal(true);
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission needed', 'Allow camera access to click an image.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) {
      await usePrescriptionImage(res.assets?.[0]);
    }
  }

  async function choosePrescription() {
    if (!loggedIn) {
      setLoginModal(true);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!res.canceled) {
      await usePrescriptionImage(res.assets?.[0]);
    }
  }

  async function toggleAuth() {
    if (!loggedIn) {
      setLoginModal(true);
      return;
    }
    try {
      await post('/auth/logout', {});
      setLoggedIn(false);
      setLoginPassword('');
      setLoginModal(true);
    } catch (error) {
      Alert.alert('Could not log out', apiMessage(error, 'Please try again.'));
    }
  }

  async function submitLogin() {
    try {
      const result = await post('/auth/login', { email: loginEmail, password: loginPassword });
      if (!result?.ok) {
        Alert.alert('Could not log in', apiMessage(result, 'Check your email and password.'));
        return;
      }
      setLoggedIn(true);
      setAuthEmail(result.email || loginEmail);
      setLoginPassword('');
      setLoginModal(false);
    } catch (error) {
      Alert.alert('Could not log in', apiMessage(error, 'Please try again.'));
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, backgroundColor: '#0B1117' }}>
      <View style={styles.profileTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>My Profile</Text>
          <Text style={styles.authText}>{loggedIn ? authEmail : 'Logged out'}</Text>
        </View>
        <TouchableOpacity style={[styles.authButton, !loggedIn && styles.authButtonLogin]} onPress={toggleAuth}>
          <Text style={styles.ctaText}>{loggedIn ? 'Logout' : 'Log In'}</Text>
        </TouchableOpacity>
      </View>
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
        <TouchableOpacity style={[styles.cta, { flex: 1 }, prescriptionBusy && styles.disabled]} onPress={clickPrescription} disabled={prescriptionBusy}><Text style={styles.ctaText}>Click Image</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.cta, { flex: 1, backgroundColor: '#334155' }, prescriptionBusy && styles.disabled]} onPress={choosePrescription} disabled={prescriptionBusy}><Text style={styles.ctaText}>Choose Image</Text></TouchableOpacity>
      </View>
      {!!prescriptionStatus && <Text style={styles.statusText}>{prescriptionStatus}</Text>}
      {!!prescriptionContext && (
        <View style={styles.contextCard}>
          <Text style={styles.contextTitle}>Recommendation context</Text>
          <Text style={styles.contextText}>{summarizePrescriptionContext(prescriptionContext)}</Text>
        </View>
      )}

      <Modal visible={loginModal} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.h2}>Log In</Text>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={loginEmail}
              onChangeText={setLoginEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="email"
              placeholderTextColor="#64748B"
            />
            <Text style={[styles.label, { marginTop: 10 }]}>Password</Text>
            <TextInput
              style={styles.input}
              value={loginPassword}
              onChangeText={setLoginPassword}
              secureTextEntry
              placeholder="password"
              placeholderTextColor="#64748B"
            />
            <View style={{ height: 10 }} />
            <TouchableOpacity style={styles.cta} onPress={submitLogin}>
              <Text style={styles.ctaText}>Log In</Text>
            </TouchableOpacity>
            <View style={{ height: 8 }} />
            <TouchableOpacity style={[styles.cta, { backgroundColor: '#334155' }]} onPress={() => setLoginModal(false)}>
              <Text style={styles.ctaText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function summarizePrescriptionContext(context) {
  if (!context || typeof context !== 'object') return '';
  if (context.summary) return String(context.summary);
  const parts = [
    ...(Array.isArray(context.health_context) ? context.health_context : []),
    ...(Array.isArray(context.nutrition_considerations) ? context.nutrition_considerations : []),
    ...(Array.isArray(context.avoid_or_limit) ? context.avoid_or_limit.map(x => `Limit: ${x}`) : []),
  ];
  return parts.filter(Boolean).slice(0, 5).join('\n') || 'Saved for future meal recommendations.';
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
  h2: { fontSize: 18, fontWeight: '700', marginBottom: 10, color: '#E6EAF2' },
  label: { fontWeight: '600', marginBottom: 4, color: '#E6EAF2' },
  input: { borderWidth: 1, borderColor: '#334155', borderRadius: 10, padding: 10, color: '#E6EAF2', backgroundColor: '#111827' },
  fieldCard: { marginBottom: 10, backgroundColor: '#141A22', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1F2937' },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  authText: { color: '#94A3B8', marginTop: -4 },
  authButton: { backgroundColor: '#EF4444', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center' },
  authButtonLogin: { backgroundColor: '#10B981' },
  cta: { backgroundColor: '#7C5CFC', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  ctaText: { color: '#F9FAFB', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  statusText: { color: '#C7D2FE', marginTop: 8 },
  contextCard: { marginTop: 8, backgroundColor: '#141A22', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1F2937' },
  contextTitle: { color: '#E6EAF2', fontWeight: '700', marginBottom: 4 },
  contextText: { color: '#CBD5E1', lineHeight: 20 },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#0F172A', padding: 16, borderRadius: 14, width: '90%', borderWidth: 1, borderColor: '#1F2937' },
});
