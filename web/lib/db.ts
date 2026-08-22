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
      ssl: dsn.includes("supabase.com") ? { rejectUnauthorized: false } : undefined,
    });
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
    await cliente.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
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

export async function elevado<T>(fn: (q: Consulta) => Promise<T>): Promise<T> {
  const cliente = await pool().connect();
  try {
    await cliente.query("begin");
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
