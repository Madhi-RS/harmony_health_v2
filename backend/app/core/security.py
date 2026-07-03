import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Optional

import bcrypt
from jose import jwt, JWTError

from app.core.config import settings


@lru_cache
def _load_private_key() -> str:
    """Load RSA private key PEM string for RS256 signing."""
    p = Path(settings.JWT_PRIVATE_KEY_PATH)
    if not p.exists():
        raise FileNotFoundError(f"JWT private key not found: {p}")
    return p.read_text()


@lru_cache
def _load_public_key() -> str:
    """Load RSA public key PEM string for RS256 verification."""
    p = Path(settings.JWT_PUBLIC_KEY_PATH)
    if not p.exists():
        raise FileNotFoundError(f"JWT public key not found: {p}")
    return p.read_text()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its bcrypt hash."""
    password_bytes = plain_password.encode("utf-8")
    hashed_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(password_bytes, hashed_bytes)


def create_access_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
    *,
    tenant_id: str | None = None,
    site_id: str | None = None,
    roles: list[str] | None = None,
    email: str | None = None,
) -> str:
    """Create an RS256-signed JWT access token.

    The private key signs; the AI Sales Layer verifies with the public key.
    """
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    if tenant_id:
        payload["tenant_id"] = tenant_id
    if site_id:
        payload["site_id"] = site_id
    if roles:
        payload["roles"] = roles
    if email:
        payload["email"] = email

    return jwt.encode(
        payload,
        _load_private_key(),
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(
    subject: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create an RS256-signed JWT refresh token."""
    if expires_delta is None:
        expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    expire = datetime.now(timezone.utc) + expires_delta
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4()),
        "type": "refresh",
    }
    return jwt.encode(
        payload,
        _load_private_key(),
        algorithm=settings.JWT_ALGORITHM,
    )


@lru_cache
def _load_careplus_public_key() -> str | None:
    p = Path(settings.CAREPLUS_PUBLIC_KEY_PATH)
    if not p.exists():
        return None
    return p.read_text()


def decode_token(token: str) -> dict:
    """Decode a JWT — tries Harmony key first, then CarePlus key."""
    # Try Harmony key
    try:
        return jwt.decode(token, _load_public_key(), algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        pass
    # Try CarePlus key
    cp_key = _load_careplus_public_key()
    if cp_key:
        return jwt.decode(token, cp_key, algorithms=[settings.JWT_ALGORITHM])
    raise JWTError("Token verification failed with all available keys")
