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
  return json.data as T;
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
  const mutation = `
    mutation UpdateDevotionalGathering($nucleusName: String!, $number: Int, $participants: Int, $participantsFof: Int) {
      updateDevotionalGathering(
        nucleusName: $nucleusName, number: $number, participants: $participants, participantsFof: $participantsFof
      ) {
        devotionalGathering { number participants participantsFof }
      }
    }
  `;
  const data = await request<{ updateDevotionalGathering: { devotionalGathering: DevotionalGathering | null } | null }>(
    mutation,
    {
      nucleusName,
      number: fields.number ?? null,
      participants: fields.participants ?? null,
      participantsFof: fields.participantsFof ?? null,
    }
  );
  return data.updateDevotionalGathering?.devotionalGathering ?? null;
}
