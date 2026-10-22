import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Linking, Platform, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text as NativeText, TextInput, TouchableOpacity, View
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import TrafficMap from './TrafficMap';
import ProviderMap from './ProviderMap';

WebBrowser.maybeCompleteAuthSession();

const SESSION_KEY = 'my-paushe-session-token';
let accessToken = null;
const GOOGLE_CLIENTS = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || ''
};
const GOOGLE_CONFIGURED = Platform.select({
  web: Boolean(GOOGLE_CLIENTS.web),
  android: Boolean(GOOGLE_CLIENTS.android),
  ios: Boolean(GOOGLE_CLIENTS.ios),
  default: false
});

function Text({ style, ...props }) {
  const fontFamily = Platform.select({
    web: 'Trebuchet MS, Arial, sans-serif',
    ios: 'Avenir Next',
    android: 'sans-serif'
  });
  return <NativeText {...props} style={[{ fontFamily }, style]} />;
}

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
const CATEGORIES = [
  { id: 'car_service', title: 'Car Services', icon: '🔧', subtitle: 'Repairs, tyres & mechanics' },
  { id: 'fuel', title: 'Fueling', icon: '⛽', subtitle: 'Find nearby fuel stations' },
  { id: 'car_wash', title: 'Car & Bike Wash', icon: '🚿', subtitle: 'Book a clean and shine' },
  { id: 'restaurant', title: 'Food & Refreshments', icon: '🍽️', subtitle: 'Menus and table reservations' },
  { id: 'accommodation', title: 'Stays & Airbnb', icon: '🛏️', subtitle: 'Find places to stay' }
];

