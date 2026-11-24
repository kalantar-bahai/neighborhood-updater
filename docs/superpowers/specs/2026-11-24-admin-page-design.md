# Admin page (design)

Status: draft for owner review, 2026-11-24.
Backend: cluster-notebook admin API (SDL agreed 2026-11-24, below; not yet built).

## Intent

Today, giving someone access to Nucleus Assistant needs an administrator with SSH access to cluster-notebook:
a Clerk invitation alone leaves the new account with "Access denied", because nothing links the login to a
person. Role changes are possible only one nucleus at a time, and hidden people have nowhere to be reviewed.
The Admin page gives CSOs and Administrators one place to bring people in, see and change what they can do,
review hidden people, and see what changed, without leaving the app.

## Decisions (owner, 2026-11-23 and 2026-11-24)

- **Who:** a CSO, for the cluster(s) they hold CSO in (and below); an Administrator, for everything. Nobody else
  sees the page or its link.
- **Reached from the home page** ("My Nuclei"), by a link shown only to those people.
- **Cards:** Invite, Hidden people, Roles, Accounts, People not in SRP (a list for now), Log (raw for now).
  Later, not in this design: Clerk Waitlist approval (people ask for an account), editing not-in-SRP people
  and sending them to SRP, archiving.
- **cluster-notebook owns invitations end to end:** permission check, calling Clerk, recording, linking the
  login at first sign-in, logging. This app stays a thin front end with no database (approach A below).
- **One email is one person**, as in SRP. An invitation to an address that another person has, or that is on
  another person's pending or accepted invitation, is refused.
- **The login email is not the contact email.** It lives only on the invitation (sent to, by whom, when). It is
  never written into the person's emails, which come from SRP. The Accounts card shows the invitation's email.
- **Role granted at acceptance.** An invitation that is never accepted gives nothing.
- **Remove access** disables the link and blocks that login in Clerk (reversible). Roles stay unless the CSO
  also chooses to end them.
- **Replace account:** someone who lost their login is re-invited with a new address; on acceptance the old
  login is disabled and the new one linked. Roles stay with the person.
- **Logging:** every change is already recorded by cluster-notebook (who, when, what, before and after); admin
  actions are recorded the same way. The Log card shows that record, raw, to CSOs and Administrators only.
- **Clerk:** Invite-only now, Waitlist later. Google sign-in now, others later. Password reset and changing
  sign-in email are Clerk's, through its own screens.

## Approaches

1. **cluster-notebook does invitations end to end** (chosen). One call from the Invite card; permission,
   Clerk, record and log in one place, beside the permissions and the change log. Costs: cluster-notebook
   holds Clerk's secret key and does most of the new work.
2. Our app calls Clerk, cluster-notebook only links at first sign-in. We already hold the key, but the
   permission check and the record would split across two systems, and an invitation could succeed in Clerk
   and fail in cluster-notebook.

Build order, chosen: **Phase 1** the page, Hidden people, Roles. **Phase 2** Invite, Accounts. **Phase 3** People
not in SRP, Log. Phase 1 needs the least from cluster-notebook and can start first; Invite waits on Phase 2.

## The page

`/admin`, its own address (back button and bookmarks work). Same look as the rest of the app: collapsible cards,
phone first. At the top, a cluster selector when the person administers more than one cluster (Administrators
see all). Every card works within the selected cluster. Someone without admin rights who opens the address
sees "Access denied" and a link home.

### Finding a person (shared by Invite and Roles)

A search box like the People card's "+ Add" ("Find a person in this cluster…"). Each result shows what tells
same-named people apart:

```
Ana Lopez · Adult · NC-215 Triangle › Chapel Hill › Northside   [has access]
Ana Lopez · Youth · NC-215 Triangle › Carrboro                   [invited]
```

Picking one shows that person's details as the People card shows them (Details section), their place path, and
their roles. "invited" appears only once Phase 2 is deployed.

### Roles card (Phase 1)

Pick a person; their current roles are listed, each with where it applies and a 🗑:

```
Ana Lopez
  CSO · NC-215 Triangle            🗑
  Contact ★ · Northside            🗑
  [+ role]
```

