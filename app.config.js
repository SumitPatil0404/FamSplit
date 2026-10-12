const fs = require('fs');

// app.json holds the settings. This only adds the Firebase config once the file exists, so the
// project still builds before push notifications have been set up.
module.exports = ({ config }) => {
  const googleServicesFile = './google-services.json';
  return fs.existsSync(googleServicesFile) ? { ...config, android: { ...config.android, googleServicesFile } } : config;
};
