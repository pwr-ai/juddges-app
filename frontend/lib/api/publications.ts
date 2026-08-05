import {
  PublicationProject,
  PublicationStatus,
  PublicationType,
  PublicationWithResources,
  CreatePublicationRequest,
  UpdatePublicationRequest,
} from "@/types/publication";
import type { components } from "@/lib/api/generated/openapi";

type ApiPublication = components["schemas"]["PublicationWithResources"];

const publicationProjects: Record<ApiPublication["project"], PublicationProject> = {
  JuDDGES: PublicationProject.JUDDGES,
};

const publicationTypes: Record<ApiPublication["type"], PublicationType> = {
  journal: PublicationType.JOURNAL,
  conference: PublicationType.CONFERENCE,
  preprint: PublicationType.PREPRINT,
  workshop: PublicationType.WORKSHOP,
};

const publicationStatuses: Record<ApiPublication["status"], PublicationStatus> = {
  published: PublicationStatus.PUBLISHED,
  accepted: PublicationStatus.ACCEPTED,
  under_review: PublicationStatus.UNDER_REVIEW,
  preprint: PublicationStatus.PREPRINT,
};

function normalizePublication(publication: ApiPublication): PublicationWithResources {
  return {
    id: publication.id,
    title: publication.title,
    authors: publication.authors.map((author) => ({
      name: author.name,
      affiliation: author.affiliation ?? undefined,
      url: author.url ?? undefined,
    })),
    venue: publication.venue,
    venueShort: publication.venue_short ?? undefined,
    year: publication.year,
    month: publication.month ?? undefined,
    abstract: publication.abstract,
    project: publicationProjects[publication.project],
    type: publicationTypes[publication.type],
    status: publicationStatuses[publication.status],
    links: {
      pdf: publication.links.pdf ?? undefined,
      arxiv: publication.links.arxiv ?? undefined,
      doi: publication.links.doi ?? undefined,
      code: publication.links.code ?? undefined,
      website: publication.links.website ?? undefined,
      video: publication.links.video ?? undefined,
    },
    tags: publication.tags ?? undefined,
    citations: publication.citations ?? undefined,
    manuscriptNumber: publication.manuscript_number ?? undefined,
    acceptanceDate: publication.acceptance_date ?? undefined,
    publicationDate: publication.publication_date ?? undefined,
    createdAt: publication.created_at,
    updatedAt: publication.updated_at,
    schemas: publication.schemas.map((schema) => ({
      schemaId: schema.schema_id,
      description: schema.description ?? undefined,
      createdAt: schema.created_at ?? undefined,
    })),
    collections: publication.collections.map((collection) => ({
      collectionId: collection.collection_id,
      description: collection.description ?? undefined,
      createdAt: collection.created_at ?? undefined,
    })),
    extractionJobs: publication.extraction_jobs.map((job) => ({
      jobId: job.job_id,
      jobStatus: job.job_status ?? undefined,
      description: job.description ?? undefined,
      createdAt: job.created_at ?? undefined,
    })),
  };
}

export interface PublicationFilters {
  project?: PublicationProject;
  year?: number;
  status?: PublicationStatus;
  type?: PublicationType;
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

  const publications: ApiPublication[] = await response.json();
  return publications.map(normalizePublication);
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
