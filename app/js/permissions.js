/**
 * WORK COSMO RECRUITMENT ECOSYSTEM - RBAC (aligned with subscription plans & team workflows)
 */

export const PERMISSIONS = {
    fullAccess: "full_access",
    manageUsers: "manage_users",
    manageRoles: "manage_roles",
    manageBilling: "manage_billing",
    manageJobs: "manage_jobs",
    manageCandidates: "manage_candidates",
    shareProfiles: "share_profiles",
    readOnly: "read_only",
    viewAnalytics: "view_analytics",
    useQrBridgeLogin: "use_qr_bridge_login"
};

export const ROLE_DEFINITIONS = {
    owner: {
        id: "owner",
        label: "Owner",
        permissions: Object.values(PERMISSIONS)
    },
    admin: {
        id: "admin",
        label: "Admin",
        permissions: [
            PERMISSIONS.manageUsers,
            PERMISSIONS.manageJobs,
            PERMISSIONS.manageCandidates,
            PERMISSIONS.viewAnalytics,
            PERMISSIONS.shareProfiles,
            PERMISSIONS.useQrBridgeLogin
        ]
    },
    manager: {
        id: "manager",
        label: "Manager",
        permissions: [
            PERMISSIONS.manageJobs,
            PERMISSIONS.manageCandidates,
            PERMISSIONS.viewAnalytics,
            PERMISSIONS.shareProfiles,
            PERMISSIONS.useQrBridgeLogin
        ]
    },
    recruiter: {
        id: "recruiter",
        label: "Recruiter",
        permissions: [
            PERMISSIONS.manageCandidates,
            PERMISSIONS.shareProfiles
        ]
    },
    viewer: {
        id: "viewer",
        label: "Viewer",
        permissions: [PERMISSIONS.readOnly]
    }
};

export function hasPermission(roleId, permission) {
    const role = ROLE_DEFINITIONS[roleId] || ROLE_DEFINITIONS.viewer;
    return role.permissions.includes(PERMISSIONS.fullAccess) || role.permissions.includes(permission);
}

export function isManagerUp(roleId) {
    return roleId === "owner" || roleId === "admin" || roleId === "manager";
}

export function isWriter(roleId) {
    return roleId !== "viewer";
}

export function canReadOwnedDoc(roleId, doc, uid) {
    if (!doc || !uid) return false;
    if (isManagerUp(roleId)) return true;
    if (hasPermission(roleId, PERMISSIONS.manageCandidates)) {
        if (doc.ownerId === uid) return true;
        const assigned = doc.assignedTo;
        return Array.isArray(assigned) && assigned.includes(uid);
    }
    return false;
}

export function canManageUsers(roleId) {
    return hasPermission(roleId, PERMISSIONS.manageUsers);
}

export function canEditSharedData(roleId) {
    return isManagerUp(roleId) || hasPermission(roleId, PERMISSIONS.manageJobs);
}

export function canViewAudit(roleId) {
    return hasPermission(roleId, PERMISSIONS.viewAnalytics) || isManagerUp(roleId);
}

/** Managers+ can assign work to any teammate in the workspace. */
export function canAssignTeam(roleId) {
    return isManagerUp(roleId);
}

/** Any writer can take ownership of unowned work; managers can take any record. */
export function canTakeOwnership(roleId, doc, uid) {
    if (!isWriter(roleId) || !uid) return false;
    if (isManagerUp(roleId)) return true;
    if (!doc?.ownerId || doc.ownerId === uid) return true;
    const assigned = doc?.assignedTo;
    return Array.isArray(assigned) && assigned.includes(uid);
}

export function canDeleteRecord(roleId, doc, uid) {
    if (!isWriter(roleId)) return false;
    if (isManagerUp(roleId)) return true;
    return doc?.ownerId === uid;
}

export const ROLES = {
    OWNER: "owner",
    ADMIN: "admin",
    MANAGER: "manager",
    RECRUITER: "recruiter",
    VIEWER: "viewer"
};

export const ASSIGNABLE_ROLES = [
    { id: ROLES.RECRUITER, label: "Recruiter" },
    { id: ROLES.MANAGER, label: "Manager" },
    { id: ROLES.ADMIN, label: "Admin" },
    { id: ROLES.VIEWER, label: "Viewer" }
];
