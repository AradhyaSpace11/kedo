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
  try {
    const r = await axios.post(API + path, formData, { 
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: API_CONFIG.TIMEOUT 
    });
    return r.data;
  } catch (error) {
    console.error('API POST Form Error:', error);
    throw new Error(error.response?.data?.detail || ERROR_MESSAGES.NETWORK_ERROR);
  }
}