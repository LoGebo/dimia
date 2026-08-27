"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { entrar, registrar, type Estado } from "@/lib/acciones";
import { SelectorGiro, type EstadoGiro } from "@/components/selector-giro";
import { Aviso, Boton, Campo, Entrada } from "@/components/ui/primitivos";
import type { PlantillaVertical } from "@/lib/tipos";

type Modo = "entrar" | "registro";

export function FormularioAcceso({
  modo,
  supabase,
  plantillas = [],
}: {
  modo: Modo;
  supabase: boolean;
  plantillas?: PlantillaVertical[];
}) {
  return supabase ? <ConSupabase modo={modo} /> : <ConPostgres modo={modo} plantillas={plantillas} />;
}

function Encabezado({ modo }: { modo: Modo }) {
  return (
    <div className="mb-6">
      <h1 className="text-lg font-semibold tracking-tight text-tinta">
        {modo === "entrar" ? "Entra a tu panel" : "Crea tu cuenta"}
      </h1>
      <p className="mt-1 text-[13px] text-tinta-2">
        {modo === "entrar"
          ? "Administra la agenda y el agente de tu negocio."
          : "En menos de quince minutos tu agente contesta."}
      </p>
    </div>
  );
}

function Pie({ modo }: { modo: Modo }) {
  return (
    <p className="mt-5 text-center text-xs text-tinta-3">
      {modo === "entrar" ? (
        <>
          ¿No tienes cuenta?{" "}
          <Link href="/registro" className="font-medium text-acento hover:underline">
            Regístrate
          </Link>
        </>
      ) : (
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/entrar" className="font-medium text-acento hover:underline">
            Entra
          </Link>
        </>
      )}
    </p>
  );
}

function ConPostgres({ modo, plantillas }: { modo: Modo; plantillas: PlantillaVertical[] }) {
  const inicial: Estado = {};
  const [estado, accion, pendiente] = useActionState(modo === "entrar" ? entrar : registrar, inicial);
  const [giro, setGiro] = useState<EstadoGiro>({ giro: plantillas[0]?.clave ?? "propio", propio: false, faltantes: [] });
  const conCandado = modo === "registro" && giro.faltantes.length > 0;
  return (
    <form action={accion}>
      <Encabezado modo={modo} />
      <div className="space-y-3">
        <Campo etiqueta="Correo">
          <Entrada name="email" type="email" autoComplete="email" required placeholder="tu@negocio.mx" />
        </Campo>
        <Campo etiqueta="Contraseña" ayuda={modo === "registro" ? "Mínimo 8 caracteres." : undefined}>
          <Entrada
            name="password"
            type="password"
            autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            required
          />
        </Campo>
        {modo === "registro" ? (
          <>
            <Campo etiqueta="Nombre del negocio" ayuda="Así se presenta el agente al contestar.">
              <Entrada name="nombre" required placeholder="Clínica Dental Sonrisa" />
            </Campo>
            <SelectorGiro plantillas={plantillas} onCambio={setGiro} />
            <p className="text-[11.5px] text-tinta-3">
              Tu negocio arranca con lo típico de su giro ya capturado. Lo revisas y lo ajustas.
            </p>
          </>
        ) : null}
        {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
        <Boton variante="solido" className="w-full" disabled={pendiente || conCandado}>
          {pendiente ? "Un momento…" : modo === "entrar" ? "Entrar" : conCandado ? `Falta ${giro.faltantes.join(" y ")}` : "Crear cuenta y empezar"}
        </Boton>
      </div>
      <Pie modo={modo} />
    </form>
  );
}

function ConSupabase({ modo }: { modo: Modo }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  async function enviar(datos: FormData) {
    setError(null);
    const cliente = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    );
    const credenciales = {
      email: String(datos.get("email")),
      password: String(datos.get("password")),
    };
    const respuesta =
      modo === "entrar"
        ? await cliente.auth.signInWithPassword(credenciales)
        : await cliente.auth.signUp(credenciales);
    if (respuesta.error) {
      setError(respuesta.error.message);
      return;
    }
    iniciar(() => {
      router.replace(modo === "entrar" ? "/resumen" : "/alta");
      router.refresh();
    });
  }

  return (
    <form action={enviar}>
      <Encabezado modo={modo} />
      <div className="space-y-3">
        <Campo etiqueta="Correo">
          <Entrada name="email" type="email" autoComplete="email" required placeholder="tu@negocio.mx" />
        </Campo>
        <Campo etiqueta="Contraseña" ayuda={modo === "registro" ? "Mínimo 8 caracteres." : undefined}>
          <Entrada name="password" type="password" required minLength={8} />
        </Campo>
        {error ? <Aviso tono="error">{error}</Aviso> : null}
        <Boton variante="solido" className="w-full" disabled={pendiente}>
          {modo === "entrar" ? "Entrar" : "Crear cuenta"}
        </Boton>
      </div>
      <Pie modo={modo} />
    </form>
  );
}
