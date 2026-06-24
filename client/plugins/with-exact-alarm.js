const { withAndroidManifest } = require('expo/config-plugins');

// Adds the exact-alarm permissions to the Android manifest so expo-notifications can schedule
// an EXACT alarm for a "remind me" nudge (a DATE-trigger local notification). Without them,
// Android 12+ downgrades to an inexact alarm, which Samsung One UI's Doze throttles so hard the
// nudge never fires. USE_EXACT_ALARM is auto-granted (no settings prompt for the user, the calm
// path); SCHEDULE_EXACT_ALARM is its companion/fallback. app.json's `android.permissions` is NOT
// used because Expo does not reliably apply it for these special-access permissions, hence this
// explicit manifest plugin.
const PERMISSIONS = ['android.permission.USE_EXACT_ALARM', 'android.permission.SCHEDULE_EXACT_ALARM'];

module.exports = function withExactAlarm(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of PERMISSIONS) {
      const already = manifest['uses-permission'].some((p) => p.$ && p.$['android:name'] === name);
      if (!already) manifest['uses-permission'].push({ $: { 'android:name': name } });
    }
    return cfg;
  });
};
