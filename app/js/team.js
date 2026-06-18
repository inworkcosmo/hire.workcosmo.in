/**
 * Multi-user collaboration helpers (ownership, assignment, labels).
 */
import { auth } from "./firebase_config.js";
import * as perm from "./permissions.js";

export function getUserDisplayName(userId, directory = []) {
    if (!userId) return "Unassigned";
    const row = directory.find((u) => u.id === userId);
    return row?.displayName || row?.email || "Teammate";
}

export function formatTeamResponsibility(doc, directory = []) {
    const ownerName = getUserDisplayName(doc?.ownerId, directory);
    const assigneeNames = (Array.isArray(doc?.assignedTo) ? doc.assignedTo : [])
        .map((id) => getUserDisplayName(id, directory))
        .filter((n) => n && n !== "Unassigned");
    const unique = [...new Set(assigneeNames)];
    return { ownerName, assigneeNames: unique };
}

export function teamResponsibilityHtml(doc, directory = []) {
    const { ownerName, assigneeNames } = formatTeamResponsibility(doc, directory);
    const assigneeText = assigneeNames.length
        ? assigneeNames.join(", ")
        : "None";
    return `<div class="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
        <span class="font-bold text-slate-600 dark:text-slate-300">Owner:</span> ${ownerName}
        <span class="mx-1">·</span>
        <span class="font-bold text-slate-600 dark:text-slate-300">Team:</span> ${assigneeText}
    </div>`;
}

export function teamActionButtonsHtml(collection, docId, doc, role) {
    if (!perm.isWriter(role) || !docId) return "";
    const uid = auth.currentUser?.uid;
    const isOwner = doc?.ownerId === uid;
    const isAssigned = Array.isArray(doc?.assignedTo) && doc.assignedTo.includes(uid);
    const canTake = perm.canTakeOwnership(role, doc, uid);
    const canAssign = perm.canAssignTeam(role);

    const parts = [];
    if (canTake && !isOwner) {
        parts.push(`<button type="button" onclick="takeRecordOwnership('${collection}','${docId}')" class="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-bold" title="Become owner">Take ownership</button>`);
    }
    if (canAssign && !isAssigned) {
        parts.push(`<button type="button" onclick="assignRecordToMe('${collection}','${docId}')" class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold" title="Add yourself to the team">Join task</button>`);
    }
    if (!parts.length) return "";
    return `<div class="flex flex-wrap gap-1 mt-1">${parts.join("")}</div>`;
}

export function canModifyRecord(role, doc, uid = auth.currentUser?.uid) {
    if (!perm.isWriter(role)) return false;
    if (perm.isManagerUp(role)) return true;
    return perm.canReadOwnedDoc(role, doc, uid);
}
