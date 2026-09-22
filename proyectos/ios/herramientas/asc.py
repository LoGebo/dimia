"""Cliente mínimo de la API de App Store Connect con la llave dimia-ios."""
import json, sys, time, urllib.request, jwt, pathlib
KID, ISS = "9U335XAL5M", "8215244f-f2f8-417e-a21f-90d833097668"
KEY = pathlib.Path.home().joinpath(".appstoreconnect/private_keys/AuthKey_9U335XAL5M.p8").read_text()
def token():
    return jwt.encode({"iss": ISS, "iat": int(time.time()), "exp": int(time.time()) + 1100, "aud": "appstoreconnect-v1"}, KEY, algorithm="ES256", headers={"kid": KID, "typ": "JWT"})
def api(metodo, ruta, cuerpo=None):
    r = urllib.request.Request("https://api.appstoreconnect.apple.com" + ruta, method=metodo, data=json.dumps(cuerpo).encode() if cuerpo else None,
                               headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r) as x: t = x.read(); return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        print(e.code, e.read().decode()[:800], file=sys.stderr); raise
if __name__ == "__main__":
    print(json.dumps(api(sys.argv[1], sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else None), indent=1)[:3000])
