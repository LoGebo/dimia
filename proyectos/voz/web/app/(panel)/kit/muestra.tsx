"use client";

import { useState, type ReactNode } from "react";
import {
  ChipHerramienta,
  ChipsHerramienta,
  CifraAnimada,
  Dialogo,
  EsqueletoCifra,
  EsqueletoTabla,
  EsqueletoTarjeta,
  FilaTarea,
  FilasTarea,
  MarcaExito,
  PaletaComandos,
  PanelPestana,
  Pensando,
  Pestanas,
  ProveedorAvisos,
  TablaRegistros,
  TarjetaAprobacion,
  TarjetaInsight,
  TextoFluye,
  useAtajoPaleta,
  useAvisos,
  type Columna,
  type Filtro,
  type Insight,
} from "@/components/kit";

type Cita = {
  codigo: string;
  cliente: string;
  telefono: string;
  servicio: string;
  hora: string;
  estado: "confirmada" | "pendiente" | "cancelada";
  monto: number;
};

const CITAS: Cita[] = [
  { codigo: "B68E", cliente: "Ana Torres", telefono: "55 1234 5678", servicio: "Limpieza dental", hora: "09:30", estado: "confirmada", monto: 850 },
  { codigo: "C21A", cliente: "Luis Hernández", telefono: "55 8765 4321", servicio: "Valoración", hora: "10:00", estado: "pendiente", monto: 0 },
  { codigo: "D904", cliente: "María Pérez", telefono: "55 5555 0101", servicio: "Ortodoncia", hora: "11:15", estado: "confirmada", monto: 2400 },
  { codigo: "E17B", cliente: "Jorge Ramírez", telefono: "55 4444 0202", servicio: "Extracción", hora: "12:00", estado: "cancelada", monto: 1200 },
  { codigo: "F3C0", cliente: "Sofía Castillo", telefono: "55 3333 0303", servicio: "Blanqueamiento", hora: "13:30", estado: "confirmada", monto: 3100 },
  { codigo: "G55D", cliente: "Diego Flores", telefono: "55 2222 0404", servicio: "Limpieza dental", hora: "16:00", estado: "pendiente", monto: 850 },
];

const ESTADO: Record<Cita["estado"], { texto: string; clase: string }> = {
  confirmada: { texto: "Confirmada", clase: "bg-bueno" },
  pendiente: { texto: "Pendiente", clase: "bg-alerta" },
  cancelada: { texto: "Cancelada", clase: "bg-critico" },
};

const pesos = (n: number) => (n === 0 ? "—" : `$${n.toLocaleString("es-MX")}`);

const COLUMNAS: Columna<Cita>[] = [
  {
    clave: "codigo",
    titulo: "Código",
    ancho: "80px",
    valor: (c) => c.codigo,
    render: (c) => <span className="numeros font-mono text-[12px] text-tinta-2">{c.codigo}</span>,
  },
  { clave: "cliente", titulo: "Cliente", valor: (c) => c.cliente, render: (c) => <span className="font-medium">{c.cliente}</span> },
  {
    clave: "telefono",
    titulo: "Teléfono",
    valor: (c) => c.telefono,
    render: (c) => <span className="numeros font-mono text-[12px] text-tinta-2">{c.telefono}</span>,
  },
  { clave: "servicio", titulo: "Servicio", valor: (c) => c.servicio },
  { clave: "hora", titulo: "Hora", numerica: true, ancho: "72px", valor: (c) => c.hora },
  {
    clave: "estado",
    titulo: "Estado",
    valor: (c) => c.estado,
    render: (c) => (
      <span className="inline-flex items-center gap-1.5 text-[12px] text-tinta-2">
        <i aria-hidden="true" className={`h-1.5 w-1.5 ${ESTADO[c.estado].clase}`} />
        {ESTADO[c.estado].texto}
      </span>
    ),
  },
  { clave: "monto", titulo: "Cobro", numerica: true, ancho: "90px", valor: (c) => c.monto, render: (c) => pesos(c.monto) },
];

