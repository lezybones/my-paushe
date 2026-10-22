import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const googleMapsKeyConfigured = Platform.select({
  android: Boolean(Constants.expoConfig?.extra?.googleMapsAndroidConfigured),
  ios: Boolean(Constants.expoConfig?.extra?.googleMapsIosConfigured),
  default: false
});

const NAIROBI = { latitude: -1.286389, longitude: 36.817223 };

export default function ProviderMap({ providers, userLocation, onProviderPress }) {
  if (!googleMapsKeyConfigured) {
    return <View accessibilityRole="alert" style={styles.message}>
      <Text style={styles.messageText}>Add the Android/iOS Google Maps API key to mobile/.env and rebuild the app to show service locations on the map.</Text>
    </View>;
  }

  const firstProvider = providers.find(provider =>
    provider.latitude != null &&
    provider.longitude != null &&
    Number.isFinite(Number(provider.latitude)) &&
    Number.isFinite(Number(provider.longitude)));
  const initialCenter = userLocation || (firstProvider
    ? { latitude: Number(firstProvider.latitude), longitude: Number(firstProvider.longitude) }
    : NAIROBI);

  return <MapView
    accessibilityLabel="Nearby My Paushe service locations"
    style={styles.map}
    provider={PROVIDER_GOOGLE}
    initialRegion={{ ...initialCenter, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
    showsCompass>
    {userLocation && <Marker coordinate={userLocation} title="Your location" pinColor="#1677FF" />}
    {providers.map(provider => {
      if (provider.latitude == null || provider.longitude == null) return null;
      const latitude = Number(provider.latitude);
      const longitude = Number(provider.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return <Marker
        key={String(provider.id)}
        coordinate={{ latitude, longitude }}
        title={provider.business_name}
        description={`${provider.category.replace('_', ' ')} · ${provider.address}`}
        onCalloutPress={() => onProviderPress?.(provider)}
      />;
    })}
  </MapView>;
}

const styles = StyleSheet.create({
  map: {
    width: '100%',
    height: 360,
    borderRadius: 14,
    marginTop: 14,
    marginBottom: 14,
    overflow: 'hidden'
  },
  message: {
    minHeight: 100,
    justifyContent: 'center',
    padding: 18,
    borderRadius: 14,
    marginTop: 14,
    marginBottom: 14,
    backgroundColor: '#E7F3F1'
  },
  messageText: { color: '#122033', fontSize: 13, lineHeight: 20 }
});
