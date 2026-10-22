import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Platform, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
const SESSION_KEY = 'my-paushe-business-session-token';
const CATEGORIES = [
  ['car_service', 'Garage / mechanic', 'Service and repair bookings'],
  ['fuel', 'Fuel station', 'Fuel grades and pump prices'],
  ['car_wash', 'Car wash', 'Wash packages and prices'],
  ['restaurant', 'Restaurant', 'Menu, food prices and table reservations'],
  ['accommodation', 'B&B / accommodation', 'Room listings and stay requests']
];
let accessToken = null;

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function readToken() {
  return Platform.OS === 'web'
    ? window.localStorage.getItem(SESSION_KEY)
    : SecureStore.getItemAsync(SESSION_KEY);
}

async function saveToken(token) {
  if (Platform.OS === 'web') window.localStorage.setItem(SESSION_KEY, token);
  else await SecureStore.setItemAsync(SESSION_KEY, token);
}

async function removeToken() {
  if (Platform.OS === 'web') window.localStorage.removeItem(SESSION_KEY);
  else await SecureStore.deleteItemAsync(SESSION_KEY);
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, secureTextEntry }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder || label}
      placeholderTextColor="#8793A2"
      keyboardType={keyboardType}
      multiline={multiline}
      secureTextEntry={secureTextEntry}
      autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
      style={[styles.input, multiline && styles.multiline]}
    />
  </View>;
}

function Button({ title, onPress, secondary, disabled }) {
  return <TouchableOpacity
    accessibilityRole="button"
    disabled={disabled}
    onPress={onPress}
    style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>
      {title}
    </Text>
  </TouchableOpacity>;
}

