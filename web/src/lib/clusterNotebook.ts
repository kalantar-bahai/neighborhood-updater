const CLUSTER_NOTEBOOK_URL = process.env.CLUSTER_NOTEBOOK_URL || 'http://localhost:8000';

export interface DevotionalGathering {
  number: number | null;
  participants: number | null;
  participantsFof: number | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(CLUSTER_NOTEBOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`cluster-notebook request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`cluster-notebook GraphQL error: ${json.errors.map(e => e.message).join('; ')}`);
  }
  if (json.data === undefined) {
    throw new Error('cluster-notebook response contained neither data nor errors');
  }
  return json.data as T;
}

export interface ClusterFields {
  name: string;
  groupOfClusters: string | null;
  growthMilestone: string | null;
  // Plain text, comma-separated "<Name> (<Portfolio>)" entries, sourced from SRP.
  // Read-only, no mutation -- same precedent as groupOfClusters/growthMilestone.
  // Per-person Individual/RoleInNE linkage is explicitly deferred on cluster-notebook's side.
  auxiliaryBoardMembers: string | null;
}

export interface NucleusFields {
  stage: string | null;
  locality: string | null;
  populationMakeup: string | null;
  population: number | null;
  households: number | null;
  connectedPopulation: number | null;
  connectedHouseholds: number | null;
  hasSocialAction: boolean | null;
  socialActionDescription: string | null;
  hasCommunityGatherings: boolean | null;
  communityGatheringDescription: string | null;
  narrative: string | null;
  // Read-only, no mutation on cluster-notebook's side for any of these three —
  // every Nucleus is guaranteed a Cluster (non-null), per cluster-notebook 2026-09-13.
  cluster: ClusterFields;
  // Writable, but only meaningfully so when the nucleus has no `location`: when a
  // location IS set, this always reads "Neighborhood" regardless of what's stored
  // or written (cluster-notebook 2026-09-13). By design, not a bug -- Network/
  // Population nuclei aren't location-bound, so they naturally take the settable path.
  nucleusType: string | null;
}

// Deliberately not `extends NucleusFields` — the picker (getAllNuclei's caller)
// doesn't need population/households/connected*, and its query below doesn't
// request them, so keep this decoupled from NucleusFields' full shape.
export interface NucleusSummary {
  name: string;
  stage: string | null;
  locality: string | null;
  populationMakeup: string | null;
  nucleusType: string | null;
  devotionalGathering: DevotionalGathering | null;
}

export async function getAllNuclei(): Promise<NucleusSummary[]> {
  const query = `
    query GetAllNuclei {
      nuclei {
        name stage locality populationMakeup nucleusType
        devotionalGathering { number participants participantsFof }
      }
    }
  `;
  const data = await request<{ nuclei: NucleusSummary[] }>(query, {});
  return data.nuclei;
}

const NUCLEUS_FIELDS_SELECTION = 'stage locality populationMakeup population households connectedPopulation connectedHouseholds '
  + 'hasSocialAction socialActionDescription hasCommunityGatherings communityGatheringDescription narrative nucleusType '
  + 'cluster { name groupOfClusters growthMilestone auxiliaryBoardMembers }';

export async function getNucleusFields(nucleusName: string): Promise<NucleusFields | null> {
  const query = `
    query GetNucleusFields($name: String!) {
      nucleus(name: $name) { ${NUCLEUS_FIELDS_SELECTION} }
    }
  `;
  const data = await request<{ nucleus: NucleusFields | null }>(query, { name: nucleusName });
  return data.nucleus;
}

export async function updateNucleus(
  nucleusName: string,
  // NOTE: no `locality` here — REMOVED from NucleusPatch 2026-09-13. `locality`
  // is now a read-only derived value (walked up from Nucleus.location's own
  // containment chain), not a hand-entered field; cluster-notebook has no
  // write path for it at all right now (setting `location` isn't wired up
  // either). It's still readable via NucleusFields/getNucleusFields/getAllNuclei.
  patch: {
    stage?: string; populationMakeup?: string;
    population?: number | null; households?: number | null;
    connectedPopulation?: number | null; connectedHouseholds?: number | null;
    hasSocialAction?: boolean | null; socialActionDescription?: string;
    hasCommunityGatherings?: boolean | null; communityGatheringDescription?: string;
    narrative?: string;
    nucleusType?: string;
  }
): Promise<NucleusFields | null> {
  const mutation = `
    mutation UpdateNucleus($name: String!, $patch: NucleusPatch!) {
      updateNucleus(name: $name, patch: $patch) {
        ${NUCLEUS_FIELDS_SELECTION}
      }
    }
  `;
  const data = await request<{ updateNucleus: NucleusFields | null }>(mutation, { name: nucleusName, patch });
  if (data.updateNucleus === null) {
    throw new Error(`cluster-notebook has no nucleus named "${nucleusName}" — nucleus fields not saved`);
  }
  return data.updateNucleus;
}

export async function getDevotionalGathering(nucleusName: string): Promise<DevotionalGathering | null> {
  const query = `
    query GetNucleusDevotionalGathering($name: String!) {
      nucleus(name: $name) {
        devotionalGathering { number participants participantsFof }
      }
    }
  `;
  const data = await request<{ nucleus: { devotionalGathering: DevotionalGathering | null } | null }>(
    query,
    { name: nucleusName }
  );
  return data.nucleus?.devotionalGathering ?? null;
}

export async function updateDevotionalGathering(
  nucleusName: string,
  fields: { number?: number | null; participants?: number | null; participantsFof?: number | null }
): Promise<DevotionalGathering | null> {
  // updateDevotionalGathering was removed 2026-09-13 in favor of one shared
  // mutation across all four activity types — see cluster-notebook/schema.graphql.
  const mutation = `
    mutation UpdateDevotionalGathering($nucleusName: String!, $number: Int, $participants: Int, $participantsFof: Int) {
      updateActivitySummary(
        nucleusName: $nucleusName, activityType: DEVOTIONAL_GATHERING,
        number: $number, participants: $participants, participantsFof: $participantsFof
      ) {
        devotionalGathering { number participants participantsFof }
      }
    }
  `;
  const data = await request<{ updateActivitySummary: { devotionalGathering: DevotionalGathering | null } | null }>(
    mutation,
    {
      nucleusName,
      number: fields.number ?? null,
      participants: fields.participants ?? null,
      participantsFof: fields.participantsFof ?? null,
    }
  );
  if (data.updateActivitySummary === null) {
    throw new Error(`cluster-notebook has no nucleus named "${nucleusName}" — devotional gathering not saved`);
  }
  return data.updateActivitySummary.devotionalGathering ?? null;
}

export interface Individual {
  id: string;
  firstName: string | null;
  familyName: string | null;
  middleNames: string | null;
  nickname: string | null;
  sex: string | null;
  phone: string | null;
  email: string | null;
  ageCategory: string | null;
}

const INDIVIDUAL_SELECTION = 'id firstName familyName middleNames nickname sex phone email ageCategory';

// Simple display-name composition -- cluster-notebook's Individual already has
// firstName/middleNames/familyName/nickname as separate fields (unlike SRP's own
// single-string convention), so no parsing needed, just a readable join.
export function individualDisplayName(ind: Individual): string {
  const parts = [ind.firstName, ind.middleNames, ind.familyName].filter(Boolean);
  const name = parts.join(' ') || '(unnamed)';
  return ind.nickname ? `${name} (${ind.nickname})` : name;
}

// PII-scoped to the cluster containing nucleusName (via existing role assignments) --
// never notebook-wide. `search` is optional token matching across name fields; pass
// undefined/omit for no filter (still scoped to the cluster).
export async function searchIndividuals(nucleusName: string, search?: string): Promise<Individual[]> {
  const query = `
    query SearchIndividuals($nucleusName: String!, $search: String) {
      individuals(nucleusName: $nucleusName, search: $search) { ${INDIVIDUAL_SELECTION} }
    }
  `;
  const data = await request<{ individuals: Individual[] }>(query, { nucleusName, search: search ?? null });
  return data.individuals;
}

// Intentionally dumb on cluster-notebook's side: `name` becomes the entire
// firstName, nothing else populated or split. Reconciling with a real SRP record
// is a separate, not-yet-built step.
export async function createIndividual(name: string, nucleusName: string): Promise<Individual> {
  const mutation = `
    mutation CreateIndividual($name: String!, $nucleusName: String!) {
      createIndividual(name: $name, nucleusName: $nucleusName) { ${INDIVIDUAL_SELECTION} }
    }
  `;
  const data = await request<{ createIndividual: Individual | null }>(mutation, { name, nucleusName });
  if (data.createIndividual === null) {
    throw new Error(`cluster-notebook has no nucleus named "${nucleusName}" — individual not created`);
  }
  return data.createIndividual;
}

// `role` is a fully open string on cluster-notebook's side (no fixed enum) --
// "accompanier"/"protagonist"/"abm-assistant" today, anything else works the same way.
export async function getNucleusWorkers(nucleusName: string, role: string): Promise<Individual[]> {
  const query = `
    query GetNucleusWorkers($name: String!, $role: String!) {
      nucleus(name: $name) { workers(role: $role) { ${INDIVIDUAL_SELECTION} } }
    }
  `;
  const data = await request<{ nucleus: { workers: Individual[] } | null }>(query, { name: nucleusName, role });
  return data.nucleus?.workers ?? [];
}

// Full-list replace, same pattern as updateNucleus -- personIds is the complete
// ordered list for this (nucleus, role) pair, not an incremental add/remove.
export async function updateNucleusWorkers(nucleusName: string, role: string, personIds: string[]): Promise<Individual[]> {
  const mutation = `
    mutation UpdateNucleusWorkers($name: String!, $role: String!, $personIds: [String!]!) {
      updateNucleusWorkers(nucleusName: $name, role: $role, personIds: $personIds) {
        workers(role: $role) { ${INDIVIDUAL_SELECTION} }
      }
    }
  `;
  const data = await request<{ updateNucleusWorkers: { workers: Individual[] } | null }>(mutation, { name: nucleusName, role, personIds });
  if (data.updateNucleusWorkers === null) {
    throw new Error(`cluster-notebook has no nucleus named "${nucleusName}" — workers not saved`);
  }
  return data.updateNucleusWorkers.workers;
}
