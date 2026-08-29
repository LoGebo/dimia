# WhatsApp de Meta: cómo sacar las credenciales en una tarde

Lo que el motor necesita (van al `.env` del canal de WhatsApp, nunca al repo):

| Variable | Qué es | Dónde sale |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Token de sistema permanente | Paso 5 |
| `WHATSAPP_PHONE_NUMBER_ID` | Id del número de WhatsApp | Paso 4 |
| `WHATSAPP_APP_SECRET` | Secreto de la app, firma los webhooks | Paso 2 |
| `WHATSAPP_VERIFY_TOKEN` | Palabra que tú inventas para verificar el webhook | Paso 6 |

Necesitas: una cuenta de Facebook personal (solo para administrar), un número de
teléfono que **no** esté en WhatsApp normal ni en WhatsApp Business app (o darlo de baja
ahí primero), y los datos fiscales del negocio para la verificación.

## 1. Cuenta de Meta Business y portafolio
1. Entra a https://business.facebook.com con tu Facebook y crea un **portafolio
   empresarial** a nombre de Dimia (o del negocio del cliente, si el número es suyo).
2. Configuración del negocio → Información de la empresa: llena razón social, dirección
   y sitio web. Sin esto no pasa la verificación.
3. Seguridad → activa la verificación en dos pasos de tu cuenta.

## 2. App de desarrollador
1. Ve a https://developers.facebook.com/apps → **Crear app** → tipo **Empresa** →
   nombre «Dimia Línea» → asócialo al portafolio del paso 1.
2. En el tablero de la app, agrega el producto **WhatsApp**.
3. Configuración de la app → **Básica**: copia el **Identificador de la app** y el
   **Clave secreta de la app** → `WHATSAPP_APP_SECRET`.

## 3. Número de teléfono
1. Producto WhatsApp → **Configuración de la API** → «Agregar número de teléfono».
2. Nombre para mostrar (el que verán los clientes), categoría, descripción.
3. Verifica el número por SMS o llamada. Si el número está en la app de WhatsApp,
   primero bórralo de ahí (Ajustes → Cuenta → Eliminar cuenta) y espera unos minutos.
4. Meta te da un número de prueba mientras tanto: sirve para probar con hasta 5
   números que registres a mano.

## 4. Identificadores
En **Configuración de la API** aparecen:
- **Identificador del número de teléfono** → `WHATSAPP_PHONE_NUMBER_ID`.
- Identificador de la cuenta de WhatsApp Business (WABA); guárdalo, lo piden en soporte.

## 5. Token permanente (no el temporal de 24 h)
1. https://business.facebook.com → Configuración → **Usuarios** → **Usuarios del
   sistema** → Agregar → nombre «dimia-motor», rol **Administrador**.
2. En ese usuario → **Agregar activos** → Apps → tu app → activa «Administrar app».
3. También → Cuentas de WhatsApp → tu WABA → control total.
4. **Generar token nuevo** → elige la app → caducidad **Nunca** → permisos
   `whatsapp_business_messaging` y `whatsapp_business_management` → Generar.
5. Copia el token una sola vez → `WHATSAPP_ACCESS_TOKEN`.

## 6. Webhook
1. Levanta el canal (`make whatsapp` en local con un túnel, o en Fly) para que
   `https://TU-DOMINIO/webhook/whatsapp` responda.
2. Inventa una palabra larga → `WHATSAPP_VERIFY_TOKEN` en el `.env` y reinicia.
3. App → WhatsApp → **Configuración** → Webhook → **Editar**: URL de devolución
   `https://TU-DOMINIO/webhook/whatsapp`, token de verificación la misma palabra →
   Verificar y guardar.
4. En **Campos del webhook** suscribe `messages`.

## 7. Plantillas (para escribir primero)
WhatsApp solo deja iniciar conversación con una **plantilla aprobada**; contestar dentro de
24 h de un mensaje del cliente es libre. Crea en WhatsApp Manager → Plantillas, categoría
**Utilidad**, en español (MX), estas cuatro (nombres tal cual, el motor las usa):
- `confirmacion_cita`: «Hola {{1}}, tu cita en {{2}} quedó el {{3}} a las {{4}}. Código {{5}}. Responde CANCELAR si no podrás.»
- `recordatorio_cita`: «Hola {{1}}, te recordamos tu cita mañana {{2}} a las {{3}} en {{4}}.»
- `pago_pendiente`: «Hola {{1}}, tienes un pago pendiente de ${{2}} en {{3}}. Paga aquí: {{4}}»
- `resena`: «Hola {{1}}, gracias por venir a {{2}}. Del 1 al 5, ¿cómo te fue? Responde con el número.»
La aprobación tarda de minutos a 24 h.

## 8. Verificación del negocio y salir del modo prueba
- Centro de seguridad → **Verificación del negocio**: sube acta constitutiva o CSF,
  comprobante de domicilio y sitio web. Tarda 1 a 5 días.
- Hasta que se apruebe, el número solo escribe a 250 contactos únicos por día; después sube
  solo a 1 000, 10 000 y 100 000 según la calidad.
- Cambia la app de **Desarrollo** a **Producción** (interruptor arriba del tablero).

## 9. Prueba
1. Manda «hola» desde tu celular al número.
2. En la bitácora del canal debe aparecer el webhook y la respuesta del agente.
3. En el panel, Mensajes → Conversaciones muestra el hilo con canal WhatsApp.

## Costos (para contemplar en los planes)
Meta cobra por conversación de 24 h iniciada por el negocio (utilidad ~USD 0.04 en MX,
marketing ~USD 0.04–0.05 `[ dato por confirmar en la tabla vigente ]`); las que inicia el
cliente son gratis dentro de las primeras 1 000 al mes. Los mensajes de servicio dentro de
la ventana de 24 h no cuestan.