export default function App() {
  const [authLoading, setAuthLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [authMode, setAuthMode] = useState('signup');
  const [registrationCategory, setRegistrationCategory] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(emptyProfile());
  const [offerings, setOfferings] = useState([]);
  const [offeringDrafts, setOfferingDrafts] = useState({});
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [bookings, setBookings] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [thread, setThread] = useState([]);
  const [reply, setReply] = useState('');
  const [screen, setScreen] = useState('dashboard');

  function updateForm(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function enterDemo() {
    const demoProfile = {
      id: 1,
      business_name: 'Karibu Auto & Fuel',
      category: 'fuel',
      description: 'Fuel, quick vehicle checks and friendly service in Westlands.',
      address: 'Waiyaki Way, Westlands, Nairobi',
      phone: '+254 700 123 456',
      till_number: '5678901',
      verified: false,
      latitude: -1.2676,
      longitude: 36.8108
    };
    accessToken = null;
    setIsDemo(true);
    setRegistrationCategory(demoProfile.category);
    setUser({ full_name: 'Demo Business Owner', email: 'demo@example.test' });
    setProfile(demoProfile);
    setForm({
      businessName: demoProfile.business_name,
      category: demoProfile.category,
      description: demoProfile.description,
      address: demoProfile.address,
      phone: demoProfile.phone,
      tillNumber: demoProfile.till_number,
      latitude: String(demoProfile.latitude),
      longitude: String(demoProfile.longitude)
    });
    setOfferings([
      { id: 1, name: 'Unleaded petrol · per litre', description: 'Current pump price', price_kes: '186.50', active: true },
      { id: 2, name: 'Diesel · per litre', description: 'Current pump price', price_kes: '171.20', active: true },
      { id: 3, name: 'Tyre pressure check', description: 'Quick safety check', price_kes: '0', active: true }
    ]);
    setOfferingDrafts({});
    setBookings([
      { id: 2048, customer_id: 31, customer_name: 'Amina Wanjiku', customer_email: 'amina@example.test', status: 'pending', total_kes: '0', created_at: '2026-10-22T08:30:00.000Z' },
      { id: 2047, customer_id: 32, customer_name: 'Brian Otieno', customer_email: 'brian@example.test', status: 'confirmed', total_kes: '850', created_at: '2026-10-21T13:15:00.000Z' }
    ]);
    setConversations([
      { provider_id: 1, customer_id: 31, customer_name: 'Amina Wanjiku', message: 'Hi, are you open this evening?', sender_user_id: 31, created_at: '2026-10-22T09:15:00.000Z' },
      { provider_id: 1, customer_id: 33, customer_name: 'David Kimani', message: 'Do you have diesel available?', sender_user_id: 33, created_at: '2026-10-21T16:40:00.000Z' }
    ]);
    setActiveConversation(null);
    setThread([]);
    setReply('');
    setScreen('dashboard');
  }

  async function loadOwnerData(fallbackCategory = 'car_service') {
    const result = await request('/api/provider/profile');
    setProfile(result);
    if (result) {
      setForm({
        businessName: result.business_name || '',
        category: result.category || 'car_service',
        description: result.description || '',
        address: result.address || '',
        phone: result.phone || '',
        tillNumber: result.till_number || '',
        latitude: result.latitude == null ? '' : String(result.latitude),
        longitude: result.longitude == null ? '' : String(result.longitude)
      });
      const [items, bookingsResult, chats] = await Promise.all([
        request('/api/provider/services'),
        request('/api/provider/bookings'),
        request('/api/provider/messages')
      ]);
      setOfferings(items);
      setBookings(bookingsResult);
      setConversations(chats);
    } else {
      setForm(emptyProfile(fallbackCategory));
      setOfferings([]);
      setBookings([]);
      setConversations([]);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await readToken();
        if (!token) return;
        accessToken = token;
        const account = await request('/api/provider/account');
        const businessCategory = account.user.businessCategory || 'car_service';
        if (mounted) {
          setUser(account.user);
          setRegistrationCategory(businessCategory);
        }
        await loadOwnerData(businessCategory);
      } catch {
        accessToken = null;
        await removeToken();
      } finally {
        if (mounted) setAuthLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function authenticate() {
    setBusy(true);
    setError('');
    try {
      const data = await request(`/api/provider-auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, category: registrationCategory })
      });
      accessToken = data.token;
      await saveToken(data.token);
      setUser(data.user);
      const accountCategory = data.user.businessCategory || registrationCategory || '';
      setRegistrationCategory(accountCategory);
      if (accountCategory) setForm(current => ({ ...current, category: accountCategory }));
      setPassword('');
      await loadOwnerData(accountCategory);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      if (!isDemo) await removeToken();
      accessToken = null;
      setUser(null);
      setIsDemo(false);
      setProfile(null);
      setScreen('dashboard');
    } catch (signOutError) {
      Alert.alert('Could not sign out', signOutError.message);
    }
  }

  async function useCurrentLocation() {
    setBusy(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('Allow location access to add your business map point.');
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      updateForm('latitude', String(current.coords.latitude));
      updateForm('longitude', String(current.coords.longitude));
    } catch (locationError) {
      Alert.alert('Location unavailable', locationError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setError('');
    try {
      if (isDemo) {
        const saved = {
          ...profile,
          business_name: form.businessName,
          category: form.category,
          description: form.description,
          address: form.address,
          phone: form.phone,
          till_number: form.tillNumber,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude)
        };
        setProfile(saved);
        setScreen('dashboard');
        Alert.alert('Demo preview', 'Your changes are only saved in this preview.');
        return;
      }
      const saved = await request('/api/provider/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...form,
          latitude: form.latitude,
          longitude: form.longitude
        })
      });
      setProfile(saved);
      await loadOwnerData();
      setScreen('dashboard');
      Alert.alert('Business saved', saved.verified
        ? 'Your business details have been updated.'
        : 'Your listing is saved and will appear to customers after it is verified.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function addOffering() {
    if (!newName.trim() || !newPrice.trim()) {
      Alert.alert('Offering details needed', 'Enter a name and price before adding this item.');
      return;
    }
    setBusy(true);
    try {
      if (isDemo) {
        setOfferings(current => [...current, {
          id: Date.now(),
          name: newName.trim(),
          description: newDescription.trim(),
          price_kes: Number(newPrice).toFixed(2),
          active: true
        }]);
        setNewName('');
        setNewPrice('');
        setNewDescription('');
        return;
      }
      await request('/api/provider/services', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          priceKes: Number(newPrice),
          description: newDescription
        })
      });
      setNewName('');
      setNewPrice('');
      setNewDescription('');
      setOfferings(await request('/api/provider/services'));
    } catch (addError) {
      Alert.alert('Could not add item', addError.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleOffering(item) {
    try {
      if (isDemo) {
        setOfferings(current => current.map(existing =>
          existing.id === item.id ? { ...existing, active: !existing.active } : existing
        ));
        return;
      }
      await request(`/api/provider/services/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: item.name,
          priceKes: Number(item.price_kes),
          description: item.description || '',
          durationMinutes: item.duration_minutes,
          active: !item.active
        })
      });
      setOfferings(await request('/api/provider/services'));
    } catch (updateError) {
      Alert.alert('Could not update item', updateError.message);
    }
  }

  function updateOfferingDraft(item) {
    return offeringDrafts[item.id] || {
      name: item.name,
      price: String(item.price_kes),
      description: item.description || ''
    };
  }

  async function saveOffering(item) {
    const draft = updateOfferingDraft(item);
    try {
      if (isDemo) {
        setOfferings(current => current.map(existing =>
          existing.id === item.id
            ? { ...existing, name: draft.name, description: draft.description, price_kes: Number(draft.price).toFixed(2) }
            : existing
        ));
        setOfferingDrafts(current => {
          const updated = { ...current };
          delete updated[item.id];
          return updated;
        });
        return;
      }
      await request(`/api/provider/services/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: draft.name,
          priceKes: Number(draft.price),
          description: draft.description,
          durationMinutes: item.duration_minutes,
          active: item.active
        })
      });
      setOfferings(await request('/api/provider/services'));
      setOfferingDrafts(current => {
        const updated = { ...current };
        delete updated[item.id];
        return updated;
      });
    } catch (updateError) {
      Alert.alert('Could not save item', updateError.message);
    }
  }

  async function updateBooking(booking, status) {
    try {
      if (isDemo) {
        setBookings(current => current.map(existing =>
          existing.id === booking.id ? { ...existing, status } : existing
        ));
        return;
      }
      await request(`/api/provider/bookings/${booking.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      setBookings(await request('/api/provider/bookings'));
    } catch (bookingError) {
      Alert.alert('Could not update booking', bookingError.message);
    }
  }

  async function loadInbox() {
    try {
      if (isDemo) {
        setScreen('inbox');
        return;
      }
      setConversations(await request('/api/provider/messages'));
      setScreen('inbox');
    } catch (messageError) {
      Alert.alert('Messages unavailable', messageError.message);
    }
  }

  async function openConversation(item) {
    if (isDemo) {
      const demoThread = item.customer_id === 31
        ? [
          { id: 1, provider_id: 1, sender_user_id: 31, recipient_user_id: 1, message: 'Hi, are you open this evening?', created_at: '2026-10-22T09:15:00.000Z' },
          { id: 2, provider_id: 1, sender_user_id: 1, recipient_user_id: 31, message: 'Yes, we are open until 10 PM. How can we help?', created_at: '2026-10-22T09:20:00.000Z' }
        ]
        : [
          { id: 3, provider_id: 1, sender_user_id: 33, recipient_user_id: 1, message: item.message, created_at: item.created_at }
        ];
      setActiveConversation(item);
      setThread(demoThread);
      setScreen('conversation');
      return;
    }
    const details = await request(
      `/api/provider/messages/${item.provider_id}/${item.customer_id}`
    );
    setActiveConversation(item);
    setThread(details);
    setScreen('conversation');
  }

  async function sendReply() {
    if (!reply.trim() || !activeConversation) return;
    try {
      if (isDemo) {
        const createdAt = new Date().toISOString();
        const nextMessage = {
          id: Date.now(),
          provider_id: activeConversation.provider_id,
          sender_user_id: 1,
          recipient_user_id: activeConversation.customer_id,
          message: reply.trim(),
          created_at: createdAt
        };
        setThread(current => [...current, nextMessage]);
        setConversations(current => current.map(item =>
          item.customer_id === activeConversation.customer_id
            ? { ...item, message: nextMessage.message, sender_user_id: 1, created_at: createdAt }
            : item
        ));
        setReply('');
        return;
      }
      await request(
        `/api/provider/messages/${activeConversation.provider_id}/${activeConversation.customer_id}`,
        { method: 'POST', body: JSON.stringify({ message: reply.trim() }) }
      );
      setReply('');
      const updated = await request(
        `/api/provider/messages/${activeConversation.provider_id}/${activeConversation.customer_id}`
      );
      setThread(updated);
      setConversations(await request('/api/provider/messages'));
    } catch (messageError) {
      Alert.alert('Message not sent', messageError.message);
    }
  }

  function loginScreen() {
    return <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
      <View style={styles.brandBlock}>
        <Text style={styles.brandMark}>MP</Text>
        <Text style={styles.brandTitle}>My Paushe Business</Text>
        <Text style={styles.muted}>Manage your listing and connect with customers.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.title}>{authMode === 'signup' ? 'Create an owner account' : 'Owner sign in'}</Text>
        {authMode === 'signup' && <Field label="Your name" value={fullName} onChangeText={setFullName} />}
        {authMode === 'signup' && <>
          <Text style={styles.label}>Choose your business type</Text>
          <Text style={styles.muted}>Each owner account is dedicated to one kind of business.</Text>
          <View style={styles.registrationCategoryList}>
            {CATEGORIES.map(([id, label, description]) => <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: registrationCategory === id }}
              key={id}
              onPress={() => setRegistrationCategory(id)}
              style={[styles.registrationCategory, registrationCategory === id && styles.categorySelected]}>
              <Text style={[styles.categoryText, registrationCategory === id && styles.categoryTextSelected]}>{label}</Text>
              <Text style={styles.smallNote}>{description}</Text>
            </TouchableOpacity>)}
          </View>
        </>}
        <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="Password (at least 8 characters)" value={password} onChangeText={setPassword} secureTextEntry />
        {!!error && <Text style={styles.error}>{error}</Text>}
          <Button title={busy ? 'Please wait…' : authMode === 'signup' ? 'Create owner account' : 'Sign in'} onPress={authenticate} disabled={busy || (authMode === 'signup' && !registrationCategory)} />
        <Button
          title={authMode === 'signup' ? 'I already have an account' : 'Create an account'}
          onPress={() => { setAuthMode(authMode === 'signup' ? 'login' : 'signup'); setError(''); setRegistrationCategory(''); }}
          secondary
        />
        <Button title="Explore app demo" onPress={enterDemo} secondary />
        <Text style={styles.smallNote}>Demo uses sample information. Changes are temporary and are not sent to the server.</Text>
      </View>
    </ScrollView>;
  }

  function dashboard() {
    if (!profile) {
      return <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Bring your business to more customers.</Text>
          <Text style={styles.heroText}>Add your business location, services, menu or fuel prices and customer contact details.</Text>
        </View>
        <Button title="Set up my business" onPress={() => setScreen('profile')} />
      </ScrollView>;
    }
    return <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{profile.verified ? 'LIVE LISTING' : 'LISTING REVIEW'}</Text>
        <Text style={styles.heroTitle}>{profile.business_name}</Text>
        <Text style={styles.heroText}>{profile.verified
          ? 'Your business is visible to customers.'
          : 'Your listing is saved but not visible to customers until it is verified.'}</Text>
      </View>
      <View style={styles.actionGrid}>
        <Button title="Business details" onPress={() => setScreen('profile')} />
        <Button
          title={profile.category === 'restaurant' ? 'Menu & prices'
            : profile.category === 'fuel' ? 'Fuel prices'
              : profile.category === 'accommodation' ? 'Rooms & rates'
                : profile.category === 'car_wash' ? 'Wash packages & prices'
                  : 'Services & prices'}
          onPress={() => setScreen('offerings')}
        />
        <Button title={`Bookings (${bookings.length})`} onPress={() => setScreen('bookings')} secondary />
        <Button title={`Messages (${conversations.length})`} onPress={loadInbox} secondary />
      </View>
      {profile.category === 'fuel' && <View style={styles.card}>
        <Text style={styles.cardTitle}>Fuel prices</Text>
        <Text style={styles.muted}>Add each fuel grade and its price per litre under Services & menu.</Text>
      </View>}
      {!!profile.till_number && <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer payment details</Text>
        <Text style={styles.muted}>Till number: {profile.till_number}</Text>
        <Text style={styles.smallNote}>Customers pay outside the app. My Paushe does not confirm or track Till payments.</Text>
      </View>}
      {isDemo
        ? <Button title="Exit demo" onPress={signOut} secondary />
        : <Button title="Sign out" onPress={signOut} secondary />}
    </ScrollView>;
  }

  function profileEditor() {
    return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button title="← Dashboard" onPress={() => setScreen('dashboard')} secondary />
      <Text style={styles.title}>Business details</Text>
      <Field label="Business name" value={form.businessName} onChangeText={value => updateForm('businessName', value)} />
      <Text style={styles.label}>Registered business type</Text>
      <View style={[styles.registrationCategory, styles.categorySelected]}>
        <Text style={styles.categoryTextSelected}>
          {CATEGORIES.find(([id]) => id === form.category)?.[1] || 'Business type'}
        </Text>
        <Text style={styles.smallNote}>This owner account manages one business type. To register another type, use a separate owner account.</Text>
      </View>
      <Field label="Description" value={form.description} onChangeText={value => updateForm('description', value)} multiline />
      <Field label="Street, area or landmark" value={form.address} onChangeText={value => updateForm('address', value)} />
      <Field label="Business phone" value={form.phone} onChangeText={value => updateForm('phone', value)} keyboardType="phone-pad" />
      <Field label="Till number (5–10 digits)" value={form.tillNumber} onChangeText={value => updateForm('tillNumber', value)} keyboardType="number-pad" />
      <Text style={styles.label}>Map location</Text>
      <Button title="Use my current location" onPress={useCurrentLocation} secondary disabled={busy} />
      <Field label="Latitude" value={form.latitude} onChangeText={value => updateForm('latitude', value)} keyboardType="decimal-pad" />
      <Field label="Longitude" value={form.longitude} onChangeText={value => updateForm('longitude', value)} keyboardType="decimal-pad" />
      {isDemo && <Text style={styles.smallNote}>Edits in demo mode stay on this device temporarily.</Text>}
      <Text style={styles.smallNote}>Use the business location itself. Coordinates can be edited manually if you are not at the business.</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button title={busy ? 'Saving…' : 'Save business'} onPress={saveProfile} disabled={busy} />
    </ScrollView>;
  }

  function offeringEditor() {
    return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Button title="← Dashboard" onPress={() => setScreen('dashboard')} secondary />
      <Text style={styles.title}>{profile?.category === 'restaurant' ? 'Menu & prices'
        : profile?.category === 'fuel' ? 'Fuel prices'
          : profile?.category === 'accommodation' ? 'Rooms & stay rates'
            : profile?.category === 'car_wash' ? 'Wash packages & prices'
              : 'Services & prices'}</Text>
      {isDemo && <Text style={styles.smallNote}>Try editing prices, adding an item, or hiding and publishing an offering. Changes are temporary.</Text>}
      {!profile && <Text style={styles.muted}>Save your business profile before adding offerings.</Text>}
      {offerings.map(item => {
        const draft = updateOfferingDraft(item);
        return <View key={item.id} style={styles.card}>
          <Field label="Item name" value={draft.name} onChangeText={value =>
            setOfferingDrafts(current => ({ ...current, [item.id]: { ...draft, name: value } }))} />
          <Field label="Price in KSh" value={draft.price} keyboardType="decimal-pad" onChangeText={value =>
            setOfferingDrafts(current => ({ ...current, [item.id]: { ...draft, price: value } }))} />
          <Field label="Description" value={draft.description} onChangeText={value =>
            setOfferingDrafts(current => ({ ...current, [item.id]: { ...draft, description: value } }))} />
          <Text style={styles.smallNote}>{item.active ? 'Visible to customers' : 'Hidden from customers'}</Text>
          <View style={styles.inlineActions}>
            <Button title="Save changes" onPress={() => saveOffering(item)} />
            <Button title={item.active ? 'Hide' : 'Publish'} onPress={() => toggleOffering(item)} secondary />
          </View>
        </View>;
      })}
      {profile && <View style={styles.card}>
        <Text style={styles.cardTitle}>Add an item</Text>
        <Field label={profile.category === 'restaurant' ? 'Menu item'
          : profile.category === 'fuel' ? 'Fuel grade (e.g. Petrol per litre)'
            : profile.category === 'accommodation' ? 'Room or stay listing'
              : profile.category === 'car_wash' ? 'Wash package'
                : 'Service name'} value={newName} onChangeText={setNewName} />
        <Field label="Price in KSh" value={newPrice} onChangeText={setNewPrice} keyboardType="decimal-pad" />
        <Field label="Description" value={newDescription} onChangeText={setNewDescription} multiline />
        <Button title={busy ? 'Adding…' : 'Add item'} onPress={addOffering} disabled={busy} />
      </View>}
    </ScrollView>;
  }

  function bookingList() {
    return <FlatList
      style={styles.flex}
      contentContainerStyle={styles.content}
      data={bookings}
      keyExtractor={item => String(item.id)}
      ListHeaderComponent={<><Button title="← Dashboard" onPress={() => setScreen('dashboard')} secondary /><Text style={styles.title}>Booking requests</Text></>}
      ListEmptyComponent={<Text style={styles.muted}>Customer booking requests will appear here.</Text>}
      renderItem={({ item }) => <View style={styles.card}>
        <Text style={styles.cardTitle}>Booking #{item.id} · {item.status}</Text>
        <Text style={styles.muted}>{item.booking_type === 'reservation' ? 'Reservation request' : item.service_name || 'Service request'}</Text>
        <Text style={styles.muted}>{item.customer_name} · {item.customer_email}</Text>
        <Text style={styles.muted}>{new Date(item.created_at).toLocaleString()}</Text>
        {!!item.start_at && <Text style={styles.muted}>Requested for: {new Date(item.start_at).toLocaleString()}</Text>}
        {!!item.guest_count && <Text style={styles.muted}>Guests: {item.guest_count}</Text>}
        {!!item.customer_note && <Text style={styles.bookingNote}>Customer note: {item.customer_note}</Text>}
        <Text style={styles.price}>KSh {Number(item.total_kes).toLocaleString('en-KE')}</Text>
        {item.status === 'pending' && <View style={styles.inlineActions}>
          <Button title="Confirm" onPress={() => updateBooking(item, 'confirmed')} />
          <Button title="Decline" onPress={() => updateBooking(item, 'cancelled')} secondary />
        </View>}
        {item.status === 'confirmed' && <Button title="Mark completed" onPress={() => updateBooking(item, 'completed')} />}
      </View>}
    />;
  }

  function inbox() {
    return <FlatList
      style={styles.flex}
      contentContainerStyle={styles.content}
      data={conversations}
      keyExtractor={item => `${item.provider_id}-${item.customer_id}`}
      ListHeaderComponent={<><Button title="← Dashboard" onPress={() => setScreen('dashboard')} secondary /><Text style={styles.title}>Customer messages</Text></>}
      ListEmptyComponent={<Text style={styles.muted}>Messages from customers will appear here.</Text>}
      renderItem={({ item }) => <TouchableOpacity style={styles.card} onPress={() => openConversation(item)}>
        <Text style={styles.cardTitle}>{item.customer_name}</Text>
        <Text style={styles.muted}>{item.message}</Text>
        <Text style={styles.smallNote}>{new Date(item.created_at).toLocaleString()}</Text>
      </TouchableOpacity>}
    />;
  }

  function conversation() {
    return <View style={styles.threadScreen}>
      <Button title="← Messages" onPress={() => setScreen('inbox')} secondary />
      <Text style={styles.title}>{activeConversation?.customer_name || 'Customer conversation'}</Text>
      <FlatList
        style={styles.flex}
        data={thread}
        keyExtractor={item => String(item.id)}
        ListEmptyComponent={<Text style={styles.muted}>No messages yet.</Text>}
        renderItem={({ item }) => <View style={[styles.messageBubble, item.sender_user_id === activeConversation?.customer_id && styles.customerBubble]}>
          <Text style={styles.messageText}>{item.message}</Text>
          <Text style={styles.messageDate}>{new Date(item.created_at).toLocaleString()}</Text>
        </View>}
      />
      <View style={styles.composer}>
        <TextInput value={reply} onChangeText={setReply} placeholder="Write a reply…" style={[styles.input, styles.replyInput]} />
        <Button title="Send" onPress={sendReply} />
      </View>
    </View>;
  }

  if (authLoading) return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color="#FFFFFF" /></SafeAreaView>;
  return <SafeAreaView style={styles.safe}>
    <ExpoStatusBar style="light" />
    <StatusBar barStyle="light-content" />
    <View style={styles.header}>
      <View style={styles.brandMarkSmall}><Text style={styles.brandMarkText}>MP</Text></View>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle}>My Paushe Business</Text>
        {!!user && <Text style={styles.muted}>{user.full_name || 'Owner account'}</Text>}
      </View>
      {!!user && profile && <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Open customer messages"
        onPress={loadInbox}
        style={styles.messageShortcut}>
        <Text style={styles.messageShortcutText}>✉</Text>
      </TouchableOpacity>}
      {!!user && <TouchableOpacity onPress={signOut}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity>}
    </View>
    {isDemo && <View style={styles.demoBanner}>
      <Text style={styles.demoBannerTitle}>DEMO MODE · SAMPLE DATA ONLY</Text>
      <Text style={styles.demoBannerDescription}>Edits are temporary and are not sent to the server.</Text>
    </View>}
    {!user ? loginScreen() :
      screen === 'profile' ? profileEditor() :
      screen === 'offerings' ? offeringEditor() :
      screen === 'bookings' ? bookingList() :
      screen === 'inbox' ? inbox() :
      screen === 'conversation' ? conversation() : dashboard()}
  </SafeAreaView>;
}

