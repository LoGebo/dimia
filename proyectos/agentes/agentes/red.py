"""Un solo cliente HTTP por proceso. Crear un AsyncClient carga los certificados (~3 ms de CPU
que congelan el event loop con muchos turnos a la vez) y no reutiliza conexiones."""
import httpx

SSL = httpx.create_ssl_context()
_http: httpx.AsyncClient | None = None


def http() -> httpx.AsyncClient:
    """Compartido: no se cierra. Cada llamada pasa su propio timeout."""
    global _http
    if _http is None:
        _http = httpx.AsyncClient(verify=SSL, timeout=30, limits=httpx.Limits(max_connections=None, max_keepalive_connections=50))
    return _http
