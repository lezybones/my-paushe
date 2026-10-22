import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';

const googleMapsKeyConfigured = Platform.select({
  android: Boolean(Constants.expoConfig?.extra?.googleMapsAndroidConfigured),
  ios: Boolean(Constants.expoConfig?.extra?.googleMapsIosConfigured),
  default: false
});

const NAIROBI_REGION = {
  latitude: -1.286389,
  longitude: 36.817223,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5
};

export default function TrafficMap() {
  if (!googleMapsKeyConfigured) {
    return <View accessibilityRole="alert" style={styles.message}>
      <Text style={styles.messageText}>Add the Android/iOS Google Maps API key to mobile/.env and rebuild the app to show live traffic.</Text>
    </View>;
  }

  return <MapView
    accessibilityLabel="Live traffic map centered on Nairobi"
    style={styles.map}
    provider={PROVIDER_GOOGLE}
    initialRegion={NAIROBI_REGION}
    showsTraffic
    showsCompass
    showsUserLocation={false}
  />;
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    height: 500,
    borderRadius: 14,
    marginTop: 14,
    overflow: 'hidden'
  },
  message: {
    minHeight: 140,
    justifyContent: 'center',
    padding: 18,
    borderRadius: 14,
    marginTop: 14,
    backgroundColor: '#E7F3F1'
  },
  messageText: { color: '#122033', fontSize: 13, lineHeight: 20 }
});
