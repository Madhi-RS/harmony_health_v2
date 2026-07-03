"""RBAC authorization layer — PermissionChecker with ownership validation.

Extends the basic RoleChecker from api/deps.py with:
- Permission-level checks (can the user perform this specific action?)
- Ownership validation (does the user own this resource?)
- Reusable dependency injection for FastAPI endpoints.

Usage:
    # Permission check only
    RequirePermission = PermissionChecker([Permission.CREATE_PATIENTS])
    @router.post("/patients")
    async def create(..., _perm=Depends(RequirePermission)):
        ...

    # Permission + ownership check
    @router.delete("/patients/{id}")
    async def delete(..., _perm=Depends(PermissionChecker(
        [Permission.DELETE_PATIENTS],
        require_ownership=True,
    ))):
        ...
"""

from typing import Optional
from app.models.user import User, UserRole
from app.core.permissions import Permission, has_permission
from app.core.exceptions import ForbiddenException


class PermissionChecker:
    """FastAPI dependency that checks permissions and optional ownership.

    Args:
        required_permissions: List of permissions required to access the endpoint.
        require_ownership: If True, the user must own the resource (checked separately).
        allow_admin_override: If True, ADMIN role bypasses ownership checks.
    """

    def __init__(
        self,
        required_permissions: list[Permission],
        require_ownership: bool = False,
        allow_admin_override: bool = True,
    ):
        self.required_permissions = required_permissions
        self.require_ownership = require_ownership
        self.allow_admin_override = allow_admin_override

    async def __call__(self, current_user: User) -> User:
        """Validate permissions for the current user."""
        role = current_user.role.value

        # Check each required permission
        missing = []
        for perm in self.required_permissions:
            if not has_permission(role, perm):
                missing.append(perm.value)

        if missing:
            raise ForbiddenException(
                f"Role '{role}' lacks required permissions: {missing}. "
                f"Required: {[p.value for p in self.required_permissions]}"
            )

        return current_user

    @staticmethod
    def validate_ownership(
        current_user: User,
        resource_owner_id: str,
        resource_type: str = "resource",
    ) -> None:
        """Validate that the current user owns the resource.

        Raises ForbiddenException if the user is not the owner (and not an ADMIN).

        Args:
            current_user: The authenticated user.
            resource_owner_id: The user_id that owns the resource.
            resource_type: Human-readable resource name for error messages.
        """
        if current_user.role == UserRole.ADMIN:
            return  # Admins bypass ownership checks

        if str(current_user.id) != str(resource_owner_id):
            raise ForbiddenException(
                f"You do not own this {resource_type}. "
                f"Only the creator or an ADMIN can access it."
            )

    @staticmethod
    def validate_patient_ownership(
        current_user: User,
        patient_created_by: str,
    ) -> None:
        """Validate that the user owns this patient record."""
        PermissionChecker.validate_ownership(
            current_user, patient_created_by, "patient"
        )

    @staticmethod
    def validate_appointment_ownership(
        current_user: User,
        appointment_scheduled_by: str,
    ) -> None:
        """Validate that the user owns this appointment."""
        PermissionChecker.validate_ownership(
            current_user, appointment_scheduled_by, "appointment"
        )

    @staticmethod
    def validate_conversation_ownership(
        current_user: User,
        conversation_user_id: str,
    ) -> None:
        """Validate that the user owns this conversation."""
        PermissionChecker.validate_ownership(
            current_user, conversation_user_id, "conversation"
        )
