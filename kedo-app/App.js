import 'react-native-gesture-handler';
import * as React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './src/screens/HomeScreen';
import PantryScreen from './src/screens/PantryScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import Animated, { useSharedValue, withTiming, useAnimatedStyle } from 'react-native-reanimated';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

const Tab = createBottomTabNavigator();

const AppTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0B1117',
    card: '#0F172A',
    text: '#E6EAF2',
    border: '#1F2937',
    primary: '#7C5CFC',
  },
};

function TabIcon({ name, focused }) {
  const scale = useSharedValue(focused ? 1 : 0.9);
  const dot = useSharedValue(focused ? 1 : 0);
  React.useEffect(() => {
    scale.value = withTiming(focused ? 1 : 0.9, { duration: 200 });
    dot.value = withTiming(focused ? 1 : 0, { duration: 200 });
  }, [focused]);
  const rStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: dot.value, transform: [{ scale: dot.value }] }));
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={rStyle}>
        <Ionicons name={name} size={22} color={focused ? '#7C5CFC' : '#9CA3AF'} />
      </Animated.View>
      <Animated.View style={[{ width: 6, height: 6, backgroundColor: '#7C5CFC', borderRadius: 999, marginTop: 4 }, dotStyle]} />
    </View>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={AppTheme}>
      <StatusBar style="light" backgroundColor="#0B1117" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerStyle: { backgroundColor: '#0B1117' },
          headerTitleStyle: { color: '#E6EAF2' },
          headerTintColor: '#E6EAF2',
          tabBarStyle: {
            backgroundColor: '#0F172A',
            borderTopColor: '#1F2937',
            height: 64,
            paddingVertical: 8,
            elevation: 0,
          },
          // Use default background so the bar is attached (not floating)
          tabBarShowLabel: false,
          tabBarActiveTintColor: '#7C5CFC',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarIcon: ({ focused }) => {
            const map = {
              'Home': focused ? 'home' : 'home-outline',
              'Pantry': focused ? 'basket' : 'basket-outline',
              'My Profile': focused ? 'person' : 'person-outline',
            };
            return <TabIcon name={map[route.name]} focused={focused} />;
          },
          sceneStyle: { backgroundColor: '#0B1117' },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Pantry" component={PantryScreen} />
        <Tab.Screen name="My Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
