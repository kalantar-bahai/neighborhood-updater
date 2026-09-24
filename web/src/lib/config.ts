// Confirmed with cluster-notebook 2026-09-24: only protagonist/promoter are informal
// (freely assignable whenever canAssignRoles is true) -- cluster-notebook's own open
// question (their issue #14), not something this app decides. EVERY other role string
// (accompanier/contact/abm-assistant, and any recognized role cluster-notebook adds
// later like ATC/ATC-Collaborator/CIC/CSO) is a real grant and requires that role name
// to appear in the assigner's PermissionSet.assignableRoles. Named this way (the small,
// fixed informal set) rather than naming recognized roles, because this route accepts
// any role string -- naming recognized roles would silently fail-open for any real role
// cluster-notebook adds that isn't in a hardcoded list here.
export const INFORMAL_WORKER_TYPES = ['protagonist', 'promoter'] as const;
