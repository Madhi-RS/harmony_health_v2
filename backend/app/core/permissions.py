"""Permission constants for RBAC authorization.

Permissions define what actions a role can perform.
They are checked by PermissionChecker in core/rbac.py.
"""

from enum import Enum


class Permission(str, Enum):
    """Granular permissions for resource-level access control."""

    # User Management
    MANAGE_USERS = "manage_users"
    VIEW_USERS = "view_users"
    CREATE_USERS = "create_users"
    UPDATE_USERS = "update_users"
    DELETE_USERS = "delete_users"
    DISABLE_USERS = "disable_users"

    # Patient Management
    VIEW_PATIENTS = "view_patients"
    CREATE_PATIENTS = "create_patients"
    UPDATE_PATIENTS = "update_patients"
    DELETE_PATIENTS = "delete_patients"
    VIEW_OWN_PATIENTS = "view_own_patients"

    # Appointment Management
    VIEW_APPOINTMENTS = "view_appointments"
    CREATE_APPOINTMENTS = "create_appointments"
    UPDATE_APPOINTMENTS = "update_appointments"
    DELETE_APPOINTMENTS = "delete_appointments"
    UPDATE_APPOINTMENT_STATUS = "update_appointment_status"
    VIEW_OWN_APPOINTMENTS = "view_own_appointments"

    # Conversation & Chat
    VIEW_CONVERSATIONS = "view_conversations"
    CREATE_CONVERSATIONS = "create_conversations"
    SEND_MESSAGES = "send_messages"
    VIEW_OWN_CONVERSATIONS = "view_own_conversations"

    # Analytics
    VIEW_ANALYTICS = "view_analytics"
    VIEW_CALL_LOGS = "view_call_logs"
    VIEW_COST_BREAKDOWN = "view_cost_breakdown"
    VIEW_LATENCY_METRICS = "view_latency_metrics"

    # Voice & LiveKit
    MANAGE_VOICE_SESSIONS = "manage_voice_sessions"
    GENERATE_LIVEKIT_TOKENS = "generate_livekit_tokens"

    # Dashboard
    VIEW_DASHBOARD_STATS = "view_dashboard_stats"


# Role → Permission mapping
ROLE_PERMISSIONS: dict[str, list[Permission]] = {
    "ADMIN": [
        # Admins get everything
        Permission.MANAGE_USERS,
        Permission.VIEW_USERS,
        Permission.CREATE_USERS,
        Permission.UPDATE_USERS,
        Permission.DELETE_USERS,
        Permission.DISABLE_USERS,
        Permission.VIEW_PATIENTS,
        Permission.CREATE_PATIENTS,
        Permission.UPDATE_PATIENTS,
        Permission.DELETE_PATIENTS,
        Permission.VIEW_APPOINTMENTS,
        Permission.CREATE_APPOINTMENTS,
        Permission.UPDATE_APPOINTMENTS,
        Permission.DELETE_APPOINTMENTS,
        Permission.UPDATE_APPOINTMENT_STATUS,
        Permission.VIEW_CONVERSATIONS,
        Permission.CREATE_CONVERSATIONS,
        Permission.SEND_MESSAGES,
        Permission.VIEW_ANALYTICS,
        Permission.VIEW_CALL_LOGS,
        Permission.VIEW_COST_BREAKDOWN,
        Permission.VIEW_LATENCY_METRICS,
        Permission.MANAGE_VOICE_SESSIONS,
        Permission.GENERATE_LIVEKIT_TOKENS,
        Permission.VIEW_DASHBOARD_STATS,
    ],
    "RECEPTIONIST": [
        # Receptionists get limited, ownership-scoped access
        Permission.VIEW_OWN_PATIENTS,
        Permission.CREATE_PATIENTS,
        Permission.UPDATE_PATIENTS,
        Permission.VIEW_OWN_APPOINTMENTS,
        Permission.CREATE_APPOINTMENTS,
        Permission.UPDATE_APPOINTMENTS,
        Permission.UPDATE_APPOINTMENT_STATUS,
        Permission.VIEW_OWN_CONVERSATIONS,
        Permission.CREATE_CONVERSATIONS,
        Permission.SEND_MESSAGES,
        Permission.VIEW_DASHBOARD_STATS,
    ],
}


def get_permissions_for_role(role: str) -> list[Permission]:
    """Return the list of permissions granted to a role."""
    return ROLE_PERMISSIONS.get(role, [])


def has_permission(role: str, permission: Permission) -> bool:
    """Check if a role has a specific permission."""
    return permission in ROLE_PERMISSIONS.get(role, [])
