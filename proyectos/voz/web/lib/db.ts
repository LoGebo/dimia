import "server-only";

import { Pool, type PoolClient } from "pg";

const dsn = process.env.PG_DSN;

declare global {
  var __agendaPool: Pool | undefined;
}

function pool(): Pool {
  if (!dsn) throw new Error("Falta PG_DSN en el entorno");
  if (!globalThis.__agendaPool) {
    globalThis.__agendaPool = new Pool({
      connectionString: dsn,
      max: 8,
      statement_timeout: 10_000,
      // Sin tope, con el pool lleno la página se queda cargando hasta el maxDuration de Vercel.
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      ssl: dsn.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
    });
    // Si el pooler cierra una conexión ociosa, pg emite 'error' en el pool; sin oyente tumba el proceso.
    globalThis.__agendaPool.on("error", (e) => console.error("pool de Postgres:", e.message));
  }
  return globalThis.__agendaPool;
}

export type Consulta = <T>(sql: string, params?: unknown[]) => Promise<T[]>;

function consultar(cliente: PoolClient): Consulta {
  return async <T>(sql: string, params: unknown[] = []) => {
    const { rows } = await cliente.query(sql, params);
    return rows as T[];
  };
}

export async function conSesion<T>(userId: string, fn: (q: Consulta) => Promise<T>): Promise<T> {
  const cliente = await pool().connect();
  try {
    await cliente.query("begin");
    await cliente.query("set local role authenticated");
    // Un solo viaje para los tres set_config.
    await cliente.query(
      "select set_config('app.autor', 'equipo', true), set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)",
      [userId, JSON.stringify({ sub: userId, role: "authenticated" })],
    );
    const resultado = await fn(consultar(cliente));
    await cliente.query("commit");
    return resultado;
  } catch (error) {
    await cliente.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}

/**
 * Fuera de la sesión del dueño: acceso, alta y webhooks. El panel entra como
 * app_panel, sin BYPASSRLS: lo que toca un negocio necesita `negocioId`, que
 * se fija en app.tenant solo para esta transacción. Sin él, la base truena en
 * cualquier tabla de negocio en vez de mostrar datos de otro.
 */
export async function elevado<T>(fn: (q: Consulta) => Promise<T>, negocioId?: string): Promise<T> {
  const cliente = await pool().connect();
  try {
    await cliente.query("begin");
    if (negocioId) await cliente.query("select set_config('app.tenant', $1, true)", [negocioId]);
    const resultado = await fn(consultar(cliente));
    await cliente.query("commit");
    return resultado;
  } catch (error) {
    await cliente.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    cliente.release();
  }
}