"+ role": choose where (cluster, locality, setting or nucleus in the selected cluster), then a role from those
the admin may assign there; Save. 🗑 asks "End Ana Lopez's CSO role at NC-215 Triangle?" then ends it. Ending
one's own last admin role is refused with a clear message.

### Hidden people card (Phase 1)

Every hidden person in the cluster: name, the nucleus they're hidden from, "Hidden by Ben Okafor on 2026-11-23:
moved away". Each row: **Unhide**, **Move…** (change their nucleus or setting, the People card's move), and
**Archive** (shown, disabled, "coming later").

### Invite card (Phase 2)

Pick a person (above). Email: prefilled with the person's first email from their details, editable. Role and
where (optional; as in "+ role"). Expires in: 30 days default, editable. **Invite**. Refusals show in words:
"This address belongs to someone else.", "Ana Lopez already has access. Replace their login?" (then invites
with replace), "An invitation is already pending; resend it instead."

Below, invitations in the cluster: person, email, role, invited by, sent, expires, status (pending, accepted,
expired, cancelled). Pending ones have **Resend** (cancels the old one and sends a new one) and **Cancel**.

### Accounts card (Phase 2)

Everyone in the cluster who can sign in: person, the invitation's email, since, last seen. **Remove access…**
confirms, with a tick box "Also end their roles". Removed accounts stay listed, greyed, with the date.

### People not in SRP (Phase 3)

A list: name, place, created when and by whom. Nothing else yet.

### Log (Phase 3)

Newest first, 100 at a time with "Older". Each entry: when, who, what (the change's name), on what, and the
raw before/after. Admins only.

## Also in this work

- A **My account** link in the app's menu, opening Clerk's profile screen, where people manage their own
  sign-in (add an email or Google account, password where enabled).

## What we need from cluster-notebook (agreed 2026-11-24)

```graphql
# Phase 1
type Query {
  isAdministrator: Boolean!                       # exists
  adminClusters: [Cluster!]!                      # all for Administrator; CSO: clusters at/below their role
  me: PersonSummary
  searchPeople(clusterName: String!, search: String!, limit: Int = 20): [AdminPerson!]!   # Admin or CSO of cluster
  individualRoles(individualId: String!): [RoleHolding!]!   # the roles the caller may see
  personDetails(individualId: String!, nucleusName: String = null): PersonDetails   # no nucleus: Admin or CSO of the person's cluster
  hiddenPeople(clusterName: String!): [HiddenPerson!]!      # exists: individual nucleusName roles isResident hide { hiddenAt hiddenBy reason }
  adminPlaces(clusterName: String!): [AdminPlace!]!          # the cluster and every locality, setting, live nucleus under it; parents first
  assignableRolesAt(entityId: String!): [RoleGrant!]!        # exactly grantRole's gate
}
type AdminPlace { id: String!  name: String!  type: String!  parentId: String  parentName: String }   # type: cluster|locality|setting|nucleus
# Cluster, Locality, Setting and Nucleus gain id: String! (Location and PersonSummary.place already have it).
type AdminPerson { individual: PersonSummary!  ageCategory: String  placePath: [String!]!  hasAccess: Boolean!
                   pendingInvitation: Invitation }          # pendingInvitation arrives with Phase 2
type RoleHolding { id: String!  role: String!  entity: Location  start: Date }   # entity null for Administrator
type Mutation {
  grantRole(individualId: String!, role: String!, entityId: String!): RoleHolding!   # gated like assignableRoles; held: unchanged
  endRole(roleId: String!): Boolean!               # SELF_LOCKOUT for the caller's own last admin role
  moveIndividuals(...)                             # exists
  unhideIndividual(individualId: String!, nucleusName: String!): NucleusPerson   # exists
}
# Phase 2
type Mutation {
  inviteIndividual(individualId: String!, email: String!, role: String, entityId: String,
                   expiresInDays: Int = 30, replaceExisting: Boolean = false): Invitation!
  resendInvitation(id: String!): Invitation!       # cancels the old one in Clerk, makes a new one
  revokeInvitation(id: String!): Invitation!
  removeAccess(individualId: String!, endRoles: Boolean = false): Boolean!
}
type Query {
  invitations(clusterName: String!, status: InvitationStatus): [Invitation!]!
  accounts(clusterName: String!): [AccountInfo!]!
}
enum InvitationStatus { PENDING ACCEPTED EXPIRED REVOKED }
type Invitation { id: String!  individual: PersonSummary!  email: String!  role: String  entity: Location
                  status: InvitationStatus!  invitedBy: PersonSummary  createdAt: DateTime!  expiresAt: DateTime!
                  acceptedAt: DateTime  replacedBy: String }
type AccountInfo { individual: PersonSummary!  email: String  provider: String!
                   createdAt: DateTime!  lastSeenAt: DateTime  disabledAt: DateTime }
# Phase 3
type Query {
  peopleNotInSrp(clusterName: String!): [AdminPerson!]!
  changeLog(clusterName: String!, before: DateTime, limit: Int = 100): [LogEntry!]!
}
type LogEntry { occurredAt: DateTime!  actor: PersonSummary  mutation: String
                entityType: String!  entityId: String!  changeType: String!  changes: JSON! }
```

- adminClusters: clusters at or below each current CSO role (a CSO role above a cluster covers every cluster
  under it), or all for an Administrator. Cheap enough for every home-page load; empty means no Admin link.
- A CSO (at the cluster or above) and an Administrator can unhide and move anyone in the cluster with no role
  at the nucleus: they inherit WRITE down from the cluster.
- SELF_LOCKOUT fires only when ending the caller's own last role giving admin standing over that cluster (last
  Administrator, or last CSO covering it).
