#!/bin/sh
# Red de la máquina de tarea: todo cerrado salvo HTTP(S) hacia las IP públicas de DOMINIOS,
# resueltas una sola vez y fijadas en /etc/hosts; después no hay DNS (tampoco sirve para sacar datos).
# Cerrada desde la primera instrucción: mientras resuelve solo root tiene DNS, y los exec del
# agente no corren hasta que existe /run/red-cerrada (agentes/vms.py: COMO_TAREA).
# Sin firewall no hay máquina: si algo falla, el proceso sale y Fly la destruye (auto_destroy).
# ponytail: IP fijas al arrancar; un CDN que rota IP en 30 min falla cerrado. El proxy de
# salida de la celda (§3.6) trae comodines y registro por dominio.
set -eu

TTL="${TTL_S:-1800}"
[ "$TTL" -le 1800 ] 2>/dev/null || TTL=1800

# El socket del API de la máquina (/.fly/api) emite tokens OIDC de la app: solo para root.
chmod 700 /.fly 2>/dev/null || true

for ipt in iptables ip6tables; do
  $ipt -P INPUT DROP
  $ipt -P FORWARD DROP
  $ipt -P OUTPUT DROP
  $ipt -F
  $ipt -A INPUT -i lo -j ACCEPT
  $ipt -A OUTPUT -o lo -j ACCEPT
  $ipt -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  $ipt -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
done
# Un dominio del agente puede resolver a una IP interna (metadatos, 6PN, el enlace con el
# servidor): esas redes se niegan antes de cualquier ACCEPT.
for red in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16 224.0.0.0/3; do
  iptables -A OUTPUT -d "$red" -j DROP
done
for red in ::/127 ::ffff:0:0/96 64:ff9b::/96 fc00::/7 fe80::/10 ff00::/8; do
  ip6tables -A OUTPUT -d "$red" -j DROP
done

# DNS solo para root y solo mientras resuelve (el de Fly vive en fdaa::3, dentro de lo negado).
for ipt in iptables ip6tables; do
  for p in udp tcp; do $ipt -I OUTPUT 1 -p "$p" --dport 53 -m owner --uid-owner 0 -j ACCEPT; done
done
permitidas=""
for d in ${DOMINIOS:-}; do
  ips=$(getent ahosts "$d" | awk '{print $1}' | sort -u || true)
  [ -n "$ips" ] || { echo "arranque: $d no resolvió; queda sin acceso" >&2; continue; }
  for ip in $ips; do
    echo "$ip $d" >> /etc/hosts
    permitidas="$permitidas $ip"
  done
done
for ipt in iptables ip6tables; do
  for p in udp tcp; do $ipt -D OUTPUT -p "$p" --dport 53 -m owner --uid-owner 0 -j ACCEPT; done
done

for ip in $permitidas; do
  case "$ip" in
    *:*) ip6tables -A OUTPUT -d "$ip" -p tcp -m multiport --dports 80,443 -j ACCEPT ;;
    *)   iptables  -A OUTPUT -d "$ip" -p tcp -m multiport --dports 80,443 -j ACCEPT ;;
  esac
done

touch /run/red-cerrada
echo "arranque: red cerrada; ${permitidas:+salida a$permitidas}; vence en ${TTL}s"
exec sleep "$TTL"
