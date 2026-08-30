# Telnyx: troncal SIP y números mexicanos

Telnyx entrega la llamada al puente SIP de LiveKit por IP, sin registro. El
flujo completo es:

```
quien llama  →  red mexicana  →  Telnyx  →  SIP/UDP 5060  →  livekit-sip
                                                                  ↓
                                                          sala "llamada_..."
                                                                  ↓
                                                        worker del agente
```

## 1. Comprar el número

Portal de Telnyx → *Numbers → Search & Buy*, país **Mexico**.

Lo que hay que saber antes de intentarlo:

- **Los números mexicanos requieren documentación regulatoria.** El IFT exige
  identificar al usuario final: identificación oficial (INE o pasaporte),
  comprobante de domicilio en México con menos de tres meses y, si el titular
  es empresa, acta constitutiva y RFC. Se sube en *Regulatory Requirements* al
  comprar. La aprobación tarda de un día a dos semanas: **no le prometas fecha
  de arranque a un cliente antes de tener el número aprobado**.
- El domicilio del comprobante debe corresponder a la **misma LADA** del número
  (55 para CDMX, 81 para Monterrey, 33 para Guadalajara). Comprar un 55 con
  comprobante de Monterrey se rechaza.
- Se venden números **fijos por LADA**. Los móviles (`+521...`) no se compran
  como DID; si el cliente quiere que le llamen a un celular, eso se resuelve
  con desvío, no con número.
- Costo aproximado: 1-3 USD/mes por número y ~0.005 USD/min entrante.

Mientras espera la aprobación regulatoria, prueba todo el flujo con un número
de Estados Unidos (se activa en minutos y cuesta 1 USD). La configuración es
idéntica.

## 2. SIP Connection

*Voice → SIP Connections → Create → **FQDN / IP Authentication***.

| Campo | Valor | Por qué |
|---|---|---|
| Connection Type | FQDN | Autenticación por IP, sin credenciales que rotar |
| FQDN / IP | En LiveKit Cloud: el **SIP URI del proyecto** (Settings → Project → SIP URI, p. ej. `33boqvydp3j.sip.livekit.cloud`), puerto 5060, registro A. En VPS propio: la IP pública, puerto 5060 | Ahí escucha `livekit-sip`. Ojo: `*.sip.livekit.cloud` resuelve por comodín; si pones el subdominio de la URL wss (`voiceai-xxxx.sip.livekit.cloud`) el DNS contesta igual pero LiveKit responde `404 No trunk found` |
| Transport | UDP | Lo que espera el puente por defecto |
| Anchorsite | Dallas, o *Latency Based* | No hay anchorsite en México; Dallas es el de menor RTT hacia el país |
| DTMF Type | RFC 2833 | Tonos fuera de banda; en audio se pierden con el códec |
| Encrypted Media | Off | Coincide con `SIP_MEDIA_ENCRYPT_DISABLE` en la troncal de LiveKit |
| Codecs | PCMU (G.711 µ-law) primero, luego OPUS | µ-law es lo que entrega la red mexicana; forzar OPUS agrega transcodificación y latencia |

Copia los **rangos de IP de señalización de Telnyx** desde su documentación
(*SIP signaling IP ranges*, cambian de vez en cuando) y ponlos en dos lugares:
`allowed_addresses` de `deploy/livekit/troncal-entrante.json` y la regla de ufw
del puerto 5060. Sin eso, cualquiera puede inyectar llamadas a tu puente.

## 3. Asignar el número a la conexión

*Numbers → My Numbers → el número → Voice → Connection* = la SIP Connection del
paso anterior. Sin esto, Telnyx acepta la llamada y la manda a ningún lado.

Verifica también que en *Number Settings* el **Caller ID Name** vaya vacío o
con el nombre del negocio: en México muchos operadores lo muestran.

## 4. Outbound Voice Profile (transferencias)

