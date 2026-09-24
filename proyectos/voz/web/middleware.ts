import { NextResponse, type NextRequest } from "next/server";

/**
 * Pasa la ruta al layout del panel para que revise la sección antes de que
 * empiece el streaming: así una sección que no aplica al giro sale como un 307
 * de verdad y no como un redirect dentro del flujo (React #310 al hidratar).
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set("x-ruta", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
