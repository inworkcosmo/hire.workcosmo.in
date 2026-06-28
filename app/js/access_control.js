import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { hasPermission, PERMISSIONS } from "./permissions.js";
import { isModuleEnabled } from "../../shared/js/module_registry.js";

export const FEATURES = {
    recruitModule: "recruitModule",
    coreModule: "coreModule",
    performModule: "performModule",
    careerPortal: "careerPortal",
    shareProfile: "shareProfile",
    qrBridgeLogin: "qrBridgeLogin",
    advancedAnalytics: "advancedAnalytics"
};

export const PLAN_CATALOG = {
    starter: {
        id: "starter",
        name: "Starter",
        priceMonthly: 1499,
        maxUsers: 1,
        features: Object.values(FEATURES),
        customDomain: false
    },
    professional: {
        id: "professional",
        name: "Professional",
        priceMonthly: 2999,
        maxUsers: 3,
        features: Object.values(FEATURES),
        customDomain: false
    },
    enterprise: {
        id: "enterprise",
        name: "Enterprise",
        priceMonthly: 8999,
        maxUsers: 8,
        features: Object.values(FEATURES),
        customDomain: true
    },
    custom: {
        id: "custom",
        name: "Custom",
        priceMonthly: null,
        maxUsers: null,
        features: Object.values(FEATURES),
        configurable: true,
        customDomain: true
    }
};

const ACTIVE_STATUSES = new Set(["trialing", "active", "grace"]);
const RESERVED_HOSTS = new Set([
    "anchan31",
    "access",
    "app",
    "candidate",
    "careers",
    "core",
    "hire",
    "perform",
    "share",
    "space",
    "workcosmo",
    "www",
    "localhost",
    "127"
]);

/** Hostnames with no tenant slug in the first label (path/query carry tenant instead). */
const APEX_HOSTS = new Set([
    "anchan31.github.io",
    "www.anchan31.github.io",
    "workcosmo.in",
    "www.workcosmo.in",
    "app.workcosmo.in",
    "www.app.workcosmo.in",
    "space.workcosmo.in",
    "www.space.workcosmo.in",
    "hire.workcosmo.in",
    "www.hire.workcosmo.in",
    "core.workcosmo.in",
    "www.core.workcosmo.in",
    "perform.workcosmo.in",
    "www.perform.workcosmo.in",
    "ai.workcosmo.in",
    "www.ai.workcosmo.in"
]);

const TENANT_QUERY_KEYS = ["companyId", "company", "cid", "clientId", "subdomain"];
const PRODUCT_HOSTS = new Set(["hire", "core", "perform", "ai"]);
const PATH_RESERVED_SEGMENTS = new Set([
    "",
    "app",
    "api",
    "assets",
    "careers",
    "css",
    "index.html",
    "js",
    "share",
    "space",
    "src"
]);

const MODULE_PERMISSIONS = {
    [FEATURES.recruitModule]: [PERMISSIONS.fullAccess, PERMISSIONS.manageJobs, PERMISSIONS.manageCandidates, PERMISSIONS.readOnly],
    [FEATURES.careerPortal]: [PERMISSIONS.fullAccess, PERMISSIONS.manageJobs, PERMISSIONS.readOnly],
    [FEATURES.shareProfile]: [PERMISSIONS.fullAccess, PERMISSIONS.shareProfiles],
    [FEATURES.qrBridgeLogin]: [PERMISSIONS.fullAccess, PERMISSIONS.useQrBridgeLogin]
};

export function normalizeClientId(value = "") {
    return value.toString().toLowerCase().trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w-]+/g, "")
        .replace(/--+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "");
}

export function getTenantFromQuery() {
    const params = new URLSearchParams(window.location.search);
    for (const key of TENANT_QUERY_KEYS) {
        const value = params.get(key);
        if (value) return normalizeClientId(value);
    }
    return "";
}

export function getTenantFromHost() {
    const host = window.location.hostname.toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1") return "";
    if (APEX_HOSTS.has(host)) return "";

    const parts = host.split(".");
    if (parts.length < 3) return "";

    const subdomain = normalizeClientId(parts[0]);
    return RESERVED_HOSTS.has(subdomain) ? "" : subdomain;
}

export function getTenantFromPath() {
    const host = window.location.hostname.toLowerCase();
    const firstHostLabel = normalizeClientId(host.split(".")[0] || "");
    const isProductHost = PRODUCT_HOSTS.has(firstHostLabel);
    const firstSegment = normalizeClientId(window.location.pathname.split("/").filter(Boolean)[0] || "");

    if (!firstSegment || PATH_RESERVED_SEGMENTS.has(firstSegment)) return "";
    if (isProductHost || host === "localhost" || host === "127.0.0.1") return firstSegment;
    return "";
}

/**
 * Resolve workspace client ID: subdomain host, then URL params, then session/input.
 */
export function resolveTenantClientId(options = {}) {
    const { includeSession = true, includeInput = false } = options;

    const fromHost = getTenantFromHost();
    if (fromHost) return fromHost;

    const fromQuery = getTenantFromQuery();
    if (fromQuery) return fromQuery;

    const fromPath = getTenantFromPath();
    if (fromPath) return fromPath;

    if (includeSession) {
        const stored = normalizeClientId(sessionStorage.getItem("tenant_client_id") || "");
        if (stored) return stored;
    }

    if (includeInput) {
        const inputVal = normalizeClientId(document.getElementById("auth-client-id")?.value || "");
        if (inputVal) return inputVal;
    }

    return "";
}

