const nodo = (id) => document.getElementById(id);

const estado = {
  modo: null,
  negocios: [],
  elegido: null,
  socket: null,
  reconociendo: false,
  hablando: false,
  latencias: [],
  codigosVistos: new Set(),
  medidor: null,
};

const RECONOCEDOR = window.SpeechRecognition || window.webkitSpeechRecognition;

async function arrancar() {
  const respuesta = await fetch("/api/estado");
  const datos = await respuesta.json();
  estado.modo = datos.modo;
  estado.negocios = datos.negocios;
  pintarModo();
  pintarNegocios();
  abrirSocket();
}

function pintarModo() {
  const etiqueta = nodo("modo-etiqueta");
  etiqueta.textContent = estado.modo.etiqueta;
  etiqueta.classList.toggle("real", estado.modo.es_real);
  let detalle = estado.modo.explicacion;
  if (!estado.modo.es_real && estado.modo.faltantes.length) {
    detalle += ` · falta ${estado.modo.faltantes.join(", ")}`;
  }
  nodo("modo-detalle").textContent = detalle;
}

function pintarNegocios() {
  const contenedor = nodo("negocios");
  contenedor.innerHTML = "";
  for (const negocio of estado.negocios) {
    const boton = document.createElement("button");
    boton.className = "negocio";
    boton.innerHTML = `<strong>${negocio.titulo}</strong><span>${negocio.gancho}</span>`;
    boton.onclick = () => elegir(negocio, boton);
    contenedor.append(boton);
  }
}

function elegir(negocio, boton) {
  estado.elegido = negocio;
  estado.latencias = [];
  estado.codigosVistos = new Set();
  document.querySelectorAll(".negocio").forEach((b) => b.classList.remove("activo"));
  boton.classList.add("activo");

  nodo("ficha").hidden = false;
  nodo("ficha-nombre").textContent = negocio.nombre;
  nodo("ficha-servicios").innerHTML = negocio.servicios
    .map((s) => {
      const precio = s.precio === null ? "sin precio" : `$${s.precio.toFixed(0)}`;
      return `<li><b>${s.nombre}</b> · ${s.duracion_min} min · ${precio}</li>`;
    })
    .join("");

  nodo("transcripcion").innerHTML = "";
  nodo("herramientas").innerHTML = "";
  nodo("barras").innerHTML = "";
  nodo("lat-ultima").textContent = "—";
  nodo("lat-mediana").textContent = "—";
  nodo("lat-turnos").textContent = "0";
  nodo("micro").disabled = false;
  nodo("micro-texto").textContent = RECONOCEDOR ? "Tomar la llamada" : "Iniciar (teclado)";
  nodo("entrada").disabled = false;
  nodo("enviar").disabled = false;
  nodo("micro-pie").textContent = RECONOCEDOR
    ? "El audio no sale de tu maquina. Habla normal, con frases cortas."
    : "Este navegador no reconoce voz: usa el campo de texto de abajo.";

  enviar({ tipo: "iniciar", negocio: negocio.clave });
}

function abrirSocket() {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocolo}://${location.host}/ws`);
  socket.onmessage = (mensaje) => recibir(JSON.parse(mensaje.data));
  socket.onclose = () => setTimeout(abrirSocket, 1200);
  estado.socket = socket;
}

function enviar(mensaje) {
  if (estado.socket?.readyState === WebSocket.OPEN) {
    estado.socket.send(JSON.stringify(mensaje));
  }
}

function recibir(evento) {
  switch (evento.tipo) {
    case "agente":
      agregarTurno("agente", estado.elegido?.nombre ?? "agente", evento.texto, evento.ms);
      decir(evento.texto);
      break;
    case "cliente":
      agregarTurno("cliente", "prospecto", evento.texto);
      break;
    case "herramienta":
      agregarHerramienta(evento);
      break;
    case "turno":
      registrarLatencia(evento.ms);
      break;
    case "agenda":
      pintarAgenda(evento.reservas);
      break;
    case "escalamiento":
      agregarTurno("sistema", "escala", `transferido a una persona · ${evento.motivo}`);
      break;
    case "error":
      agregarTurno("sistema", "error", evento.detalle);
      break;
  }
}

