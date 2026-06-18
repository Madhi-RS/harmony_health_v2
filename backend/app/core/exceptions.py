from fastapi import HTTPException, status


class AppException(HTTPException):
    """Base application exception with error code."""

    def __init__(
        self,
        status_code: int,
        message: str,
        error_code: str = "UNKNOWN_ERROR",
        details: dict | None = None,
    ):
        super().__init__(status_code=status_code, detail=message)
        self.error_code = error_code
        self.message = message
        self.details = details or {}


class NotFoundException(AppException):
    def __init__(self, entity: str, entity_id: str):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            message=f"{entity} not found: {entity_id}",
            error_code="NOT_FOUND",
            details={"entity": entity, "id": entity_id},
        )


class DuplicateException(AppException):
    def __init__(self, entity: str, field: str, value: str):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            message=f"{entity} with {field} '{value}' already exists",
            error_code="DUPLICATE",
            details={"entity": entity, "field": field, "value": value},
        )


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Not authenticated"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            message=message,
            error_code="UNAUTHORIZED",
        )


class ForbiddenException(AppException):
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            message=message,
            error_code="FORBIDDEN",
        )


class ValidationException(AppException):
    def __init__(self, message: str, details: dict | None = None):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            message=message,
            error_code="VALIDATION_ERROR",
            details=details or {},
        )


class ServiceUnavailableException(AppException):
    def __init__(self, service: str):
        super().__init__(
            status_code=status.HTTP_502_BAD_GATEWAY,
            message=f"{service} is temporarily unavailable",
            error_code="SERVICE_UNAVAILABLE",
            details={"service": service},
        )
