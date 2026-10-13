#!/usr/bin/env bash
# Builds the signed app bundle (.aab) that gets uploaded to Google Play.
#
# The upload key and its passwords live outside this repository and are never committed.
# By default they are read from ~/famsplit-keys/keystore.properties, which looks like:
#
#   storeFile=/Users/you/famsplit-keys/famsplit-upload.jks
#   storePassword=...
#   keyAlias=famsplit-upload
#   keyPassword=...
#
# Set FAMSPLIT_KEYSTORE_PROPERTIES to use a different file.

set -euo pipefail
cd "$(dirname "$0")/.."

PROPERTIES="${FAMSPLIT_KEYSTORE_PROPERTIES:-$HOME/famsplit-keys/keystore.properties}"
if [ ! -f "$PROPERTIES" ]; then
  echo "No signing details found at $PROPERTIES" >&2
  echo "Create the upload key and that file first; see the comment at the top of this script." >&2
  exit 1
fi

# Everything after the first "=" is the value, so passwords may contain "=" themselves.
property() { grep -E "^$1=" "$PROPERTIES" | head -n 1 | cut -d= -f2-; }
STORE_FILE="$(property storeFile)"
STORE_PASSWORD="$(property storePassword)"
KEY_ALIAS="$(property keyAlias)"
KEY_PASSWORD="$(property keyPassword)"

if [ -z "$STORE_FILE" ] || [ -z "$STORE_PASSWORD" ] || [ -z "$KEY_ALIAS" ] || [ -z "$KEY_PASSWORD" ]; then
  echo "$PROPERTIES must set storeFile, storePassword, keyAlias and keyPassword." >&2
  exit 1
fi
if [ ! -f "$STORE_FILE" ]; then
  echo "The upload key $STORE_FILE does not exist." >&2
  exit 1
fi

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 17)}"

# Regenerate the Android project so it always matches app.json.
npx expo prebuild --platform android --clean

# The signing details are handed to Gradle through the environment rather than the command line,
# so the passwords do not show up in the process list or in shell history.
(
  cd android
  env \
    "ORG_GRADLE_PROJECT_android.injected.signing.store.file=$STORE_FILE" \
    "ORG_GRADLE_PROJECT_android.injected.signing.store.password=$STORE_PASSWORD" \
    "ORG_GRADLE_PROJECT_android.injected.signing.key.alias=$KEY_ALIAS" \
    "ORG_GRADLE_PROJECT_android.injected.signing.key.password=$KEY_PASSWORD" \
    ./gradlew app:bundleRelease
)

VERSION="$(node -p "require('./app.json').expo.version")"
VERSION_CODE="$(node -p "require('./app.json').expo.android.versionCode")"
mkdir -p dist
OUTPUT="dist/famsplit-$VERSION-$VERSION_CODE.aab"
cp android/app/build/outputs/bundle/release/app-release.aab "$OUTPUT"

echo
echo "Signed with:"
keytool -printcert -jarfile "$OUTPUT" | grep -E "Owner:|SHA256:" | sed 's/^/  /'
echo
echo "Upload this file to Google Play: $OUTPUT"
echo "Before the next upload, raise expo.android.versionCode in app.json."
