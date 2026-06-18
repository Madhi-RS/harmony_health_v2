"""T1.1, T1.5 — Python env and scaffolding smoke tests."""

import pytest


class TestScaffolding:
    """Phase 1 scaffolding verification tests."""

    def test_core_modules_importable(self):
        """Core application modules can be imported without errors."""
        from app.core.config import settings
        assert settings.APP_NAME == "Harmony Health PMS"
        assert settings.APP_VERSION == "0.1.0"

    def test_security_modules_importable(self):
        """Security modules load correctly."""
        from app.core.security import hash_password, verify_password, create_access_token, decode_token
        assert callable(hash_password)
        assert callable(verify_password)
        assert callable(create_access_token)
        assert callable(decode_token)

    def test_database_module_importable(self):
        """Database module loads correctly."""
        from app.database import Base, get_db, engine
        assert Base is not None

    def test_exceptions_importable(self):
        """Exception classes are properly defined."""
        from app.core.exceptions import (
            AppException, NotFoundException, DuplicateException,
            UnauthorizedException, ForbiddenException, ValidationException,
            ServiceUnavailableException,
        )
        assert issubclass(NotFoundException, AppException)
        assert issubclass(UnauthorizedException, AppException)
        assert issubclass(ServiceUnavailableException, AppException)

    def test_password_hashing_works(self):
        """T2.9 — Passwords are properly hashed and verified."""
        from app.core.security import hash_password, verify_password

        password = "SecurePass123!"
        hashed = hash_password(password)
        assert hashed != password
        assert verify_password(password, hashed)
        assert not verify_password("WrongPassword", hashed)

    def test_jwt_token_creation_and_verification(self):
        """JWT tokens can be created and decoded."""
        from app.core.security import create_access_token, decode_token

        user_id = "test-user-123"
        token = create_access_token(subject=user_id)
        payload = decode_token(token)
        assert payload["sub"] == user_id
        assert payload["type"] == "access"
        assert "exp" in payload
        assert "jti" in payload
