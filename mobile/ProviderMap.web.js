import React from 'react';
import { Text, View } from 'react-native';

const GOOGLE_MAPS_WEB_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY || '';

function mapDocument(apiKey, providers, userLocation) {
  const locations = providers
    .filter(provider =>
      provider.latitude != null &&
      provider.longitude != null &&
      Number.isFinite(Number(provider.latitude)) &&
      Number.isFinite(Number(provider.longitude)))
    .map(provider => ({
      latitude: Number(provider.latitude),
      longitude: Number(provider.longitude),
      title: provider.business_name,
      address: provider.address,
      category: String(provider.category).replace('_', ' ')
    }));
  const mapData = JSON.stringify({
    locations,
    userLocation: userLocation || null
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      html, body, #map { width: 100%; height: 100%; margin: 0; }
      #status {
        position: absolute; z-index: 1; top: 12px; left: 12px; right: 12px;
        padding: 10px 12px; border-radius: 8px; background: white;
        color: #263238; font: 14px Arial, sans-serif; box-shadow: 0 1px 5px #0003;
      }
    </style>
  </head>
  <body>
    <div id="status">Loading nearby service locations…</div>
    <div id="map"></div>
    <script>
      const mapData = ${mapData};
      function initMap() {
        try {
          const center = mapData.userLocation || mapData.locations[0] || { latitude: -1.286389, longitude: 36.817223 };
          const map = new google.maps.Map(document.getElementById('map'), {
            center: { lat: center.latitude, lng: center.longitude },
            zoom: 12,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true
          });
          const bounds = new google.maps.LatLngBounds();
          let markerCount = 0;
          mapData.locations.forEach(function (location) {
            const position = { lat: location.latitude, lng: location.longitude };
            const marker = new google.maps.Marker({ map, position, title: location.title });
            const info = new google.maps.InfoWindow({
              content: '<strong></strong><br><span></span><br><small></small>'
            });
            const content = info.getContent();
            const holder = document.createElement('div');
            holder.innerHTML = content;
            holder.querySelector('strong').textContent = location.title;
            holder.querySelector('span').textContent = location.category;
            holder.querySelector('small').textContent = location.address || '';
            info.setContent(holder);
            marker.addListener('click', function () { info.open({ map, anchor: marker }); });
            bounds.extend(position);
            markerCount += 1;
          });
          if (mapData.userLocation) {
            const position = {
              lat: mapData.userLocation.latitude,
              lng: mapData.userLocation.longitude
            };
            new google.maps.Marker({
              map,
              position,
              title: 'Your location',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#1677FF',
                fillOpacity: 1,
                strokeColor: '#FFFFFF',
                strokeWeight: 2
              }
            });
            bounds.extend(position);
            markerCount += 1;
          }
          if (markerCount > 1) map.fitBounds(bounds, 48);
          document.getElementById('status').style.display = 'none';
        } catch (error) {
          showMapError();
        }
      }
      function showMapError() {
        document.getElementById('status').textContent =
          'Google Maps could not load. Check the API key, billing, enabled APIs, and website restrictions.';
      }
      window.setTimeout(function () {
        if (!window.google || !window.google.maps) showMapError();
      }, 15000);
    </script>
    <script async defer src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=initMap"></script>
  </body>
</html>`;
}

export default function ProviderMap({ providers, userLocation }) {
  if (!GOOGLE_MAPS_WEB_KEY) {
    return <View accessibilityRole="alert" style={styles.message}>
      <Text style={styles.messageText}>Add EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY to mobile/.env to show service locations on the map.</Text>
    </View>;
  }

  return <View style={styles.mapFrame}>
    {React.createElement('iframe', {
      title: 'Nearby My Paushe service locations',
      srcDoc: mapDocument(GOOGLE_MAPS_WEB_KEY, providers, userLocation),
      style: { width: '100%', height: '100%', border: 0 },
      allowFullScreen: true,
      referrerPolicy: 'no-referrer-when-downgrade'
    })}
  </View>;
}

const styles = {
  mapFrame: {
    width: '100%',
    height: 360,
    overflow: 'hidden',
    borderRadius: 14,
    marginTop: 14,
    marginBottom: 14,
    backgroundColor: '#E8EDF3'
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
};
