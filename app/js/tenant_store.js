/**
 * Company-scoped Firestore helpers for the RMS app.
 * Every tenant document must carry `companyId` matching the signed-in workspace.
 */
import { auth, serverTimestamp, collection, query, where, limit } from "./firebase_config.js";

/** Collections that store tenant-owned records (top-level, keyed by companyId). */
export const TENANT_COLLECTIONS = Object.freeze({
    jobs: "jobs",
    candidates: "candidates",
    interviews: "interviews",
    offers: "offers",
    offerTemplates: "offerTemplates",
    whatsappTemplates: "whatsappTemplates",
    masters_departments: "masters_departments",
    masters_designations: "masters_designations",
    masters_industries: "masters_industries",
    masters_sources: "masters_sources",
    presence: "presence"
});

let resolveProfile = () => null;

/** Bind live user profile (called from script.js). */
export function bindTenantProfile(getter) {
    resolveProfile = typeof getter === "function" ? getter : () => null;
}

export function getActiveCompanyId() {
    const profile = resolveProfile();
    const raw = profile?.companyId || profile?.clientId || profile?.subdomain;
    return raw ? String(raw).trim() : "";
}

export function requireActiveCompanyId() {
    const cid = getActiveCompanyId();
    if (!cid) {
        throw new Error("No active workspace. Sign in with your company Client ID.");
    }
    return cid;
}

export function docBelongsToCompany(data, companyId = getActiveCompanyId()) {
    if (!data || !companyId) return false;
    const onDoc = data.companyId || data.clientId || data.subdomain;
    return String(onDoc || "").trim() === companyId;
}

/** Attach companyId to any write payload. */
export function withCompanyId(extra = {}, companyId = getActiveCompanyId()) {
    const cid = companyId || requireActiveCompanyId();
    return { ...extra, companyId: cid };
}

export function stampMasterCreate(extra = {}) {
    const uid = auth.currentUser?.uid;
    return {
        ...withCompanyId(extra),
        createdBy: uid || null,
        createdAt: serverTimestamp(),
        updatedBy: uid || null,
        updatedAt: serverTimestamp()
    };
}

export function stampMasterUpdate(extra = {}) {
    const uid = auth.currentUser?.uid;
    return {
        ...extra,
        updatedBy: uid || null,
        updatedAt: serverTimestamp()
    };
}

/** Firestore query filtered to the active company. */
export function companyQuery(db, collectionName, extraConstraints = [], companyId = getActiveCompanyId()) {
    const cid = companyId || requireActiveCompanyId();
    return query(
        collection(db, collectionName),
        where("companyId", "==", cid),
        ...extraConstraints
    );
}

/** Settings doc id per company (portal / integrations). */
export function companySettingsDocId(companyId = getActiveCompanyId()) {
    const cid = companyId || requireActiveCompanyId();
    return `publicPortal_${cid}`;
}

export function assertDocBelongsToCompany(data, collectionName = "") {
    if (!docBelongsToCompany(data)) {
        throw new Error(
            collectionName
                ? `This ${collectionName} record belongs to another workspace.`
                : "This record belongs to another workspace."
        );
    }
}
