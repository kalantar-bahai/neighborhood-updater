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

export interface NucleusFields {
  stage: string | null;
  locality: string | null;
  populationMakeup: string | null;
}

export interface NucleusSummary extends NucleusFields {
  name: string;
  devotionalGathering: DevotionalGathering | null;
}

export async function getAllNuclei(): Promise<NucleusSummary[]> {
  const query = `
    query GetAllNuclei {
      nuclei {
        name stage locality populationMakeup
        devotionalGathering { number participants participantsFof }
      }
    }
  `;
  const data = await request<{ nuclei: NucleusSummary[] }>(query, {});
  return data.nuclei;
}

export async function getNucleusFields(nucleusName: string): Promise<NucleusFields | null> {
  const query = `
    query GetNucleusFields($name: String!) {
      nucleus(name: $name) { stage locality populationMakeup }
    }
  `;
  const data = await request<{ nucleus: NucleusFields | null }>(query, { name: nucleusName });
  return data.nucleus;
}

export async function updateNucleus(
  nucleusName: string,
  patch: { stage?: string; locality?: string; populationMakeup?: string }
): Promise<NucleusFields | null> {
  const mutation = `
    mutation UpdateNucleus($name: String!, $patch: NucleusPatch!) {
      updateNucleus(name: $name, patch: $patch) {
        stage locality populationMakeup
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