export function canAddWorkspaceUser(company, subscription, activeUserCount) {
    const limits = resolvePlanLimits(subscription, company);
    const maxUsers = Number(limits.maxUsers || 1);
    if (activeUserCount >= maxUsers) {
        return {
            allowed: false,
            reason: `User limit reached (${activeUserCount}/${maxUsers}) for your ${limits.plan} plan.`,
            maxUsers,
            activeUserCount
        };
    }
    return { allowed: true, reason: "", maxUsers, activeUserCount };
}

export function resolvePlanLimits(subscription, company) {
    subscription = subscription || {};
    company = company || {};

    const plan = PLAN_CATALOG[subscription.plan || company.plan] || PLAN_CATALOG.starter;
    const customLimits = subscription.customLimits || company.customLimits || {};
    const customFeatures = subscription.customFeatures || company.features;

    return {
        plan: plan.id,
        maxUsers: Number(customLimits.maxUsers || subscription.maxUsers || company.maxUsers || plan.maxUsers || 1),
        features: Array.isArray(customFeatures) && customFeatures.length ? customFeatures : plan.features,
        priceMonthly: customLimits.priceMonthly ?? subscription.priceMonthly ?? plan.priceMonthly
    };
}

export function isSubscriptionUsable(subscription, company = null) {
    if (!subscription) {
        return company?.status === "active";
    }
    if (!ACTIVE_STATUSES.has(subscription.status)) return false;

    const expiry = subscription.currentPeriodEnd || subscription.trialEndsAt || subscription.expiresAt;
    if (!expiry) return true;

    const expiryDate = expiry.seconds ? new Date(expiry.seconds * 1000) : new Date(expiry);
    if (Number.isNaN(expiryDate.getTime())) return true;

    const graceDays = Number(subscription.gracePeriodDays || 0);
    const accessUntil = new Date(expiryDate);
    accessUntil.setDate(accessUntil.getDate() + graceDays);
    return accessUntil >= new Date();
}

export function blockedReason(subscription) {
    if (!subscription) return "No active subscription is linked to this workspace.";
    if (!ACTIVE_STATUSES.has(subscription.status)) return `Subscription status is ${subscription.status}.`;
    if (!isSubscriptionUsable(subscription)) return "Subscription period has expired.";
    return "This module is not enabled for this workspace.";
}

export async function loadCompanyByClientId(db, clientId) {
    const normalized = normalizeClientId(clientId);
    if (!normalized) return null;

    const direct = await getDoc(doc(db, "companies", normalized));
    if (direct.exists()) return { id: direct.id, ...direct.data() };

    for (const field of ["companyId", "clientId", "subdomain"]) {
        const snap = await getDocs(query(collection(db, "companies"), where(field, "==", normalized), limit(1)));
        if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    return null;
}

export async function loadTenantAccess(db, clientId) {
    const company = await loadCompanyByClientId(db, clientId);
    if (!company) {
        return { allowed: false, company: null, subscription: null, reason: "Workspace not found." };
    }

    const subscriptionId = company.subscriptionId;
    let subscription = null;
    if (subscriptionId) {
        try {
            const subscriptionSnap = await getDoc(doc(db, "subscriptions", subscriptionId));
            if (subscriptionSnap?.exists()) {
                subscription = { id: subscriptionSnap.id, ...subscriptionSnap.data() };
            }
        } catch (err) {
            if (err.code === "permission-denied" || err.message?.includes("permission-denied")) {
                console.warn("Public portal cannot read subscription document; falling back to company metadata.", err.message || err);
                subscription = null;
            } else {
                throw err;
            }
        }
    }

    if (company.status !== "active") {
        return { allowed: false, company, subscription, reason: "Workspace is inactive." };
    }
    if (!isSubscriptionUsable(subscription, company)) {
        return { allowed: false, company, subscription, reason: blockedReason(subscription) };
    }

    return { allowed: true, company, subscription, reason: "" };
}

export function tenantHasFeature(company, subscription, featureKey) {
    if (!company || company.status !== "active" || !isSubscriptionUsable(subscription, company)) return false;
    if (featureKey === FEATURES.recruitModule && !isModuleEnabled(company, "hire")) return false;
    return resolvePlanLimits(subscription, company).features.includes(featureKey);
}

export async function verifyTenantModule(db, clientId, featureKey) {
    const access = await loadTenantAccess(db, clientId);
    if (!access.allowed) return access;
    if (!tenantHasFeature(access.company, access.subscription, featureKey)) {
        return { ...access, allowed: false, reason: blockedReason(access.subscription) };
    }
    return access;
}

export function userBelongsToTenant(userProfile, clientId) {
    const requested = normalizeClientId(clientId);
    const actual = normalizeClientId(userProfile?.companyId || userProfile?.clientId || userProfile?.subdomain);
    return Boolean(requested && actual && requested === actual);
}

export function roleCanAccessModule(role, featureKey) {
    const permissions = MODULE_PERMISSIONS[featureKey] || [PERMISSIONS.fullAccess];
    return permissions.some((permission) => hasPermission(role, permission));
}

export async function verifyUserModuleAccess(db, userProfile, clientId, featureKey) {
    if (!userProfile || userProfile.status !== "active") {
        return { allowed: false, reason: "Your account is inactive or not provisioned." };
    }
    if (!userBelongsToTenant(userProfile, clientId)) {
        return { allowed: false, reason: "This login does not belong to this workspace." };
    }

    const access = await verifyTenantModule(db, clientId, featureKey);
    if (!access.allowed) return access;

    if (!roleCanAccessModule(userProfile.role, featureKey)) {
        return { ...access, allowed: false, reason: "Your role cannot access this module." };
    }

    return access;
}