const FILTROS: Filtro<Cita>[] = [
  { clave: "confirmada", nombre: "Confirmadas", tono: "bueno", pasa: (c) => c.estado === "confirmada" },
  { clave: "pendiente", nombre: "Pendientes", tono: "alerta", pasa: (c) => c.estado === "pendiente" },
  { clave: "cancelada", nombre: "Canceladas", tono: "critico", pasa: (c) => c.estado === "cancelada" },
  { clave: "sin-cobro", nombre: "Sin cobro", pasa: (c) => c.monto === 0 },
];

const INSIGHTS: Insight[] = [
  {
    id: "ausentes",
    titulo: "Clientes que no han vuelto en 90 días",
    cifra: "3",
    unidad: "clientes",
    variacion: { texto: "+2 vs. mes anterior", tono: "critico" },
    serie: [0, 0, 1, 1, 1, 2, 2, 3],
    nota: "Ana, Jorge y Sofía venían cada 6 semanas. Un recordatorio por WhatsApp suele traerlos de vuelta.",
    accion: { texto: "Recuperarlos", href: "#" },
  },
  {
    id: "no-show",
    titulo: "Citas que no llegaron esta semana",
    cifra: "2",
    unidad: "de 31",
    variacion: { texto: "−1 vs. semana pasada", tono: "bueno" },
    serie: [4, 3, 5, 2, 3, 2, 1, 2],
    nota: "Las dos eran citas de las 9:00 sin recordatorio confirmado.",
    accion: { texto: "Activar recordatorio 24 h" },
  },
  {
    id: "cobrado",
    titulo: "Cobrado en el mes",
    cifra: "$48,350",
    variacion: { texto: "+12 % vs. julio", tono: "bueno" },
    serie: [31, 34, 38, 36, 41, 43, 45, 48],
    nota: "El blanqueamiento aporta la mitad del crecimiento.",
    accion: { texto: "Ver cobros", href: "#" },
  },
];

const COMANDOS = (avisar: (t: string) => void) => [
  {
    nombre: "Ir a",
    comandos: [
      { id: "hoy", texto: "Hoy", atajo: "G H", onSelect: () => avisar("Hoy") },
      { id: "mensajes", texto: "Mensajes", detalle: "3 sin leer", atajo: "G M", onSelect: () => avisar("Mensajes") },
      { id: "clientes", texto: "Clientes", atajo: "G C", onSelect: () => avisar("Clientes") },
      { id: "dinero", texto: "Dinero", atajo: "G D", onSelect: () => avisar("Dinero") },
      { id: "ajustes", texto: "Ajustes", atajo: "G A", onSelect: () => avisar("Ajustes") },
    ],
  },
  {
    nombre: "Acciones",
    comandos: [
      { id: "nueva", texto: "Nueva cita", atajo: "N", onSelect: () => avisar("Nueva cita") },
      { id: "cobrar", texto: "Registrar cobro", onSelect: () => avisar("Registrar cobro") },
      { id: "pausar", texto: "Pausar la línea", detalle: "deja de contestar", onSelect: () => avisar("Pausar la línea") },
    ],
  },
  {
    nombre: "Citas",
    comandos: CITAS.map((c) => ({
      id: c.codigo,
      texto: `${c.cliente}`,
      detalle: `${c.codigo} · ${c.hora} · ${c.servicio}`,
      claves: c.telefono,
      onSelect: () => avisar(`Cita ${c.codigo}`),
    })),
  },
];