function agregarTurno(clase, quien, texto, ms) {
  if (!texto) return;
  const contenedor = nodo("transcripcion");
  contenedor.querySelector(".vacio")?.remove();
  const fila = document.createElement("div");
  fila.className = `turno ${clase}`;
  const marca = ms !== undefined && ms > 0 ? `<span class="turno-ms">${Math.round(ms)} ms</span>` : "";
  fila.innerHTML = `<div class="turno-quien">${quien}</div><div class="turno-texto">${escapar(texto)}${marca}</div>`;
  contenedor.append(fila);
  contenedor.scrollTop = contenedor.scrollHeight;
}

function agregarHerramienta(evento) {
  const contenedor = nodo("herramientas");
  contenedor.querySelector(".vacio")?.remove();
  const escribe = evento.nombre === "reservar" || evento.nombre === "cancelar";
  const humano = evento.nombre === "transferir_a_humano";
  const caja = document.createElement("div");
  caja.className = `llamada-herramienta ${escribe ? "escritura" : ""} ${humano ? "humano" : ""}`;
  const argumentos = Object.entries(evento.argumentos)
    .map(([clave, valor]) => `${clave}=${String(valor).slice(0, 30)}`)
    .join("  ");
  caja.innerHTML =
    `<div class="llamada-cabeza"><span class="llamada-nombre">${evento.nombre}()</span>` +
    `<span class="llamada-ms">${evento.ms} ms</span></div>` +
    `<div class="llamada-args">${escapar(argumentos)}</div>`;
  contenedor.prepend(caja);
}

function registrarLatencia(ms) {
  estado.latencias.push(ms);
  const ordenadas = [...estado.latencias].sort((a, b) => a - b);
  const mediana = ordenadas[Math.floor(ordenadas.length / 2)];
  nodo("lat-ultima").textContent = `${Math.round(ms)} ms`;
  nodo("lat-mediana").textContent = `${Math.round(mediana)} ms`;
  nodo("lat-turnos").textContent = String(estado.latencias.length);

  const tope = Math.max(...estado.latencias, 1);
  nodo("barras").innerHTML = estado.latencias
    .slice(-28)
    .map((v) => `<div class="barra" style="height:${Math.max(4, (v / tope) * 100)}%"></div>`)
    .join("");
}

