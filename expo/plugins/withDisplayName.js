const { AndroidConfig, withInfoPlist, withStringsXml } = require('expo/config-plugins');

/**
 * Sets the name shown under the home-screen icon, separately from `expo.name`.
 *
 * `expo.name` also becomes the Xcode project name, and Expo builds that from ASCII only:
 * a Japanese name sanitises to nothing and the project would be renamed to `app` on the
 * next clean prebuild. So `expo.name` stays `KintoreBoard` and only the label changes here.
 */
module.exports = function withDisplayName(config, { displayName }) {
  config = withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name', translatable: 'false' }, _: displayName }],
      c.modResults
    );
    return c;
  });
  config = withInfoPlist(config, (c) => {
    c.modResults.CFBundleDisplayName = displayName;
    return c;
  });
  return config;
};
