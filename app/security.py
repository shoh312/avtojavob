import base64
import hashlib
import hmac
import json
import os

from cryptography.fernet import Fernet, InvalidToken

from .config import settings


# ---------- Parollar (stdlib scrypt) ----------

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(dk.hex(), dk_hex)


# ---------- Access token'larni bazada shifrlab saqlash ----------

def _fernet() -> Fernet:
    key = settings.TOKEN_ENC_KEY or base64.urlsafe_b64encode(
        hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    ).decode()
    return Fernet(key)


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as e:
        raise ValueError("Token deshifrlanmadi (TOKEN_ENC_KEY o'zgarganmi?)") from e


# ---------- Meta imzolari ----------

def _secrets() -> list[str]:
    return [s for s in (settings.IG_APP_SECRET, settings.FB_APP_SECRET) if s]


def verify_webhook_signature(body: bytes, header: str | None) -> bool:
    if not header or not header.startswith("sha256="):
        return False
    received = header[len("sha256="):]
    for secret in _secrets():
        expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected, received):
            return True
    return False


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def parse_signed_request(signed_request: str) -> dict | None:
    """Meta'ning deauthorize / data-deletion callback'laridagi signed_request."""
    try:
        sig_b64, payload_b64 = signed_request.split(".", 1)
        sig = _b64url_decode(sig_b64)
        for secret in _secrets():
            expected = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
            if hmac.compare_digest(sig, expected):
                return json.loads(_b64url_decode(payload_b64))
    except (ValueError, json.JSONDecodeError):
        return None
    return None
