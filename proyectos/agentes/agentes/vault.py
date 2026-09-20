"""Cifrado en reposo de tokens y llaves: AES-GCM con la llave de AGENTES_SECRETO."""
import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from agentes import config

_llave = base64.b64decode(config.AGENTES_SECRETO)
if len(_llave) != 32:
    raise RuntimeError("AGENTES_SECRETO debe ser 32 bytes en base64")


def cifrar(texto: str) -> bytes:
    nonce = os.urandom(12)
    return nonce + AESGCM(_llave).encrypt(nonce, texto.encode(), None)


def descifrar(dato: bytes) -> str:
    dato = bytes(dato)
    return AESGCM(_llave).decrypt(dato[:12], dato[12:], None).decode()


def llave_nueva() -> str:
    """API_SERVER_KEY para un perfil de Hermes (mínimo 16 caracteres)."""
    return base64.urlsafe_b64encode(os.urandom(24)).decode().rstrip("=")
