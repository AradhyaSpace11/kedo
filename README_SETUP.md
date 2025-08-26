# Kedo App Setup Guide

This guide will help you set up the Kedo nutrition and meal planning app with proper API key configuration.

## Prerequisites

- Node.js (v16 or higher)
- Python 3.8 or higher
- Expo CLI (`npm install -g @expo/cli`)
- Android Studio (for Android development) or Xcode (for iOS development)

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd kedo

# Install frontend dependencies
cd kedo-app
npm install

# Install backend dependencies
cd ../server
pip install -r requirements.txt
```

### 2. Environment Configuration

#### Backend (.env file)

Create a `.env` file in the `server/` directory:

```bash
cd server
cp env.example .env
```

Edit the `.env` file with your API keys:

```env
# Required: Google Gemini AI API Key
# Get from: https://makersuite.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Pixabay API Key (for food images)
# Get from: https://pixabay.com/api/docs/
PIXABAY_KEY=your_pixabay_api_key_here

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=false
```

#### Frontend Configuration

Edit `kedo-app/src/config/api.js` to configure your server URL:

```javascript
export const API_CONFIG = {
  // Change this to your server address
  BASE_URL: 'http://10.0.2.2:8000', // Android emulator
  // BASE_URL: 'http://localhost:8000', // iOS simulator
  // BASE_URL: 'http://your-server-ip:8000', // Physical device
};
```

### 3. Start the Backend Server

```bash
cd server
python main.py
```

Or using uvicorn:

```bash
cd server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 4. Start the Frontend

```bash
cd kedo-app
npx expo start
```

## API Key Setup

### Google Gemini AI (Required)

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key and add it to your `.env` file

### Pixabay API (Optional)

1. Go to [Pixabay API](https://pixabay.com/api/docs/)
2. Sign up for a free account
3. Get your API key
4. Add it to your `.env` file

## Feature Configuration

You can enable/disable features by editing `kedo-app/src/config/api.js`:

```javascript
export const FEATURE_FLAGS = {
  AI_MEAL_RECOMMENDATIONS: true,    // AI-powered meal suggestions
  MEAL_IMAGES: true,                // Food images from Pixabay
  CALENDAR_INTEGRATION: false,      // Local calendar integration
  PORTIA_AI: false,                 // Advanced AI features
  ANALYTICS: false,                 // Usage analytics
};
```

## Troubleshooting

### Common Issues

#### 1. "GEMINI_API_KEY not found" Error
- Make sure you've created the `.env` file in the `server/` directory
- Verify the API key is correct and has no extra spaces
- Check that the `.env` file is in the correct location

#### 2. "Network error" in App
- Verify the server is running on the correct port
- Check the `BASE_URL` in `src/config/api.js`
- Ensure your device/emulator can reach the server IP

#### 3. "Permission denied" for Calendar
- Grant calendar permissions when prompted
- Check device settings for app permissions

#### 4. Images not loading
- Verify your Pixabay API key is correct
- Check that `MEAL_IMAGES` is enabled in feature flags

### Debug Steps

1. **Check Server Logs**: Look for error messages in the terminal running the server
2. **Check App Logs**: Use Expo DevTools or React Native Debugger
3. **Verify API Keys**: Test your API keys in their respective dashboards
4. **Network Connectivity**: Ensure your device can reach the server

## Development

### Project Structure

```
kedo/
├── kedo-app/                 # React Native frontend
│   ├── src/
│   │   ├── components/       # Reusable components
│   │   ├── screens/          # App screens
│   │   ├── lib/             # API and utilities
│   │   └── config/          # Configuration files
│   └── package.json
├── server/                   # Python FastAPI backend
│   ├── main.py              # Main server file
│   ├── .env                 # Environment variables
│   └── requirements.txt     # Python dependencies
└── README_SETUP.md          # This file
```

### Adding New Features

1. **Backend**: Add new endpoints in `server/main.py`
2. **Frontend**: Create new components in `kedo-app/src/components/`
3. **Configuration**: Update `kedo-app/src/config/api.js` for new features

## Security Notes

- **Never commit API keys** to version control
- **Use environment variables** for all sensitive data
- **Keep your `.env` file** in `.gitignore`
- **Rotate API keys** regularly
- **Use HTTPS** in production

## Production Deployment

### Backend
- Use a production WSGI server like Gunicorn
- Set up proper environment variables
- Use HTTPS with SSL certificates
- Configure proper CORS settings

### Frontend
- Build for production: `expo build:android` or `expo build:ios`
- Update `BASE_URL` to your production server
- Configure app signing and distribution

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the error logs in your terminal
3. Verify all API keys are correctly configured
4. Ensure all dependencies are installed

## License

This project is licensed under the MIT License.
