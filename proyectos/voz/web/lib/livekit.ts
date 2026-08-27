import "server-only";

export type ConfiguracionLivekit = { url: string; apiKey: string; apiSecret: string };

export function configuracionLivekit(): ConfiguracionLivekit | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export function variablesFaltantes(): string[] {
  return (["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const).filter(
    (nombre) => !process.env[nombre],
  );
}