const SERVICE_PHOTOS = [
  { id: 'fuel', title: 'Fuel stops', image: require('./assets/auth/fuel.jpg') },
  { id: 'car_service', title: 'Car services', image: require('./assets/auth/car-service.jpg') },
  { id: 'restaurant', title: 'Food & dining', image: require('./assets/auth/restaurant.jpg') },
  { id: 'car_wash', title: 'Car wash', image: require('./assets/auth/car-wash.jpg') },
  { id: 'accommodation', title: 'Stays & getaways', image: require('./assets/auth/stays.jpg') }
];

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatDistance(distanceMeters) {
  const meters = Number(distanceMeters);
  if (!Number.isFinite(meters) || meters < 0) return 'Distance unavailable';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function hasCoordinates(provider) {
  if (provider?.latitude == null || provider?.longitude == null) return false;
  const latitude = Number(provider.latitude);
  const longitude = Number(provider.longitude);
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

async function openDirections(provider) {
  if (!hasCoordinates(provider)) {
    Alert.alert('Location unavailable', 'This provider does not have map coordinates yet.');
    return;
  }
  const url = `https://www.google.com/maps/dir/?api=1&destination=${provider.latitude},${provider.longitude}`;
  try {
    await Linking.openURL(url);
  } catch (error) {
    Alert.alert('Could not open directions', error.message || 'Try opening Google Maps on your device.');
  }
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

function PrimaryButton({ title, onPress, secondary, disabled, styles }) {
  return <TouchableOpacity
    accessibilityRole="button"
    accessibilityState={{ disabled: Boolean(disabled) }}
    disabled={disabled}
    style={[styles.button, secondary && styles.secondaryButton, disabled && styles.buttonDisabled]}
    onPress={onPress}>
    <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
  </TouchableOpacity>;
}

export default function App() {
  const [googleRequest, , promptGoogleAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_CLIENTS.web || 'not-configured.apps.googleusercontent.com',
    androidClientId: GOOGLE_CLIENTS.android || 'not-configured.apps.googleusercontent.com',
    iosClientId: GOOGLE_CLIENTS.ios || 'not-configured.apps.googleusercontent.com',
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true
  }, { scheme: 'mypaushe' });
  const [isDark, setIsDark] = useState(false);
  const [screen, setScreen] = useState('home');
  const [category, setCategory] = useState(null);
  const [providers, setProviders] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [selected, setSelected] = useState(null);
  const [services, setServices] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [providerChats, setProviderChats] = useState([]);
  const [activeProviderChat, setActiveProviderChat] = useState(null);
  const [message, setMessage] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [reservationTime, setReservationTime] = useState('');
  const [reservationGuests, setReservationGuests] = useState('1');
  const [reservationNote, setReservationNote] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('signup');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const styles = createStyles(isDark);

  useEffect(() => {
    let mounted = true;
    const restoreSession = async () => {
      try {
        const token = Platform.OS === 'web'
          ? (typeof window !== 'undefined' ? window.localStorage.getItem(SESSION_KEY) : null)
          : await SecureStore.getItemAsync(SESSION_KEY);
        if (token) {
          accessToken = token;
          const response = await request('/api/auth/me');
          if (mounted) setSession(response.user);
        }
      } catch (error) {
        accessToken = null;
        if (mounted && error.message !== 'Sign in to continue.') setAuthError('Could not restore your saved sign-in. Please log in again.');
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };
    restoreSession();
    return () => { mounted = false; };
  }, []);

  function button(title, onPress, secondary = false, disabled = false) {
    return <PrimaryButton title={title} onPress={onPress} secondary={secondary} disabled={disabled} styles={styles} />;
  }

  async function findCurrentLocation() {
    setLocationBusy(true);
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        throw new Error('Location permission is needed to sort services by distance.');
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      });
      const coordinates = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude
      };
      setUserLocation(coordinates);
      return coordinates;
    } catch (error) {
      const message = error.message || 'Could not determine your location.';
      setLocationError(message);
      return null;
    } finally {
      setLocationBusy(false);
    }
  }

  async function findNearbyServices() {
    const coordinates = await findCurrentLocation();
    if (!coordinates) return;
    setCategory(null);
    await loadProviders(null, search, coordinates);
  }

  async function submitAuth() {
    setAuthError('');
    setAuthBusy(true);
    try {
      const payload = { email: authEmail, password: authPassword };
      if (authMode === 'signup') payload.fullName = authName;
      const result = await request(`/api/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (Platform.OS === 'web') window.localStorage.setItem(SESSION_KEY, result.token);
      else await SecureStore.setItemAsync(SESSION_KEY, result.token);
      accessToken = result.token;
      setSession(result.user);
      setAuthPassword('');
    } catch (error) {
      setAuthError(error.message || 'Unable to sign in. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function signInWithGoogle() {
    if (!GOOGLE_CONFIGURED) return;
    setAuthError('');
    setAuthBusy(true);
    try {
      const result = await promptGoogleAsync();
      if (result.type !== 'success') return;
      const idToken = result.params?.id_token || result.authentication?.idToken;
      if (!idToken) throw new Error('Google did not return an ID token. Check the configured OAuth client.');
      const auth = await request('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken })
      });
      if (Platform.OS === 'web') window.localStorage.setItem(SESSION_KEY, auth.token);
      else await SecureStore.setItemAsync(SESSION_KEY, auth.token);
      accessToken = auth.token;
      setSession(auth.user);
    } catch (error) {
      setAuthError(error.message || 'Google sign-in failed. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function signOut() {
    try {
      if (Platform.OS === 'web') window.localStorage.removeItem(SESSION_KEY);
      else await SecureStore.deleteItemAsync(SESSION_KEY);
      accessToken = null;
      setSession(null);
      setAuthMode('login');
      setScreen('home');
    } catch (error) {
      Alert.alert('Could not sign out', error.message);
    }
  }

  function authScreen() {
    return <SafeAreaView style={styles.authSafe}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
        <View style={styles.authBrand}>
          <View style={styles.logo}><Text style={styles.logoText}>MP</Text></View>
          <View>
            <Text style={styles.authBrandName}>My Paushe</Text>
            <Text style={styles.authBrandTagline}>Your journey, made easier</Text>
          </View>
        </View>
        <View style={styles.welcomeScene}>
          <View style={styles.sceneHeader}>
            <View>
              <Text style={styles.sceneEyebrow}>THE JOURNEY, MADE EASIER</Text>
              <Text style={styles.sceneTitle}>Everything along the way.</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.servicePhotoRow}>
            {SERVICE_PHOTOS.map((service, index) =>
              <View
                key={service.id}
                style={[styles.servicePhotoCard, index === 0 && styles.servicePhotoCardFeatured]}>
                <Image
                  source={service.image}
                  style={styles.servicePhoto}
                  resizeMode="cover"
                  accessibilityLabel={service.title}
                />
                <View style={styles.servicePhotoShade} />
                <Text style={styles.servicePhotoTitle}>{service.title}</Text>
              </View>
            )}
          </ScrollView>
          <Text style={styles.sceneCaption}>Fuel, food, car care and places to stay—all in one app.</Text>
        </View>
        <View style={styles.authCard}>
          <Text style={styles.authTitle}>{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</Text>
          <Text style={styles.authSubtitle}>
            {authMode === 'signup'
              ? 'Sign up to book services and keep your trip moving.'
              : 'Log in to pick up where your journey left off.'}
          </Text>
          <View style={styles.authModeSwitch}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: authMode === 'signup' }}
              onPress={() => { setAuthMode('signup'); setAuthError(''); }}
              style={[styles.authModeOption, authMode === 'signup' && styles.authModeOptionActive]}>
              <Text style={[styles.authModeText, authMode === 'signup' && styles.authModeTextActive]}>Sign up</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: authMode === 'login' }}
              onPress={() => { setAuthMode('login'); setAuthError(''); }}
              style={[styles.authModeOption, authMode === 'login' && styles.authModeOptionActive]}>
              <Text style={[styles.authModeText, authMode === 'login' && styles.authModeTextActive]}>Log in</Text>
            </TouchableOpacity>
          </View>

          {authMode === 'signup' && <TextInput
            value={authName}
            onChangeText={setAuthName}
            placeholder="Full name"
            placeholderTextColor={styles.placeholder.color}
            autoComplete="name"
            textContentType="name"
            autoCapitalize="words"
            style={styles.authInput}
          />}
          <TextInput
            value={authEmail}
            onChangeText={setAuthEmail}
            placeholder="Email address"
            placeholderTextColor={styles.placeholder.color}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.authInput}
          />
          <TextInput
            value={authPassword}
            onChangeText={setAuthPassword}
            placeholder={authMode === 'signup' ? 'Password (at least 8 characters)' : 'Password'}
            placeholderTextColor={styles.placeholder.color}
            secureTextEntry
            autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
            textContentType={authMode === 'signup' ? 'newPassword' : 'password'}
            style={styles.authInput}
            onSubmitEditing={submitAuth}
          />
          {!!authError && <Text accessibilityRole="alert" style={styles.authError}>{authError}</Text>}
          <TouchableOpacity
            accessibilityRole="button"
            disabled={authBusy}
            onPress={submitAuth}
            style={[styles.authSubmit, authBusy && styles.authSubmitDisabled]}>
            {authBusy
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.authSubmitText}>{authMode === 'signup' ? 'Create account' : 'Log in'}</Text>}
          </TouchableOpacity>
          <View style={styles.authDivider}><View style={styles.authDividerLine} /><Text style={styles.authDividerText}>OR</Text><View style={styles.authDividerLine} /></View>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !GOOGLE_CONFIGURED || !googleRequest || authBusy }}
            disabled={!GOOGLE_CONFIGURED || !googleRequest || authBusy}
            onPress={signInWithGoogle}
            style={[styles.googleButton, (!GOOGLE_CONFIGURED || authBusy) && styles.googleButtonDisabled]}>
            <Text style={styles.googleIcon}>G</Text>
            <Text style={styles.googleButtonText}>{authBusy ? 'Connecting to Google...' : 'Continue with Google'}</Text>
          </TouchableOpacity>
          {!GOOGLE_CONFIGURED && <Text style={styles.googleHint}>Google sign-in is not configured for this platform yet. Add its Google OAuth client ID to the mobile environment and matching audience to the backend.</Text>}
          <Text style={styles.authFootnote}>By continuing, you agree to use My Paushe responsibly.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>;
  }

  async function loadProviders(cat = category, searchTerm = search, coordinates = userLocation) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (cat) params.set('category', cat);
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      if (coordinates) {
        params.set('lat', String(coordinates.latitude));
        params.set('lng', String(coordinates.longitude));
      }
      setProviders(await request(`/api/providers?${params.toString()}`));
      setScreen('providers');
    } catch (e) { Alert.alert('Could not load services', e.message); }
    finally { setLoading(false); }
  }

  async function openProvider(provider) {
    setSelected(provider);
    try {
      setServices(await request(`/api/providers/${provider.id}/services`));
      setScreen('provider');
    } catch (e) { Alert.alert('Error', e.message); }
  }

  async function createBooking(service = null) {
    if (!selected) return;
    try {
      const booking = await request('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          providerId: selected.id,
          serviceId: service?.id || null,
          bookingType: 'service'
        })
      });
      Alert.alert('Request sent', `Service request #${booking.id} has been sent to ${selected.business_name}.`);
      setScreen('bookings');
      await loadBookings();
    } catch (e) { Alert.alert('Booking failed', e.message); }
  }

  function startReservation() {
    setReservationDate('');
    setReservationTime('');
    setReservationGuests('1');
    setReservationNote('');
    setScreen('reservation');
  }

  async function submitReservation() {
    if (!selected) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservationDate) ||
        !/^\d{2}:\d{2}$/.test(reservationTime)) {
      Alert.alert('Date and time needed', 'Enter the preferred date as YYYY-MM-DD and time as HH:MM.');
      return;
    }
    const [year, month, day] = reservationDate.split('-').map(Number);
    const [hour, minute] = reservationTime.split(':').map(Number);
    const requestedAt = new Date(year, month - 1, day, hour, minute);
    if (requestedAt.getFullYear() !== year || requestedAt.getMonth() !== month - 1 ||
        requestedAt.getDate() !== day || requestedAt.getHours() !== hour ||
        requestedAt.getMinutes() !== minute || requestedAt <= new Date()) {
      Alert.alert('Choose a future time', 'The requested reservation date and time must be in the future.');
      return;
    }
    const guestCount = reservationGuests.trim() ? Number(reservationGuests) : null;
    if (guestCount !== null && (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 100)) {
      Alert.alert('Check the party size', 'Enter a number between 1 and 100, or leave it blank.');
      return;
    }
    try {
      const booking = await request('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          providerId: selected.id,
          bookingType: 'reservation',
          startAt: requestedAt.toISOString(),
          guestCount,
          customerNote: reservationNote
        })
      });
      Alert.alert('Reservation requested', `Request #${booking.id} was sent to ${selected.business_name}.`);
      await loadBookings();
    } catch (e) { Alert.alert('Reservation request failed', e.message); }
  }

  async function loadBookings() {
    setLoading(true);
    try { setBookings(await request('/api/bookings')); setScreen('bookings'); }
    catch (e) { Alert.alert('Could not load bookings', e.message); }
    finally { setLoading(false); }
  }

  async function loadActivity() {
    setScreen('settings');
    setLoading(true);
    try {
      const [bookingHistory, paymentHistory] = await Promise.all([
        request('/api/bookings'),
        request('/api/payments')
      ]);
      setBookings(bookingHistory);
      setPayments(paymentHistory);
    } catch (e) {
      Alert.alert('Could not load activity', e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(roomType = 'tro_support') {
    setActiveProviderChat(null);
    try {
      setMessages(await request(`/api/chat/messages?roomType=${roomType}`));
      setScreen('chat');
    } catch (e) { Alert.alert('Chat unavailable', e.message); }
  }

  async function loadCustomerInbox() {
    try {
      setProviderChats(await request('/api/customer/messages'));
      setScreen('inbox');
    } catch (e) { Alert.alert('Messages unavailable', e.message); }
  }

  async function openProviderChat(provider) {
    try {
      const conversation = {
        provider_id: provider.id,
        business_name: provider.business_name
      };
      setActiveProviderChat(conversation);
      setMessages(await request(`/api/providers/${provider.id}/messages`));
      setScreen('chat');
    } catch (e) { Alert.alert('Chat unavailable', e.message); }
  }

  async function sendMessage() {
    const body = message.trim();
    if (!body) return;
    try {
      if (activeProviderChat) {
        await request(`/api/providers/${activeProviderChat.provider_id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ message: body })
        });
        setMessages(await request(`/api/providers/${activeProviderChat.provider_id}/messages`));
      } else {
        await request('/api/chat/messages', {
          method: 'POST',
          body: JSON.stringify({ roomType: 'tro_support', message: body })
        });
        await loadMessages('tro_support');
      }
      setMessage('');
    } catch (e) { Alert.alert('Message not sent', e.message); }
  }

  function home() {
    return <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR EVERYDAY TRAVEL COMPANION</Text>
        <Text style={styles.heroTitle}>Everything you need,{"\n"}in one place.</Text>
        <Text style={styles.heroText}>Find services, book experiences and make your journey easier with My Paushe.</Text>
      </View>
      <TextInput value={search} onChangeText={setSearch} placeholder="Search garages, fuel, food..." placeholderTextColor={styles.placeholder.color} style={styles.search} />
      {button('Search services', () => loadProviders(category, search))}
      {button(locationBusy ? 'Finding your location…' : 'Find services near me', findNearbyServices, true, locationBusy)}
      {!!locationError && <Text accessibilityRole="alert" style={styles.locationError}>{locationError}</Text>}
      <Text style={styles.sectionTitle}>Explore services</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map(item => <TouchableOpacity key={item.id} style={styles.categoryCard}
          accessibilityRole="button"
          onPress={() => { setCategory(item.id); loadProviders(item.id, search); }}>
          <Text style={styles.categoryIcon}>{item.icon}</Text>
          <Text style={styles.categoryTitle}>{item.title}</Text>
          <Text style={styles.categorySubtitle}>{item.subtitle}</Text>
        </TouchableOpacity>)}
      </View>
      {button("Browse all providers", () => { setCategory(null); loadProviders(null); })}
      {button("My bookings", loadBookings, true)}
      {button("Chat with TRO support", () => loadMessages('tro_support'), true)}
      {button("Messages with businesses", loadCustomerInbox, true)}
      {button("Traffic reports", () => setScreen('traffic'), true)}
    </ScrollView>;
  }

  function providerList() {
    return <View style={[styles.content, styles.listScreen]}>
      {button("← Back home", () => setScreen('home'), true)}
      <Text style={styles.sectionTitle}>{category ? CATEGORIES.find(c => c.id === category)?.title : 'All providers'}</Text>
      <Text style={styles.muted}>
        {userLocation
          ? 'Nearby results are sorted by straight-line distance from your location.'
          : 'Share your location to sort nearby services and see their distance.'}
      </Text>
      {button(locationBusy ? 'Finding your location…' : 'Refresh my location', async () => {
        const coordinates = await findCurrentLocation();
        if (coordinates) await loadProviders(category, search, coordinates);
      }, true, locationBusy)}
      {!!locationError && <Text accessibilityRole="alert" style={styles.locationError}>{locationError}</Text>}
      {!!userLocation && <ProviderMap providers={providers} userLocation={userLocation} onProviderPress={openProvider} />}
      {loading ? <ActivityIndicator size="large" /> : <FlatList
        data={providers} keyExtractor={item => String(item.id)}
        ListEmptyComponent={<Text style={styles.muted}>No verified providers with mapped locations match this search yet. Add verified service providers and their map coordinates to the database.</Text>}
        renderItem={({ item }) => <View style={styles.providerCard}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`View services at ${item.business_name}`}
            style={styles.providerCardMain}
            onPress={() => openProvider(item)}>
            <View style={styles.providerIcon}><Text style={{ fontSize: 25 }}>{CATEGORIES.find(c => c.id === item.category)?.icon || '📍'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.providerName}>{item.business_name}</Text>
              <Text style={styles.muted}>{item.address}</Text>
              <Text style={styles.categoryPill}>{item.category.replace('_', ' ')}</Text>
              {item.distance_m != null && Number.isFinite(Number(item.distance_m)) &&
                <Text style={styles.distanceText}>{formatDistance(item.distance_m)} away</Text>}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`Directions to ${item.business_name}`}
            style={styles.directionsButton}
            onPress={() => openDirections(item)}>
            <Text style={styles.directionsText}>Directions</Text>
          </TouchableOpacity>
        </View>}
      />}
    </View>;
  }

  function providerDetail() {
    return <ScrollView contentContainerStyle={styles.content}>
      {button("← Back to providers", () => setScreen('providers'), true)}
      <Text style={styles.heroTitleDark}>{selected?.business_name}</Text>
      <Text style={styles.muted}>{selected?.address}</Text>
      {!!selected?.description && <Text style={styles.muted}>{selected.description}</Text>}
      {selected?.till_number && <View style={styles.settingsCard}>
        <Text style={styles.providerName}>Pay the business directly</Text>
        <Text style={styles.price}>Till number: {selected.till_number}</Text>
        <Text style={styles.note}>Payment takes place outside My Paushe. Do not share your M-Pesa PIN. My Paushe does not verify or record Till payments.</Text>
      </View>}
      {button("Message this business", () => openProviderChat(selected))}
      {button("Request a reservation", startReservation)}
      <Text style={styles.sectionTitle}>{selected?.category === 'restaurant' ? 'Menu & prices'
        : selected?.category === 'fuel' ? 'Fuel prices'
          : selected?.category === 'accommodation' ? 'Rooms & rates'
            : selected?.category === 'car_wash' ? 'Wash packages & prices'
              : 'Available services'}</Text>
      {services.length === 0 ? <Text style={styles.muted}>No services have been added by this provider yet.</Text> :
        services.map(service => <View style={styles.serviceRow} key={service.id}>
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName}>{service.name}</Text>
            <Text style={styles.muted}>{service.description}</Text>
            <Text style={styles.price}>KSh {Number(service.price_kes).toLocaleString('en-KE')}</Text>
          </View>
          <TouchableOpacity style={styles.smallButton} onPress={() => createBooking(service)}>
            <Text style={styles.smallButtonText}>Request</Text>
          </TouchableOpacity>
        </View>)}
      <Text style={styles.note}>Payments are not enabled until the M-Pesa integration is configured.</Text>
    </ScrollView>;
  }

  function bookingList() {
    return <View style={styles.content}>
      {button("← Back home", () => setScreen('home'), true)}
      <Text style={styles.sectionTitle}>My bookings</Text>
      <FlatList data={bookings} keyExtractor={item => String(item.id)}
        ListEmptyComponent={<Text style={styles.muted}>You have no bookings yet.</Text>}
        renderItem={({ item }) => <View style={styles.providerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName}>{item.business_name}</Text>
            <Text style={styles.muted}>{item.booking_type === 'reservation' ? 'Reservation request' : item.service_name || 'Service request'}</Text>
            <Text style={styles.muted}>Booking #{item.id} · {item.status}</Text>
            {!!item.start_at && <Text style={styles.muted}>Requested for: {formatDate(item.start_at)}</Text>}
            {!!item.guest_count && <Text style={styles.muted}>Guests: {item.guest_count}</Text>}
            {!!item.customer_note && <Text style={styles.muted}>Note: {item.customer_note}</Text>}
            <Text style={styles.price}>KSh {Number(item.total_kes).toLocaleString('en-KE')}</Text>
          </View>
        </View>} />
    </View>;
  }

  function reservationScreen() {
    return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {button("← Back to business", () => setScreen('provider'), true)}
      <Text style={styles.sectionTitle}>Request a reservation</Text>
      <Text style={styles.muted}>Send a preferred time to {selected?.business_name}. The business will confirm your request.</Text>
      <TextInput
        value={reservationDate}
        onChangeText={setReservationDate}
        placeholder="Preferred date (YYYY-MM-DD)"
        placeholderTextColor={styles.placeholder.color}
        style={styles.search}
        accessibilityLabel="Preferred date"
      />
      <TextInput
        value={reservationTime}
        onChangeText={setReservationTime}
        placeholder="Preferred time (HH:MM, 24-hour)"
        placeholderTextColor={styles.placeholder.color}
        style={styles.search}
        accessibilityLabel="Preferred time"
      />
      <TextInput
        value={reservationGuests}
        onChangeText={setReservationGuests}
        placeholder="Party size or number of guests"
        placeholderTextColor={styles.placeholder.color}
        keyboardType="number-pad"
        style={styles.search}
        accessibilityLabel="Party size or number of guests"
      />
      <TextInput
        value={reservationNote}
        onChangeText={setReservationNote}
        placeholder="Notes for the business (optional)"
        placeholderTextColor={styles.placeholder.color}
        multiline
        style={[styles.search, { minHeight: 92, textAlignVertical: 'top' }]}
        accessibilityLabel="Notes for the business"
      />
      {button("Send reservation request", submitReservation)}
    </ScrollView>;
  }

  function chatScreen() {
    return <View style={styles.content}>
      {button("← Back home", () => setScreen('home'), true)}
      <Text style={styles.sectionTitle}>{activeProviderChat?.business_name || 'TRO Support'}</Text>
      <FlatList style={{ flex: 1 }} data={messages} keyExtractor={item => String(item.id)}
        ListEmptyComponent={<Text style={styles.muted}>{activeProviderChat ? 'Start a conversation with this business.' : 'Start a conversation with the support team.'}</Text>}
        renderItem={({ item }) => <View style={styles.chatBubble}><Text style={styles.chatText}>{item.message}</Text></View>} />
      <View style={styles.chatComposer}>
        <TextInput value={message} onChangeText={setMessage} placeholder="Write a message..." placeholderTextColor={styles.placeholder.color} style={styles.chatInput} />
        {button("Send", sendMessage)}
      </View>
    </View>;
  }

  function customerInbox() {
    return <View style={styles.content}>
      {button("← Back home", () => setScreen('home'), true)}
      <Text style={styles.sectionTitle}>Business messages</Text>
      <FlatList
        data={providerChats}
        keyExtractor={item => String(item.provider_id)}
        ListEmptyComponent={<Text style={styles.muted}>Your conversations with businesses will appear here.</Text>}
        renderItem={({ item }) => <TouchableOpacity
          accessibilityRole="button"
          style={styles.providerCard}
          onPress={() => openProviderChat({ id: item.provider_id, business_name: item.business_name })}>
          <View style={{ flex: 1 }}>
            <Text style={styles.providerName}>{item.business_name}</Text>
            <Text style={styles.muted}>{item.message}</Text>
            <Text style={styles.muted}>{formatDate(item.created_at)}</Text>
          </View>
        </TouchableOpacity>}
      />
    </View>;
  }

  function trafficScreen() {
    return <ScrollView contentContainerStyle={styles.content}>
      {button("← Back home", () => setScreen('home'), true)}
      <Text style={styles.sectionTitle}>Live Nairobi traffic</Text>
      <Text style={styles.muted}>Google Maps traffic conditions across Nairobi. The map is centered on the city; pan and zoom to explore surrounding roads.</Text>
      <TrafficMap />
      <Text style={styles.note}>Traffic colors and updates are supplied by Google Maps and may not be available for every road. Conditions refresh frequently, but may be delayed; use your judgment while travelling.</Text>
    </ScrollView>;
  }

  function settingsScreen() {
    const activities = [
      ...bookings.map(item => ({
        id: `booking-${item.id}`,
        title: `Booking at ${item.business_name}`,
        description: `Booking #${item.id} · ${item.status}`,
        amount: item.total_kes,
        date: item.created_at,
        icon: '▤'
      })),
      ...payments.map(item => ({
        id: `payment-${item.id}`,
        title: `${String(item.method || 'Payment').toUpperCase()} payment · ${item.business_name}`,
        description: `Payment for booking #${item.booking_id} · ${item.status}`,
        amount: item.amount_kes,
        date: item.created_at,
        icon: '¤'
      }))
    ].sort((left, right) => new Date(right.date || 0) - new Date(left.date || 0));

    return <ScrollView contentContainerStyle={styles.content}>
      {button("← Back home", () => setScreen('home'), true)}
      <Text style={styles.sectionTitle}>Settings</Text>
      <View style={styles.settingsCard}>
        <Text style={styles.providerName}>Signed in as</Text>
        <Text style={styles.muted}>{session?.email}</Text>
        {button('Log out', signOut, true)}
      </View>
      <View style={styles.settingsCard}>
        <Text style={styles.providerName}>Appearance</Text>
        <Text style={styles.muted}>Choose your preferred theme.</Text>
        <View style={styles.themeOptions}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: !isDark }}
            onPress={() => setIsDark(false)}
            style={[styles.themeOption, !isDark && styles.themeOptionSelected]}>
            <Text style={styles.themeOptionText}>☀  Light</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ selected: isDark }}
            onPress={() => setIsDark(true)}
            style={[styles.themeOption, isDark && styles.themeOptionSelected]}>
            <Text style={styles.themeOptionText}>☾  Dark</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Activity history</Text>
      <Text style={styles.muted}>Your recent bookings and payment records.</Text>
      {loading ? <ActivityIndicator size="large" style={styles.activityLoader} /> :
        activities.length === 0 ? <Text style={styles.emptyState}>No activity yet. Your bookings and payments will appear here.</Text> :
          activities.map(item => <View key={item.id} style={styles.activityCard}>
            <View style={styles.activityIcon}><Text style={styles.activityIconText}>{item.icon}</Text></View>
            <View style={styles.activityDetails}>
              <Text style={styles.providerName}>{item.title}</Text>
              <Text style={styles.muted}>{item.description}</Text>
              <Text style={styles.activityDate}>{formatDate(item.date)}</Text>
            </View>
            <Text style={styles.price}>KSh {Number(item.amount || 0).toLocaleString('en-KE')}</Text>
          </View>)}
    </ScrollView>;
  }

  if (authLoading) {
    return <SafeAreaView style={styles.authLoading}>
      <ActivityIndicator size="large" color="#0F766E" />
    </SafeAreaView>;
  }
  if (!session) return authScreen();

  return <SafeAreaView style={styles.safe}>
    <ExpoStatusBar style={isDark ? 'light' : 'dark'} />
    <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
    <View style={styles.topbar}>
      <View style={styles.logo}><Text style={styles.logoText}>MP</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.brand}>My Paushe</Text>
        <Text style={styles.tagline}>Your journey, made easier</Text>
      </View>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        onPress={loadActivity}
        style={styles.settingsButton}>
        <Text style={styles.settingsIcon}>⚙</Text>
      </TouchableOpacity>
    </View>
    {screen === 'home' && home()}
    {screen === 'providers' && providerList()}
    {screen === 'provider' && providerDetail()}
    {screen === 'reservation' && reservationScreen()}
    {screen === 'bookings' && bookingList()}
    {screen === 'chat' && chatScreen()}
    {screen === 'inbox' && customerInbox()}
    {screen === 'traffic' && trafficScreen()}
    {screen === 'settings' && settingsScreen()}
    <View style={styles.bottomNav}>
      <TouchableOpacity onPress={() => setScreen('home')}><Text style={styles.navItem}>⌂ Home</Text></TouchableOpacity>
      <TouchableOpacity onPress={() => { setCategory(null); loadProviders(null); }}><Text style={styles.navItem}>⌕ Explore</Text></TouchableOpacity>
      <TouchableOpacity onPress={loadBookings}><Text style={styles.navItem}>▤ Bookings</Text></TouchableOpacity>
      <TouchableOpacity onPress={loadCustomerInbox}><Text style={styles.navItem}>☏ Messages</Text></TouchableOpacity>
      <TouchableOpacity onPress={loadActivity}><Text style={styles.navItem}>⚙ Settings</Text></TouchableOpacity>
    </View>
  </SafeAreaView>;
}

