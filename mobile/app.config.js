module.exports = ({ config }) => {
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || '';
  const iosMapsKey = process.env.GOOGLE_MAPS_IOS_API_KEY || '';

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          ...(androidMapsKey ? { apiKey: androidMapsKey } : {})
        }
      }
    },
    ios: {
      ...config.ios,
      config: {
        ...config.ios?.config,
        ...(iosMapsKey ? { googleMapsApiKey: iosMapsKey } : {})
      }
    },
    extra: {
      ...config.extra,
      googleMapsAndroidConfigured: Boolean(androidMapsKey),
      googleMapsIosConfigured: Boolean(iosMapsKey)
    }
  };
};
