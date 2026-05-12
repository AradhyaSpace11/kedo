import React from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Audio } from 'expo-av';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { postForm } from '../lib/api';

export default function VoiceTextInput({
  value,
  onChangeText,
  placeholder,
  placeholderTextColor,
  style,
  multiline,
  keyboardType,
}) {
  const recordingRef = React.useRef(null);
  const startingRef = React.useRef(false);
  const releaseRequestedRef = React.useRef(false);
  const stopListeningRef = React.useRef(null);
  const [listening, setListening] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);

  const appendTranscript = React.useCallback((text) => {
    const spoken = String(text || '').trim();
    if (!spoken) return;
    const current = String(value || '').trim();
    const separator = current ? (multiline ? '\n' : ' ') : '';
    onChangeText(`${current}${separator}${spoken}`);
  }, [multiline, onChangeText, value]);

  const startListening = React.useCallback(async () => {
    if (recordingRef.current || startingRef.current || transcribing) return;
    startingRef.current = true;
    releaseRequestedRef.current = false;
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Microphone permission needed', 'Allow microphone access to use voice input.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setListening(true);
      if (releaseRequestedRef.current) {
        releaseRequestedRef.current = false;
        setTimeout(() => stopListeningRef.current?.(), 0);
      }
    } catch (error) {
      Alert.alert('Could not start listening', error.message);
    } finally {
      startingRef.current = false;
    }
  }, [transcribing]);

  const stopListening = React.useCallback(async () => {
    if (startingRef.current) {
      releaseRequestedRef.current = true;
      return;
    }
    const recording = recordingRef.current;
    if (!recording) return;

    recordingRef.current = null;
    setListening(false);
    setTranscribing(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      if (!uri) return;

      const form = new FormData();
      form.append('file', {
        uri,
        name: 'voice-input.m4a',
        type: 'audio/mp4',
      });
      const result = await postForm('/speech/transcribe', form);
      if (!result?.ok || !result?.text) {
        Alert.alert('Could not understand audio', result?.error || 'Try speaking again.');
        return;
      }
      appendTranscript(result.text);
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('E_AUDIO_NODATA')) {
        Alert.alert('Could not transcribe audio', message || 'Try speaking again.');
      }
    } finally {
      setTranscribing(false);
    }
  }, [appendTranscript]);

  React.useEffect(() => {
    stopListeningRef.current = stopListening;
  }, [stopListening]);

  return (
    <View>
      <TextInput
        style={style}
        value={String(value || '')}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor}
        multiline={multiline}
        keyboardType={keyboardType || 'default'}
      />
      <Pressable
        style={[styles.micButton, listening && styles.micButtonActive, transcribing && styles.micButtonBusy]}
        onPressIn={startListening}
        onPressOut={stopListening}
        disabled={transcribing}
      >
        <MaterialCommunityIcons
          name={listening ? 'microphone' : 'microphone-outline'}
          size={20}
          color="#F9FAFB"
        />
        <Text style={styles.micText}>
          {transcribing ? 'Writing...' : listening ? 'Release to insert' : 'Hold to speak'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  micButton: {
    marginTop: 8,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  micButtonActive: {
    backgroundColor: '#DC2626',
    borderColor: '#FCA5A5',
  },
  micButtonBusy: {
    opacity: 0.75,
  },
  micText: {
    color: '#F9FAFB',
    fontWeight: '700',
  },
});
