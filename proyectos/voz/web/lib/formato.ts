export function moneda(valor: string | number | null): string {
  if (valor === null || valor === "") return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number(valor));
}

export function hora(iso: string, zona: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: zona,
  }).format(new Date(iso));
}

export function fechaLarga(iso: string, zona: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: zona,
  }).format(new Date(iso));
}

export function fechaCorta(iso: string, zona: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    timeZone: zona,
  }).format(new Date(iso));
}

export function duracion(segundos: number | null): string {
  if (segundos === null) return "—";
  const m = Math.floor(segundos / 60);
  const s = Math.round(segundos % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function porcentaje(valor: number): string {
  return `${(valor * 100).toFixed(0)}%`;
}

export function telefono(valor: string): string {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length === 12 && digitos.startsWith("52")) {
    const n = digitos.slice(2);
    return `+52 ${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`;
  }
  return valor;
}

export function isoDia(fecha: Date, zona: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: zona,
  }).format(fecha);
}

export const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function fechaValida(dia: string): boolean {
  return FECHA_ISO.test(dia) && !Number.isNaN(Date.parse(`${dia}T12:00:00Z`));
}

/** Un `?dia=` de la URL solo se usa si es una fecha real; si no, se cae a hoy. */
export function diaValido(param: string | undefined, hoy: string): string {
  return param && fechaValida(param) ? param : hoy;
}

export const TELEFONO_E164 = /^\+\d{10,15}$/;

/** Deja solo dígitos y el signo; diez dígitos a secas se toman como número de México. */
export function normalizarTelefono(valor: string): string {
  const limpio = valor.replace(/[^\d+]/g, "");
  return /^\d{10}$/.test(limpio) ? `+52${limpio}` : limpio;
}

export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const a = partes[0]?.[0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : (partes[0]?.[1] ?? "");
  return `${a}${b}`.toUpperCase();
}

export function lunesDe(dia: string): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  const desplazamiento = (fecha.getUTCDay() + 6) % 7;
  fecha.setUTCDate(fecha.getUTCDate() - desplazamiento);
  return fecha.toISOString().slice(0, 10);
}

export function sumarDias(dia: string, n: number): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + n);
  return fecha.toISOString().slice(0, 10);
}

export function minutosDeHora(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

export function horaDeMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function horaHablada(minutos: number): string {
  const h24 = Math.floor(minutos / 60);
  const m = minutos % 60;
  const sufijo = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${sufijo}` : `${h12}:${String(m).padStart(2, "0")} ${sufijo}`;
}