function emptyProfile(category = 'car_service') {
  return {
    businessName: '', category, description: '', address: '',
    phone: '', tillNumber: '', latitude: '', longitude: ''
  };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000000' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#080808', borderBottomWidth: 1, borderBottomColor: '#242424' },
  brandMarkSmall: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#202020', alignItems: 'center', justifyContent: 'center', marginRight: 11, borderWidth: 1, borderColor: '#383838' },
  brandMarkText: { color: '#FFFFFF', fontWeight: '900' },
  headerText: { flex: 1 },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  signOut: { color: '#E8E8E8', fontWeight: '800', padding: 8 },
  demoBanner: { backgroundColor: '#171717', borderBottomWidth: 1, borderBottomColor: '#333333', paddingHorizontal: 18, paddingVertical: 9 },
  demoBannerTitle: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  demoBannerDescription: { color: '#B7B7B7', fontSize: 11, marginTop: 3 },
  messageShortcut: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#202020', alignItems: 'center', justifyContent: 'center', marginRight: 7 },
  messageShortcutText: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  content: { padding: 18, paddingBottom: 40, flexGrow: 1, backgroundColor: '#000000' },
  authContent: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 20, paddingTop: 40, flexGrow: 1, backgroundColor: '#000000' },
  brandBlock: { alignItems: 'center', marginBottom: 22 },
  brandMark: { color: '#FFFFFF', backgroundColor: '#171717', overflow: 'hidden', borderRadius: 20, padding: 19, fontSize: 20, fontWeight: '900', marginBottom: 12, borderWidth: 1, borderColor: '#383838' },
  brandTitle: { color: '#FFFFFF', fontSize: 23, fontWeight: '900' },
  title: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', marginTop: 12, marginBottom: 10 },
  hero: { backgroundColor: '#111111', borderWidth: 1, borderColor: '#292929', borderRadius: 20, padding: 21, marginBottom: 17 },
  eyebrow: { color: '#D0D0D0', fontWeight: '800', letterSpacing: 1, fontSize: 10, marginBottom: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', lineHeight: 31 },
  heroText: { color: '#C6C6C6', fontSize: 13, lineHeight: 20, marginTop: 8 },
  card: { backgroundColor: '#101010', borderColor: '#292929', borderWidth: 1, borderRadius: 15, padding: 15, marginTop: 12 },
  listCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#101010', borderColor: '#292929', borderWidth: 1, borderRadius: 15, padding: 15, marginTop: 10 },
  cardTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  field: { marginTop: 11 },
  label: { color: '#E5E5E5', fontSize: 12, fontWeight: '800', marginBottom: 6 },
  input: { backgroundColor: '#171717', borderColor: '#393939', borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 12, color: '#FFFFFF', fontSize: 14 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  muted: { color: '#AAAAAA', fontSize: 12, lineHeight: 18, marginTop: 5 },
  button: { minHeight: 43, justifyContent: 'center', alignItems: 'center', backgroundColor: '#202020', paddingHorizontal: 14, paddingVertical: 11, borderRadius: 11, marginTop: 9, borderWidth: 1, borderColor: '#494949' },
  secondaryButton: { backgroundColor: '#090909', borderWidth: 1, borderColor: '#393939' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  secondaryText: { color: '#FFFFFF' },
  disabled: { opacity: 0.6 },
  error: { color: '#FFB4AB', backgroundColor: '#321B1B', padding: 10, borderRadius: 9, marginTop: 10, fontSize: 12 },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  categoryOption: { borderWidth: 1, borderColor: '#393939', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 10, backgroundColor: '#171717' },
  registrationCategoryList: { gap: 7, marginTop: 7 },
  registrationCategory: { borderWidth: 1, borderColor: '#393939', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, backgroundColor: '#171717', marginTop: 7 },
  categorySelected: { backgroundColor: '#252525', borderColor: '#BDBDBD' },
  categoryText: { color: '#C4C4C4', fontSize: 11, fontWeight: '700' },
  categoryTextSelected: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  smallNote: { color: '#A0A0A0', fontSize: 11, lineHeight: 17, marginTop: 7 },
  bookingNote: { color: '#DDDDDD', fontSize: 12, lineHeight: 18, marginTop: 8, fontStyle: 'italic' },
  actionGrid: { gap: 3 },
  price: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', marginTop: 7 },
  smallAction: { backgroundColor: '#242424', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, marginLeft: 8, borderWidth: 1, borderColor: '#393939' },
  smallActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  flex: { flex: 1 },
  inlineActions: { flexDirection: 'row', gap: 9, marginTop: 7 },
  threadScreen: { flex: 1, padding: 18 },
  messageBubble: { backgroundColor: '#292929', borderRadius: 13, padding: 11, marginVertical: 5, alignSelf: 'flex-end', maxWidth: '86%' },
  customerBubble: { alignSelf: 'flex-start', backgroundColor: '#111111', borderColor: '#393939', borderWidth: 1 },
  messageText: { color: '#FFFFFF', fontSize: 13, lineHeight: 19 },
  messageDate: { color: '#AAAAAA', fontSize: 9, marginTop: 5 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8 },
  replyInput: { flex: 1 }
});