function pintarAgenda(reservas) {
  const contenedor = nodo("agenda");
  contenedor.innerHTML = "";
  if (!reservas.length) {
    contenedor.innerHTML = '<p class="vacio">Sin reservas confirmadas a futuro.</p>';
    return;
  }
  for (const reserva of reservas) {
    const cuando = new Date(reserva.inicio).toLocaleString("es-MX", {
      weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
    const fila = document.createElement("div");
    const nueva = !estado.codigosVistos.has(reserva.codigo);
    fila.className = `reserva ${nueva && estado.codigosVistos.size ? "nueva" : ""}`;
    estado.codigosVistos.add(reserva.codigo);
    fila.innerHTML =
      `<div class="reserva-codigo">${reserva.codigo}</div>` +
      `<div><div class="reserva-cuando">${cuando}</div>` +
      `<div class="reserva-quien">${escapar(reserva.cliente_nombre)} · ${escapar(reserva.servicio)} · ${escapar(reserva.recurso)}</div>` +
      (reserva.notas ? `<div class="reserva-notas">${escapar(reserva.notas)}</div>` : "") +
      `</div>`;
    contenedor.append(fila);
  }
}

function escapar(texto) {
  const caja = document.createElement("div");
  caja.textContent = texto ?? "";
  return caja.innerHTML;
}

function decir(texto) {
  if (!window.speechSynthesis || !texto) return;
  estado.hablando = true;
  nodo("senal").className = "senal hablando";
  const frase = new SpeechSynthesisUtterance(texto);
  frase.lang = "es-MX";
  frase.rate = 1.08;
  const voz = speechSynthesis.getVoices().find((v) => v.lang.startsWith("es"));
  if (voz) frase.voice = voz;
  frase.onend = () => {
    estado.hablando = false;
    nodo("senal").className = estado.reconociendo ? "senal viva" : "senal";
  };
  speechSynthesis.speak(frase);
}

let reconocedor = null;

function alternarMicrofono() {
  if (estado.reconociendo) return detenerMicrofono();
  if (!RECONOCEDOR) {
    nodo("entrada").focus();
    return;
  }
  reconocedor = new RECONOCEDOR();
  reconocedor.lang = "es-MX";
  reconocedor.continuous = true;
  reconocedor.interimResults = false;
  reconocedor.onresult = (evento) => {
    if (estado.hablando) return;
    const dicho = evento.results[evento.results.length - 1][0].transcript.trim();
    if (dicho) enviar({ tipo: "decir", texto: dicho });
  };
  reconocedor.onend = () => estado.reconociendo && reconocedor.start();
  reconocedor.start();
  estado.reconociendo = true;
  nodo("micro").classList.add("activo");
  nodo("micro-texto").textContent = "Colgar";
  nodo("senal").className = "senal viva";
  medirNivel();
}

function detenerMicrofono() {
  estado.reconociendo = false;
  reconocedor?.stop();
  estado.medidor?.detener();
  nodo("micro").classList.remove("activo");
  nodo("micro-texto").textContent = "Tomar la llamada";
  nodo("senal").className = "senal";
  nodo("micro-anillo").style.boxShadow = "0 0 0 0 rgba(224,163,63,0.35)";
  enviar({ tipo: "colgar" });
}

async function medirNivel() {
  try {
    const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    const contexto = new AudioContext();
    const analizador = contexto.createAnalyser();
    analizador.fftSize = 512;
    contexto.createMediaStreamSource(flujo).connect(analizador);
    const muestras = new Uint8Array(analizador.frequencyBinCount);
    let vivo = true;

    const pintar = () => {
      if (!vivo) return;
      analizador.getByteTimeDomainData(muestras);
      let suma = 0;
      for (const m of muestras) suma += (m - 128) ** 2;
      const nivel = Math.min(1, Math.sqrt(suma / muestras.length) / 24);
      nodo("micro-anillo").style.boxShadow =
        `0 0 0 ${(nivel * 14).toFixed(1)}px rgba(224,163,63,${(0.06 + nivel * 0.3).toFixed(2)})`;
      requestAnimationFrame(pintar);
    };
    pintar();

    estado.medidor = {
      detener() {
        vivo = false;
        flujo.getTracks().forEach((t) => t.stop());
        contexto.close();
      },
    };
  } catch {
    nodo("micro-pie").textContent = "Sin acceso al microfono: usa el campo de texto.";
  }
}

nodo("micro").onclick = alternarMicrofono;

nodo("teclado").onsubmit = (evento) => {
  evento.preventDefault();
  const campo = nodo("entrada");
  if (campo.value.trim()) enviar({ tipo: "decir", texto: campo.value.trim() });
  campo.value = "";
};

nodo("ver-prompt").onclick = async () => {
  const respuesta = await fetch(`/api/prompt/${estado.elegido.clave}`);
  nodo("visor-texto").textContent = (await respuesta.json()).prompt;
  nodo("visor").hidden = false;
};
nodo("cerrar-visor").onclick = () => (nodo("visor").hidden = true);

nodo("limpiar").onclick = async () => {
  if (!estado.elegido) return;
  await fetch(`/api/limpiar/${estado.elegido.clave}`, { method: "POST" });
  estado.codigosVistos = new Set();
  enviar({ tipo: "agenda" });
};

arrancar();