function createStyles(isDark) {
  const palette = isDark ? {
    background: '#08111F', surface: '#111D2D', surfaceAlt: '#172638',
    text: '#F2F6FC', muted: '#A7B4C7', border: '#29384B', input: '#111D2D'
  } : {
    background: '#F6F8FB', surface: '#FFFFFF', surfaceAlt: '#E7F3F1',
    text: '#122033', muted: '#778397', border: '#E8EDF3', input: '#FFFFFF'
  };
  return StyleSheet.create({
  authSafe: { flex: 1, backgroundColor: '#071A33' },
  authLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#071A33' },
  authContent: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 20, paddingTop: 26, paddingBottom: 36 },
  authBrand: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  authBrandName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  authBrandTagline: { color: '#D7E5F7', fontSize: 11, marginTop: 2 },
  welcomeScene: { backgroundColor: '#102D52', borderWidth: 1, borderColor: '#42648D', borderRadius: 22, padding: 19, marginBottom: 16, overflow: 'hidden' },
  sceneHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sceneEyebrow: { color: '#D9E8FA', fontSize: 9, letterSpacing: 1.1, fontWeight: '800' },
  sceneTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', marginTop: 4 },
  sceneRoute: { backgroundColor: '#FFFFFF20', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  sceneRouteText: { color: '#FFFFFF', fontSize: 8, letterSpacing: 0.5, fontWeight: '800' },
  servicePhotoRow: { paddingVertical: 10, gap: 11 },
  servicePhotoCard: { width: 148, height: 118, borderRadius: 15, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: '#294663' },
  servicePhotoCardFeatured: { width: 176 },
  servicePhoto: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  servicePhotoShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 15, 33, 0.2)' },
  servicePhotoTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', paddingHorizontal: 11, paddingBottom: 10, textShadowColor: '#071A33', textShadowRadius: 5 },
  sceneCaption: { color: '#E4EDFA', fontSize: 11, marginTop: 10 },
  authCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20 },
  authTitle: { color: '#122033', fontSize: 23, fontWeight: '800' },
  authSubtitle: { color: '#738095', fontSize: 13, lineHeight: 19, marginTop: 5 },
  authModeSwitch: { flexDirection: 'row', backgroundColor: '#F1F5F7', borderRadius: 12, padding: 4, marginTop: 17, marginBottom: 13 },
  authModeOption: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 9 },
  authModeOptionActive: { backgroundColor: '#FFFFFF', elevation: 2 },
  authModeText: { color: '#738095', fontSize: 13, fontWeight: '700' },
  authModeTextActive: { color: '#0F766E' },
  authInput: { color: '#122033', backgroundColor: '#FFFFFF', borderColor: '#DCE4EA', borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, fontSize: 14, marginTop: 9 },
  authError: { color: '#B42318', backgroundColor: '#FEF3F2', borderRadius: 10, padding: 10, marginTop: 11, fontSize: 12, lineHeight: 17 },
  authSubmit: { minHeight: 48, backgroundColor: '#0F766E', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  authSubmitDisabled: { opacity: 0.7 },
  authSubmitText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  authDivider: { flexDirection: 'row', alignItems: 'center', gap: 11, marginVertical: 16 },
  authDividerLine: { height: 1, flex: 1, backgroundColor: '#E8EDF3' },
  authDividerText: { color: '#8793A2', fontSize: 10, fontWeight: '700' },
  googleButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: '#DCE4EA', borderRadius: 12, backgroundColor: '#F8FAFB' },
  googleButtonDisabled: { opacity: 0.65 },
  googleIcon: { color: '#4285F4', fontSize: 16, fontWeight: '900' },
  googleButtonText: { color: '#516071', fontWeight: '700', fontSize: 13 },
  googleHint: { color: '#8793A2', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 8 },
  authFootnote: { color: '#8793A2', fontSize: 10, lineHeight: 15, textAlign: 'center', marginTop: 15 },
  safe: { flex: 1, backgroundColor: palette.background },
  topbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: palette.surface, borderBottomWidth: 1, borderBottomColor: palette.border },
  logo: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#0F766E', alignItems: 'center', justifyContent: 'center', marginRight: 11, borderWidth: 2, borderColor: '#A8E2D8' },
  logoText: { color: 'white', fontSize: 15, fontWeight: '900', letterSpacing: -1 },
  brand: { fontSize: 19, fontWeight: '800', color: palette.text, letterSpacing: 0.2 },
  tagline: { color: palette.muted, fontSize: 11, marginTop: 2 },
  topAction: { color: '#0F766E', fontWeight: '700' },
  content: { padding: 18, paddingBottom: 32, flexGrow: 1, backgroundColor: palette.background },
  listScreen: { flex: 1 },
  hero: { backgroundColor: '#103D3A', padding: 22, borderRadius: 22, marginBottom: 18 },
  eyebrow: { color: '#A8E2D8', fontWeight: '800', fontSize: 10, letterSpacing: 1.2, marginBottom: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 29, lineHeight: 35, fontWeight: '900' },
  heroText: { color: '#D5E9E6', fontSize: 14, lineHeight: 21, marginTop: 10 },
  heroTitleDark: { color: palette.text, fontSize: 27, fontWeight: '900', marginTop: 16 },
  search: { backgroundColor: palette.input, color: palette.text, borderColor: palette.border, borderWidth: 1, borderRadius: 13, padding: 14, marginBottom: 20, fontSize: 14 },
  placeholder: { color: palette.muted },
  sectionTitle: { fontSize: 20, color: palette.text, fontWeight: '800', marginTop: 8, marginBottom: 14 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  categoryCard: { width: '48.5%', backgroundColor: palette.surface, borderRadius: 17, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: palette.border, minHeight: 143 },
  categoryIcon: { fontSize: 26, marginBottom: 12 },
  categoryTitle: { fontSize: 14, fontWeight: '800', color: palette.text },
  categorySubtitle: { fontSize: 11, lineHeight: 16, color: palette.muted, marginTop: 6 },
  button: { backgroundColor: '#0F766E', paddingVertical: 14, paddingHorizontal: 18, borderRadius: 13, alignItems: 'center', marginTop: 9 },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  secondaryButton: { backgroundColor: palette.surfaceAlt },
  secondaryButtonText: { color: '#0F766E' },
  providerCard: { flexDirection: 'row', backgroundColor: palette.surface, padding: 14, borderRadius: 16, marginBottom: 11, borderWidth: 1, borderColor: palette.border, alignItems: 'center' },
  providerCardMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  directionsButton: { backgroundColor: palette.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, marginLeft: 8 },
  directionsText: { color: '#0F766E', fontWeight: '800', fontSize: 11 },
  distanceText: { color: '#0F766E', fontSize: 12, fontWeight: '800', marginTop: 5 },
  locationError: { color: '#B42318', backgroundColor: '#FEF3F2', borderRadius: 10, padding: 11, marginTop: 8, fontSize: 12, lineHeight: 17 },
  buttonDisabled: { opacity: 0.65 },
  providerIcon: { width: 52, height: 52, borderRadius: 15, backgroundColor: '#E7F3F1', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  providerName: { fontWeight: '800', color: palette.text, fontSize: 15 },
  muted: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  categoryPill: { color: '#0F766E', fontSize: 11, textTransform: 'capitalize', marginTop: 6, fontWeight: '700' },
  serviceRow: { backgroundColor: palette.surface, padding: 15, borderRadius: 15, borderWidth: 1, borderColor: palette.border, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  price: { color: '#0F766E', fontWeight: '900', marginTop: 8, fontSize: 15 },
  smallButton: { backgroundColor: '#0F766E', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10, marginLeft: 10 },
  smallButtonText: { color: 'white', fontWeight: '800' },
  note: { backgroundColor: '#FFF5DD', padding: 12, color: '#77571A', borderRadius: 10, marginTop: 16, lineHeight: 19, fontSize: 12 },
  chatBubble: { alignSelf: 'flex-start', backgroundColor: palette.surface, borderRadius: 13, padding: 12, marginVertical: 5, maxWidth: '90%' },
  chatText: { color: palette.text },
  chatComposer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  chatInput: { flex: 1, color: palette.text, backgroundColor: palette.input, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: palette.border },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 13, backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.border },
  settingsButton: { minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.surfaceAlt },
  settingsIcon: { color: '#0F766E', fontSize: 22 },
  settingsCard: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 16, padding: 16, marginBottom: 14 },
  themeOptions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  themeOption: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  themeOptionSelected: { borderColor: '#0F766E', backgroundColor: palette.surfaceAlt },
  themeOptionText: { color: palette.text, fontWeight: '700' },
  activityCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, padding: 13, borderRadius: 15, borderWidth: 1, borderColor: palette.border, marginTop: 10 },
  activityIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceAlt, marginRight: 11 },
  activityIconText: { color: '#0F766E', fontWeight: '900', fontSize: 18 },
  activityDetails: { flex: 1 },
  activityDate: { color: palette.muted, fontSize: 11, marginTop: 5 },
  emptyState: { color: palette.muted, padding: 16, lineHeight: 20, marginTop: 8 },
  activityLoader: { marginTop: 20 },
  navItem: { fontSize: 11, fontWeight: '800', color: '#0F766E' }
  });
}
