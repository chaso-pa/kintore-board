const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SERVICE = 'expo.modules.location.services.LocationTaskService';

/**
 * Removes expo-location's background location service from the merged manifest.
 *
 * expo-location declares it unconditionally in its own manifest, with
 * `foregroundServiceType="location"`, and its config plugin no longer has an option to drop it.
 * This app only reads location in the foreground (the nearby-gyms search) and never starts
 * background location updates, so the service is dead weight — but a foreground service type in
 * the manifest is what Google Play keys its foreground-service declaration off, and declaring
 * one the app does not use is a review question with no good answer.
 *
 * If background location is ever added, delete this plugin.
 */
module.exports = function withoutLocationTaskService(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    manifest.manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    app.service = (app.service ?? []).filter((s) => s.$['android:name'] !== SERVICE);
    app.service.push({ $: { 'android:name': SERVICE, 'tools:node': 'remove' } });
    return config;
  });
};
