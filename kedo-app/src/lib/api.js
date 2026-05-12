import axios from 'axios';
import { API_CONFIG, ERROR_MESSAGES } from '../config/api';

// Use configured API URL
export const API = API_CONFIG.BASE_URL;

export async function get(path, params) {
  try {
    const r = await axios.get(API + path, { 
      params,
      timeout: API_CONFIG.TIMEOUT 
    });
    return r.data;
  } catch (error) {
    console.error('API GET Error:', error);
    throw new Error(error.response?.data?.detail || ERROR_MESSAGES.NETWORK_ERROR);
  }
}

export async function post(path, body) {
  try {
    const r = await axios.post(API + path, body, { 
      headers: { 'Content-Type': 'application/json' },
      timeout: API_CONFIG.TIMEOUT 
    });
    return r.data;
  } catch (error) {
    console.error('API POST Error:', error);
    throw new Error(error.response?.data?.detail || ERROR_MESSAGES.NETWORK_ERROR);
  }
}

export async function postForm(path, formData) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const longRunningUpload = path.includes('/speech/') || path.includes('/user/prescription');
  const timeout = setTimeout(() => controller?.abort(), longRunningUpload ? 120000 : API_CONFIG.TIMEOUT);
  try {
    const r = await fetch(API + path, {
      method: 'POST',
      body: formData,
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    const text = await r.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: text };
    }
    if (!r.ok) {
      throw new Error(data?.detail || data?.error || `Request failed with status ${r.status}`);
    }
    return data;
  } catch (error) {
    console.error('API POST Form Error:', {
      url: API + path,
      message: error.message,
      name: error.name,
    });
    if (error.name === 'AbortError') {
      throw new Error(ERROR_MESSAGES.TIMEOUT_ERROR || 'Request timed out. Please try again.');
    }
    throw new Error(error.message || ERROR_MESSAGES.NETWORK_ERROR);
  } finally {
    clearTimeout(timeout);
  }
}
