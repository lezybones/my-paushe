import React from 'react';
import { Text, View } from 'react-native';

const GOOGLE_MAPS_WEB_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY || '';

function mapDocument(apiKey) {
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
    <div id="status">Loading live Nairobi traffic…</div>
    <div id="map"></div>
    <script>
      function initMap() {
        try {
          const map = new google.maps.Map(document.getElementById('map'), {
            center: { lat: -1.286389, lng: 36.817223 },
            zoom: 10,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true
          });
          new google.maps.TrafficLayer().setMap(map);
          document.getElementById('status').style.display = 'none';
        } catch (error) {
          showMapError();
        }
      }
      function showMapError() {
        const status = document.getElementById('status');
        status.textContent = 'Google Maps could not load. Check the web API key, billing, enabled APIs, and website restrictions.';
      }
      window.setTimeout(function () {
        if (!window.google || !window.google.maps) showMapError();
      }, 15000);
    </script>
    <script async defer src="https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=initMap"></script>
  </body>
</html>`;
}

export default function TrafficMap() {
  if (!GOOGLE_MAPS_WEB_KEY) {
    return <View accessibilityRole="alert" style={styles.message}>
      <Text style={styles.messageText}>Add EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY to mobile/.env, enable Maps JavaScript API, then restart Expo.</Text>
    </View>;
  }

  return <View style={styles.mapFrame}>
    {React.createElement('iframe', {
      title: 'Live traffic across Nairobi',
      srcDoc: mapDocument(GOOGLE_MAPS_WEB_KEY),
      style: { width: '100%', height: '100%', border: 0 },
      allowFullScreen: true,
      referrerPolicy: 'no-referrer-when-downgrade'
    })}
  </View>;
}

const styles = {
  mapFrame: {
    width: '100%',
    height: 500,
    overflow: 'hidden',
    borderRadius: 14,
    marginTop: 14,
    backgroundColor: '#E8EDF3'
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
};
