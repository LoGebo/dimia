#!/bin/zsh
# Archiva, firma y sube la app a App Store Connect.
# Por qué a mano: el certificado lleva acentos («Jesús Martínez García») y la firma que rehace Xcode al subir
# guarda el nombre en otra normalización Unicode; Apple la rechaza. Aquí se firma con el requisito por Team ID.
# Requiere: la llave ~/.appstoreconnect/private_keys/AuthKey_9U335XAL5M.p8, el certificado «Apple Distribution»
# en el llavero y el perfil «Dimia App Store» (ver asc.py).
set -e
cd "$(dirname $0)/.."
T=$(mktemp -d); KEY=9U335XAL5M; ISS=8215244f-f2f8-417e-a21f-90d833097668
BUILD=${1:-$(date +%Y%m%d%H%M)}
xcodegen generate -q
xcodebuild -project Dimia.xcodeproj -scheme Dimia -configuration Release -destination 'generic/platform=iOS' \
  -archivePath $T/Dimia.xcarchive CURRENT_PROJECT_VERSION=$BUILD -allowProvisioningUpdates archive -quiet
A=$T/Dimia.xcarchive/Products/Applications/Dimia.app
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" $A/Info.plist
../voz/.venv/bin/python -c "
import base64,sys; sys.path.insert(0,'herramientas'); from asc import api
p=[x for x in api('GET','/v1/profiles?filter[name]=Dimia App Store')['data']][0]
open('$T/p.mobileprovision','wb').write(base64.b64decode(p['attributes']['profileContent']))"
cp $T/p.mobileprovision $A/embedded.mobileprovision
security cms -D -i $T/p.mobileprovision > $T/p.plist
/usr/libexec/PlistBuddy -x -c "Print :Entitlements" $T/p.plist > $T/ent.plist
/usr/libexec/PlistBuddy -c "Delete :keychain-access-groups" $T/ent.plist 2>/dev/null || true
rm -rf $A/_CodeSignature
codesign --force --timestamp --sign "Apple Distribution" --entitlements $T/ent.plist --requirements firma.req $A
codesign --verify --deep --strict $A
mkdir $T/Payload && cp -R $A $T/Payload/ && (cd $T && zip -qry Dimia.ipa Payload)
xcrun altool --upload-app -f $T/Dimia.ipa -t ios --apiKey $KEY --apiIssuer $ISS
echo "Build $BUILD subida."