Se necesita sólo si usas `transferir_a_humano`. *Voice → Outbound Voice
Profiles → Create*, asocia la misma SIP Connection y permite el destino
**Mexico**. Pon un **límite de gasto diario** (10-20 USD): es el freno contra
un bug o un fraude que se marque solo a destinos caros.

## 4b. Troncal de salida (campañas por llamada)

Las campañas de recuperación marcan desde el agente. Necesitan:

1. En Telnyx, el mismo *Outbound Voice Profile* del paso 4, con **México**
   permitido y límite de gasto diario. Una campaña mal armada puede marcar
   a cientos de números: el límite es el freno.
2. En LiveKit, un troncal SIP de salida apuntando a Telnyx:

   ```bash
   lk sip outbound create --name telnyx-salida --address sip.telnyx.com \
     --numbers +528112345678 --auth-user <usuario> --auth-pass <clave>
   ```

   Devuelve un `ST_xxxx`. Va en el entorno del **despachador** (no del
   worker) como `LIVEKIT_SIP_TRUNK_SALIENTE`, junto con `TELEFONO_SALIDA`
   (el número que verá la persona). Sin esa variable, las filas de llamada
   quedan en la cola marcadas como fallidas con el motivo a la vista.
3. El worker del agente no cambia: recibe la sala como cualquier otra, lee
   `saliente` en los metadatos y abre con el guion en vez del saludo.

Horario: el motor solo encola dentro de la ventana que se fijó en la campaña,
en hora local del negocio. Nadie recibe una llamada del agente a las once de
la noche.

## 5. Registrar el número en el sistema

Dos lugares, siempre los dos:

```sql
update tenant set telefono_entrada = '+528112345678' where nombre = 'Consultorio Ruiz';
```

```bash
lk sip inbound update ST_xxxx --numbers +528112345678,+525587654321
```

`agent/agent.py` lee `sip.trunkPhoneNumber` del participante y busca ese texto
exacto en `tenant.telefono_entrada`. **Siempre E.164, siempre con `+52`**, sin
espacios, sin `01`, sin paréntesis. El 90 % de los "no contesta el agente" son
un número guardado con otro formato.

**El troncal de LiveKit lleva el número dos veces: con `+` y sin `+`.** Telnyx
manda el INVITE a `sip:12487479738@...` aunque la conexión esté en E.164; si el
troncal solo tiene `+12487479738`, LiveKit contesta `404 No trunk found` y el
operador de quien llama reproduce "el número no existe". El worker normaliza
los dos al mismo `+1...`, así que la base solo guarda la forma con `+`.

```bash
lk sip inbound update --id ST_xxxx --numbers +528112345678 --numbers 528112345678
```

## 6. Prueba de humo

```bash
docker compose -f /opt/livekit/docker-compose.yml logs -f sip
```

Marca al número desde un celular. En el log debes ver, en orden: `INVITE`
recibido, sala creada, participante SIP unido. En el worker, `job received` y
el saludo. Si ves el INVITE pero la sala nunca se crea, el número no está en la
troncal. Si la sala se crea y nadie contesta, no hay worker registrado.

## Problemas frecuentes

| Síntoma | Causa casi siempre |
|---|---|
| `403 Forbidden` en el INVITE | IP de Telnyx fuera de `allowed_addresses` |
| Suena y cuelga a los 2 s | Número no está en la troncal, o `telefono_entrada` no coincide |
| Audio de un solo lado | Rango RTP 10000-20000/udp cerrado, o `use_external_ip: false` |
| Voz entrecortada | Transcodificación OPUS↔µ-law, o CPU del worker saturada |
| Corta al segundo o tercer intercambio | El agente no es: revisa el `empty_timeout` de la sala |
| El REFER de transferencia falla | Falta Outbound Voice Profile con México permitido |

## Aviso legal (México)

Antes de facturar: la LFPDPPP obliga a avisar que la llamada es atendida por un
asistente virtual y a obtener consentimiento si se graba. Va en el saludo, en
`app/prompt.py`, no aquí — pero es requisito de producción, no un pendiente
cosmético.