function Seccion({ n, titulo, fuente, children, ancho = "" }: { n: string; titulo: string; fuente: string; children: ReactNode; ancho?: string }) {
  return (
    <section className={`border-t border-linea pt-4 ${ancho}`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="numeros font-mono text-[10.5px] tracking-[0.24em] whitespace-nowrap text-laton uppercase">{n}</span>
        <h2 className="text-[13.5px] font-semibold tracking-tight whitespace-nowrap text-tinta">{titulo}</h2>
        <span className="text-[11.5px] text-tinta-3">{fuente}</span>
      </div>
      {children}
    </section>
  );
}

export function Muestra() {
  return (
    <ProveedorAvisos>
      <Cuerpo />
    </ProveedorAvisos>
  );
}

function Cuerpo() {
  const { avisar } = useAvisos();
  const paleta = useAtajoPaleta();
  const [dialogo, setDialogo] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [pestana, setPestana] = useState("citas");
  const [cifras, setCifras] = useState({ llamadas: 128, citas: 41, cobrado: 48350, sin: 3 });
  const [fluye, setFluye] = useState(0);

  const grupos = COMANDOS((t) => avisar({ titulo: t, detalle: "Comando ejecutado desde la paleta", tono: "neutro" }));

  return (
    <div className="space-y-6 px-5 py-5">
      <Seccion n="01" titulo="Tabla de registros" fuente="beautifului.dev · Records Table + Filter Table">
        <TablaRegistros
          columnas={COLUMNAS}
          filas={CITAS}
          clave={(c) => c.codigo}
          filtros={FILTROS}
          ordenInicial={{ clave: "hora", dir: "asc" }}
          alClic={(c) => avisar({ titulo: `Cita ${c.codigo}`, detalle: `${c.cliente} · ${c.hora}`, tono: "neutro" })}
          vacio={{ titulo: "No hay citas hoy", detalle: "Cuando el agente agende una, aparece aquí." }}
        />
        <div className="mt-3">
          <TablaRegistros
            columnas={COLUMNAS}
            filas={[]}
            clave={(c) => c.codigo}
            vacio={{
              titulo: "No hay citas hoy",
              detalle: "Cuando el agente agende una, aparece aquí. También puede crearla a mano.",
              accion: (
                <button type="button" className="h-8 bg-acento px-3 text-[12.5px] font-semibold text-acento-tinta">
                  Nueva cita
                </button>
              ),
            }}
          />
        </div>
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion n="02" titulo="Tarjeta de insight" fuente="beautifului.dev · Insight Cards">
          <TarjetaInsight insights={INSIGHTS} />
        </Seccion>
        <Seccion n="03" titulo="Tarjeta de aprobación" fuente="beautifului.dev · Approval Card">
          <TarjetaAprobacion
            titulo="Reagendar a Luis Hernández"
            detalle="Llamó a las 9:42. Pide mover su valoración de hoy a mañana; hay lugar a las 10:00."
            hora="09:43"
            propuesta={
              <span>
                Valoración · <span className="numeros font-mono">mié 27, 10:00</span> → <span className="numeros font-mono">jue 28, 10:00</span>
              </span>
            }
            onAprobar={() => avisar({ titulo: "Cita reagendada", detalle: "Se le confirmó por WhatsApp.", tono: "bueno" })}
            onCambiar={(i) => avisar({ titulo: "Cambio enviado", detalle: i, tono: "bueno" })}
            onRechazar={() => avisar({ titulo: "Propuesta rechazada", tono: "critico" })}
          />
        </Seccion>
        <Seccion n="04 · 05" titulo="Chips y filas de tarea" fuente="beautifului.dev · Tool Chips + Task Rows">
          <ChipsHerramienta total={4}>
            <ChipHerramienta estado="hecho" duracion={340}>
              consultó disponibilidad
            </ChipHerramienta>
            <ChipHerramienta estado="hecho" dato="B68E" duracion={1200}>
              reservó
            </ChipHerramienta>
            <ChipHerramienta estado="en-curso">envía confirmación</ChipHerramienta>
            <ChipHerramienta estado="fallo" dato="55 1234 5678">
              marcó al cliente
            </ChipHerramienta>
          </ChipsHerramienta>
          <div className="mt-3">
            <FilasTarea rotulo="Recordatorios de mañana">
              <FilaTarea
                estado="hecho"
                titulo="Confirmó por WhatsApp"
                dato="12 de 12"
                pasos={[
                  { texto: "Enviados", dato: "12" },
                  { texto: "Respondieron", dato: "9" },
                ]}
              />
              <FilaTarea estado="en-curso" titulo="Llama a quien no respondió" dato="1 de 3" />
              <FilaTarea estado="fallo" titulo="Cobro anticipado a D904" dato="tarjeta rechazada" pasos={[{ texto: "Intentos", dato: "2" }]} />
              <FilaTarea estado="pendiente" titulo="Resumen del día para el dueño" dato="18:00" />
            </FilasTarea>
          </div>
        </Seccion>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion n="06 · 07" titulo="Paleta y diálogo" fuente="beautifului.dev Search · beui Command Palette · shadcn Dialog">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={paleta.abrir}
              className="inline-flex h-8 items-center gap-3 border border-linea bg-panel-2 pr-2 pl-3 text-[13px] text-tinta-3 transition-colors duration-150 hover:border-linea-fuerte hover:text-tinta"
            >
              Buscar o ejecutar
              <kbd className="border border-linea px-1.5 font-mono text-[10px] leading-4">⌘K</kbd>
            </button>
            <button
              type="button"
              onClick={() => setDialogo(true)}
              className="h-8 border border-linea-fuerte bg-panel px-3 text-[13px] font-medium text-tinta transition-colors duration-150 hover:bg-panel-2"
            >
              Abrir diálogo
            </button>
          </div>
          <PaletaComandos abierta={paleta.abierta} cerrar={paleta.cerrar} grupos={grupos} marcador="Buscar cita, cliente o acción…" />
          <Dialogo
            abierto={dialogo}
            cerrar={() => setDialogo(false)}
            titulo="Registrar cobro"
            descripcion="Cita B68E · Ana Torres · Limpieza dental"
            pie={
              <>
                <button
                  type="button"
                  onClick={() => setDialogo(false)}
                  className="h-8 px-3 text-[13px] text-tinta-2 transition-colors duration-150 hover:text-tinta"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDialogo(false);
                    setGuardado(true);
                    avisar({ titulo: "Cobro registrado", detalle: "$850 · efectivo", tono: "bueno" });
                  }}
                  className="h-8 bg-acento px-3 text-[13px] font-semibold text-acento-tinta transition-[filter] duration-150 hover:brightness-110"
                >
                  Registrar cobro
                </button>
              </>
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-tinta-2">Monto</span>
                <input
                  autoFocus
                  defaultValue="850"
                  inputMode="decimal"
                  className="numeros w-full border border-linea bg-panel-2 px-2.5 py-1.5 font-mono text-[13px] text-tinta outline-none focus:border-acento focus:bg-panel"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium text-tinta-2">Forma de pago</span>
                <select className="w-full border border-linea bg-panel-2 px-2.5 py-1.5 text-[13px] text-tinta outline-none focus:border-acento">
                  <option>Efectivo</option>
                  <option>Tarjeta</option>
                  <option>Transferencia</option>
                </select>
              </label>
            </div>
          </Dialogo>
          <div className="mt-3 border border-linea bg-panel">
            <Pestanas
              className="px-2"
              rotulo="Sección"
              activa={pestana}
              cambiar={setPestana}
              pestanas={[
                { id: "citas", nombre: "Citas", conteo: 6 },
                { id: "clientes", nombre: "Clientes", conteo: 84 },
                { id: "cobros", nombre: "Cobros" },
                { id: "ajustes", nombre: "Ajustes" },
              ]}
            />
            <div className="px-4 py-3 text-[12.5px] text-tinta-2">
              <PanelPestana id="citas" activa={pestana}>Seis citas hoy, dos pendientes de confirmar.</PanelPestana>
              <PanelPestana id="clientes" activa={pestana}>84 clientes; 3 sin volver en 90 días.</PanelPestana>
              <PanelPestana id="cobros" activa={pestana}>$48,350 cobrados en el mes.</PanelPestana>
              <PanelPestana id="ajustes" activa={pestana}>Horario, servicios y voz del agente.</PanelPestana>
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-tinta-3">08 · Pestañas: beui Expandable Tabs, indicador reescrito en CSS.</p>
        </Seccion>

        <Seccion n="09 · 10 · 12" titulo="Avisos, cifra animada y marca de éxito" fuente="beui Toast Stack · transitions.dev number pop-in · checkmark">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => avisar({ titulo: "Guardado", tono: "bueno" })}
              className="h-8 border border-linea-fuerte bg-panel px-3 text-[13px] font-medium text-tinta transition-colors duration-150 hover:bg-panel-2"
            >
              Guardado
            </button>
            <button
              type="button"
              onClick={() =>
                avisar({
                  titulo: "Cobro registrado",
                  detalle: "$2,400 · tarjeta · D904",
                  tono: "bueno",
                  accion: { texto: "Deshacer", onClick: () => avisar({ titulo: "Cobro deshecho", tono: "neutro" }) },
                })
              }
              className="h-8 border border-linea-fuerte bg-panel px-3 text-[13px] font-medium text-tinta transition-colors duration-150 hover:bg-panel-2"
            >
              Cobro registrado
            </button>
            <button
              type="button"
              onClick={() => avisar({ titulo: "No se pudo enviar el recordatorio", detalle: "El número 55 4444 0202 no tiene WhatsApp.", tono: "critico", duracion: 8000 })}
              className="h-8 border border-linea-fuerte bg-panel px-3 text-[13px] font-medium text-tinta transition-colors duration-150 hover:bg-panel-2"
            >
              Error
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-px border border-linea bg-linea">
            {[
              { rotulo: "Llamadas", valor: cifras.llamadas },
              { rotulo: "Citas agendadas", valor: cifras.citas },
              { rotulo: "Cobrado", valor: cifras.cobrado, formato: (n: number) => `$${Math.round(n).toLocaleString("es-MX")}` },
              { rotulo: "Sin volver 90 d", valor: cifras.sin },
            ].map((c) => (
              <div key={c.rotulo} className="bg-panel px-4 py-3">
                <p className="text-[12px] text-tinta-2">{c.rotulo}</p>
                <CifraAnimada valor={c.valor} formato={c.formato} className="mt-1.5 text-[26px] leading-none font-medium tracking-[-0.02em] text-tinta" />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setCifras((c) => ({ llamadas: c.llamadas + 7, citas: c.citas + 2, cobrado: c.cobrado + 1250, sin: Math.max(0, c.sin - 1) }))
              }
              className="text-[12px] text-acento transition-colors duration-150 hover:text-tinta"
            >
              Simular llamadas nuevas
            </button>
            <span className="ml-auto flex items-center gap-4">
              <MarcaExito texto="Guardado" />
              {guardado ? <MarcaExito texto="Cobro registrado" tono="acento" /> : null}
            </span>
          </div>
        </Seccion>

        <Seccion n="11 · 13" titulo="Esqueleto, texto que fluye y pensando" fuente="transitions.dev skeleton · beautifului.dev Streaming Text + Thinking">
          <EsqueletoTabla filas={3} columnas={4} />
          <div className="mt-3 grid grid-cols-2 gap-px border border-linea bg-linea">
            <EsqueletoCifra />
            <EsqueletoCifra />
          </div>
          <div className="mt-3">
            <EsqueletoTarjeta lineas={2} />
          </div>
          <div className="mt-3 border border-linea bg-panel px-4 py-3">
            <TextoFluye
              key={fluye}
              texto="Hoy tiene seis citas. Dos siguen sin confirmar: Luis Hernández a las 10:00 y Diego Flores a las 16:00. Ya les mandé recordatorio; si no contestan antes de las 9:00, les llamo."
              onTerminar={() => {}}
            />
            <button type="button" onClick={() => setFluye((v) => v + 1)} className="mt-2 text-[12px] text-acento transition-colors duration-150 hover:text-tinta">
              Volver a transmitir
            </button>
          </div>
          <div className="mt-3">
            <Pensando
              abiertoInicial
              pasos={[
                { texto: "Leyó la agenda de hoy", estado: "hecho", dato: "6 citas" },
                { texto: "Buscó confirmaciones en WhatsApp", estado: "hecho", dato: "4 de 6" },
                { texto: "Revisa historial de los dos pendientes", estado: "en-curso" },
                { texto: "Redacta el resumen", estado: "pendiente" },
              ]}
            />
          </div>
        </Seccion>
      </div>
    </div>
  );
}
