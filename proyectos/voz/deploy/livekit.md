# LiveKit self-hosted (servidor + puente SIP)

LiveKit Cloud cuesta desde 50 USD/mes y te ahorra este documento entero. Vale
la pena self-hostear cuando el precio por minuto de Cloud pesa más que el
tiempo de operarlo, o cuando necesitas el media server físicamente cerca de
tus clientes.

Máquina: **2 vCPU, 4 GB**, IP pública fija, Debian 12 o Ubuntu 24.04. Un nodo
así aguanta cómodamente 50-80 llamadas SIP concurrentes; el cuello no es el
media server, es el worker del agente.

## Puertos

| Puerto | Protocolo | Para qué |
|---|---|---|
| 443 | TCP | `wss://` de señalización (Caddy termina TLS) |
| 7880 | TCP | LiveKit HTTP/WS interno, detrás de Caddy |
| 7881 | TCP | WebRTC sobre TCP (respaldo) |
| 50000-50200 | UDP | Media WebRTC entre agente y sala |
| 5060 | UDP y TCP | Señalización SIP desde Telnyx |
| 10000-20000 | UDP | RTP del puente SIP |

```bash
ufw allow 22/tcp
ufw allow 443/tcp
ufw allow 7881/tcp
ufw allow 50000:50200/udp
ufw allow 5060
ufw allow 10000:20000/udp
ufw enable
```

Restringe el 5060 a los rangos de señalización de Telnyx en cuanto los tengas
(ver `telnyx.md`). Un 5060 abierto al mundo recibe escaneos de fraude
telefónico en cuestión de horas.

## Instalación

```bash
mkdir -p /opt/livekit
scp deploy/livekit/* root@tu-vps:/opt/livekit/
```

Genera llaves y ponlas en `/opt/livekit/.env`:

```bash
docker run --rm livekit/livekit-server generate-keys
```

```bash
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VERSION_LIVEKIT=v1.9.1
VERSION_SIP=v1.4.0
```

Fija las versiones a lo que exista hoy en Docker Hub — `latest` es cómodo para
probar y una forma segura de que un martes cualquiera se te caiga la telefonía.

Ajusta el dominio en `livekit/Caddyfile` (`livekit.ejemplo.mx`) y apunta un
registro A a la IP del VPS antes de arrancar: Caddy pide el certificado en el
primer arranque y falla si el DNS no resuelve todavía.

```bash
cd /opt/livekit && docker compose up -d
docker compose logs -f livekit sip
```

## Verificación

```bash
curl -s https://livekit.tudominio.mx | head -1        # responde OK
lk sip inbound list --url wss://livekit.tudominio.mx  # tras crear la troncal
```

El servicio SIP debe imprimir `sip signaling listening on 0.0.0.0:5060`. Si no
aparece, casi siempre es que el contenedor no está en `network_mode: host` o
que otro proceso (asterisk, kamailio) ya tomó el puerto.

## Troncal entrante y regla de despacho

Se registran una vez, con el CLI `lk`:

```bash
export LIVEKIT_URL=wss://livekit.tudominio.mx
export LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...

lk sip inbound create deploy/livekit/troncal-entrante.json
lk sip dispatch create deploy/livekit/regla-despacho.json
```

En `troncal-entrante.json`:

- `numbers` — los números mexicanos en E.164 (`+52...`). Cada número que vendas
  se agrega aquí **y** en la columna `tenant.telefono_entrada`. Si los dos no
  coinciden, la llamada entra pero el agente no sabe de quién es y cuelga.
- `allowed_addresses` — los rangos SIP de Telnyx. Es la única defensa real
  contra que un tercero mande tráfico a tu puente.
- `media_encryption` — deshabilitado porque Telnyx entrega RTP sin cifrar en la
  troncal por IP. Si activas SRTP en Telnyx, cámbialo a
  `SIP_MEDIA_ENCRYPT_REQUIRE`.

La regla de despacho crea **una sala por llamada** (`llamada_<sufijo>`), que es
lo que corresponde a telefonía: dos llamantes nunca comparten sala.

## Cómo llega la llamada al agente

`agent/agent.py` registra el worker sin `agent_name`, así que LiveKit le asigna
automáticamente un trabajo por cada sala nueva. No hay que crear despachos
explícitos ni tokens: el worker se conecta a `LIVEKIT_URL` con la API key, y
LiveKit reparte cada sala al worker menos cargado.

De ahí sale el multi-tenant: el atributo `sip.trunkPhoneNumber` del
participante trae el número marcado, y `agenda.tenant_por_telefono()` resuelve
de qué negocio es. Ni una línea de código por cliente.

## Transferencias a humano

`transferir_a_humano` usa `TransferSIPParticipantRequest`, que emite un SIP
REFER hacia Telnyx. Requisitos: el número destino en E.164 con `tel:`, y que la
troncal de Telnyx tenga habilitado *SIP REFER* (viene activo en las troncales
por IP). Si Telnyx rechaza el REFER verás `403` en los logs del contenedor
`sip`; la alternativa es transferencia por *dial-out* con troncal saliente.
