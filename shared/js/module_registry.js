export const WORKCOSMO_MODULES = Object.freeze([
    {
        key: "hire",
        productName: "Workcosmo Hire",
        shortName: "CosmoHire",
        label: "Hire",
        description: "Recruitment, jobs, candidates, interviews, offers, and hiring analytics.",
        icon: "fa-users-rays",
        subdomain: "hire",
        featureKey: "recruitModule",
        status: "live"
    },
    {
        key: "core",
        productName: "Workcosmo Core",
        shortName: "CosmoCore",
        label: "Core",
        description: "Employee records, HR operations, documents, and company lifecycle data.",
        icon: "fa-id-card-clip",
        subdomain: "core",
        featureKey: "coreModule",
        status: "planned"
    },
    {
        key: "perform",
        productName: "Workcosmo Perform",
        shortName: "CosmoPerform",
        label: "Perform",
        description: "Goals, performance cycles, reviews, and manager feedback workflows.",
        icon: "fa-chart-line",
        subdomain: "perform",
        featureKey: "performModule",
        status: "planned"
    }
]);

export function getModuleByKey(key) {
    return WORKCOSMO_MODULES.find((mod) => mod.key === key) || null;
}

export function isModuleEnabled(company, moduleKey) {
    if (!company) return false;
    const modulesEnabled = company.modulesEnabled || {};
    if (Object.prototype.hasOwnProperty.call(modulesEnabled, moduleKey)) {
        return modulesEnabled[moduleKey] === true;
    }
    if (moduleKey === "hire") {
        const features = Array.isArray(company.features) ? company.features : [];
        return features.includes("recruitModule") || company.status === "active";
    }
    return false;
}

export function buildModuleUrl(moduleKey, companyId) {
    const mod = getModuleByKey(moduleKey);
    const cid = encodeURIComponent(companyId || "");
    if (!mod || !cid) return "#";

    const host = window.location.hostname.toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";
    if (isLocal) {
        if (moduleKey === "hire") return `/app/index.html?companyId=${cid}`;
        return `/${mod.subdomain}/index.html?companyId=${cid}`;
    }

    return `https://${mod.subdomain}.workcosmo.in/${cid}`;
}
