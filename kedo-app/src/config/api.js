// API Configuration
// This file contains configuration settings for the Kedo app

export const API_CONFIG = {
  // Server URL - change this to your server address
  BASE_URL: 'http://10.0.2.2:8000', // Android emulator
  // BASE_URL: 'http://localhost:8000', // iOS simulator
  // BASE_URL: 'http://your-server-ip:8000', // Physical device
  
  // API endpoints
  ENDPOINTS: {
    MEALS: '/meals',
    USER: '/user',
    PANTRY: '/pantry',
    MACROS: '/macros',
    CLARIFICATIONS: '/clarifications',
  },
  
  // Request timeout (in milliseconds)
  TIMEOUT: 10000,
  
  // Retry configuration
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};

// Feature flags - enable/disable features based on API availability
export const FEATURE_FLAGS = {
  // Enable AI-powered meal recommendations
  AI_MEAL_RECOMMENDATIONS: true,
  
  // Enable image search for meals
  MEAL_IMAGES: true,
  
  // Enable calendar integration
  CALENDAR_INTEGRATION: false, // Disabled due to OAuth issues
  
  // Enable Portia AI features
  PORTIA_AI: false, // Disabled until API keys are configured
  
  // Enable advanced analytics
  ANALYTICS: false,
};

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  API_KEY_MISSING: 'API key not configured. Please check your environment variables.',
  FEATURE_DISABLED: 'This feature is currently disabled.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
};

// Success messages
export const SUCCESS_MESSAGES = {
  MEAL_CREATED: 'Meal created successfully!',
  PROFILE_UPDATED: 'Profile updated successfully!',
  PANTRY_UPDATED: 'Pantry updated successfully!',
  MEAL_LOGGED: 'Meal logged successfully!',
};
