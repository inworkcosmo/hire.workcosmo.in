import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { normalizeClientId, verifyUserModuleAccess } from "../../app/js/access_control.js";

export function profileCompanyId(profile) {
    return normalizeClientId(profile?.companyId || profile?.clientId || profile?.subdomain || "");
}

export async function loadUserProfile(db, uid) {
    if (!uid) return null;
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function loadCompanyProfile(db, companyId) {
    const cid = normalizeClientId(companyId);
    if (!cid) return null;

    const direct = await getDoc(doc(db, "companies", cid));
    if (direct.exists()) return { id: direct.id, ...direct.data() };

    const snap = await getDocs(query(collection(db, "companies"), where("companyId", "==", cid), limit(1)));
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function requireActiveWorkspace(db, user, moduleFeatureKey = null, requestedCompanyId = "") {
    if (!user || user.isAnonymous) {
        return { allowed: false, reason: "Please sign in from Workcosmo Space.", profile: null, company: null };
    }

    const profile = await loadUserProfile(db, user.uid);
    if (!profile || profile.status !== "active") {
        return { allowed: false, reason: "Your account is inactive or not provisioned.", profile, company: null };
    }

    const companyId = normalizeClientId(requestedCompanyId || profileCompanyId(profile));
    if (!companyId) {
        return { allowed: false, reason: "No workspace is linked to this account.", profile, company: null };
    }

    if (moduleFeatureKey) {
        const moduleAccess = await verifyUserModuleAccess(db, profile, companyId, moduleFeatureKey);
        if (!moduleAccess.allowed) {
            return { allowed: false, reason: moduleAccess.reason || "This module is not enabled.", profile, company: moduleAccess.company || null };
        }
        return { allowed: true, reason: "", profile, company: moduleAccess.company, subscription: moduleAccess.subscription || null };
    }

    const company = await loadCompanyProfile(db, companyId);
    if (!company || company.status !== "active") {
        return { allowed: false, reason: "Workspace is inactive or unavailable.", profile, company };
    }
    return { allowed: true, reason: "", profile, company, subscription: null };
}