- Names such as "Chapel Hill" repeat, so roles and places are chosen by id. Nuclei stay keyed by name elsewhere.
- Error codes to show in words: `FORBIDDEN`, `SELF_LOCKOUT`, `EMAIL_IN_USE`, `ALREADY_HAS_ACCESS`,
  `INVITATION_PENDING`.
- Invitations: cluster-notebook records the invitation, then calls Clerk with the invitation id in the
  invitation's public metadata, redirect https://nucleus.kalantar.us. At first sign-in, a login it doesn't know
  whose token carries a pending, unexpired invitation id is linked to that person, and the role granted.
  No email matching.
- **Owner setup before Phase 2:** the Clerk secret key as a Render secret on cluster-notebook's API service;
  in Clerk, the session token gets the claim `"inv": "{{user.public_metadata.invitation_id}}"`.

## Rules for the builder

- Ask for a new field only after cluster-notebook says it is deployed to production (a field asked for too
  early breaks the whole query; this took the People card down on 2026-11-23). Each phase's queries go in only
  when that phase is live.
- Every route checks Clerk sign-in, then that cluster-notebook gives admin rights for the cluster, and catches
  errors through `clusterNotebookErrorResponse`. cluster-notebook enforces too.
- Decisions go in `lib/` with Vitest tests (search result line, role line, invitation status words, error
  wording). There is no component test setup; check the UI in the browser.
- Made-up names only, in tests and docs (public repo).

## Testing with a second login (now, before Phase 2)

1. In the People card, "+ Add" → Create "Test SecondAccount" (stays in cluster-notebook, never sent to SRP).
2. cluster-notebook's admin tool: `link-account` the second login to that person, then `grant-role`.
3. Sign in with the second login in a private window; check what it sees.
4. Once Phase 1 is live: change its roles from the Roles card with your main login and watch the effect.
   Once Phase 2 is live: invite, resend, cancel, remove access and replace account with it end to end.

## Non-goals and anti-goals

- No archive, no Waitlist approval, no editing or SRP push for not-in-SRP people, no "view as".
- No email matching to link logins; no login email written into SRP data.
- Anti-goal: anyone but a CSO (for their clusters) or an Administrator seeing the page, the log or anyone's
  invitation email.
- Anti-goal: an admin locking themselves out.

## Builder's calls (Claude, 2026-11-24)

- The Admin link shows when adminClusters is non-empty (Administrators get every cluster).
- The "+ role" place picker lists adminPlaces as an indented tree with a filter box; the role list comes from
  assignableRolesAt for the chosen place.
- Phase 1 ships when cluster-notebook says its Phase 1 fields are in production, not before.

## Left to the builder

Component structure; how the cluster selector looks; empty states; wording of confirms not given above.
