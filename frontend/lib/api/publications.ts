import {
  Publication,
  PublicationWithResources,
  CreatePublicationRequest,
  UpdatePublicationRequest,
} from "@/types/publication";

export interface PublicationFilters {
  project?: string;
  year?: number;
  status?: string;
  type?: string;
}

export async function getPublications(filters?: PublicationFilters): Promise<PublicationWithResources[]> {
  const params = new URLSearchParams();
  if (filters?.project) params.append('project', filters.project);
  if (filters?.year) params.append('year', filters.year.toString());
  if (filters?.status) params.append('status', filters.status);
  if (filters?.type) params.append('type', filters.type);

  const queryString = params.toString();
  const url = `/api/publications${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    throw new Error("Failed to fetch publications");
  }

  return response.json();
}

export async function getPublication(id: string): Promise<PublicationWithResources> {
  const response = await fetch(`/api/publications/${id}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Publication not found");
    }
    throw new Error("Failed to fetch publication");
  }

  return response.json();
}

export async function createPublication(data: CreatePublicationRequest): Promise<PublicationWithResources> {
  const response = await fetch('/api/publications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create publication' }));
    throw new Error(error.error || 'Failed to create publication');
  }

  return response.json();
}

export async function updatePublication(id: string, data: UpdatePublicationRequest): Promise<PublicationWithResources> {
  const response = await fetch(`/api/publications/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update publication' }));
    throw new Error(error.error || 'Failed to update publication');
  }

  return response.json();
}

export async function deletePublication(id: string): Promise<void> {
  const response = await fetch(`/api/publications/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete publication' }));
    throw new Error(error.error || 'Failed to delete publication');
  }
}

// Resource linking functions
export async function linkSchema(publicationId: string, schemaId: string, description?: string): Promise<void> {
  const response = await fetch(`/api/publications/${publicationId}/schemas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ schemaId, description }),
  });

  if (!response.ok) {
    throw new Error('Failed to link schema');
  }
}

export async function unlinkSchema(publicationId: string, schemaId: string): Promise<void> {
  const response = await fetch(`/api/publications/${publicationId}/schemas/${schemaId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to unlink schema');
  }
}

export async function linkCollection(publicationId: string, collectionId: string, description?: string): Promise<void> {
  const response = await fetch(`/api/publications/${publicationId}/collections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ collectionId, description }),
  });

  if (!response.ok) {
    throw new Error('Failed to link collection');
  }
}

export async function unlinkCollection(publicationId: string, collectionId: string): Promise<void> {
  const response = await fetch(`/api/publications/${publicationId}/collections/${collectionId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to unlink collection');
  }
}

export async function linkExtractionJob(publicationId: string, jobId: string, description?: string): Promise<void> {
  const response = await fetch(`/api/publications/${publicationId}/extraction-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jobId, description }),
  });

  if (!response.ok) {
    throw new Error('Failed to link extraction job');
  }
}

export async function unlinkExtractionJob(publicationId: string, jobId: string): Promise<void> {
  const response = await fetch(`/api/publications/${publicationId}/extraction-jobs/${jobId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to unlink extraction job');
  }
}
