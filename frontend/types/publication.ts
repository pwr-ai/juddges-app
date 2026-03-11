export enum PublicationProject {
  JUDDGES = "JUDDGES",
  AI_TAX = "AI_TAX",
}

export enum PublicationType {
  JOURNAL = "journal",
  CONFERENCE = "conference",
  PREPRINT = "preprint",
  WORKSHOP = "workshop"
}

export enum PublicationStatus {
  PUBLISHED = "published",
  ACCEPTED = "accepted",
  UNDER_REVIEW = "under_review",
  PREPRINT = "preprint"
}

export interface PublicationAuthor {
  name: string;
  affiliation?: string;
  url?: string;
}

export interface PublicationLinks {
  pdf?: string;
  arxiv?: string;
  doi?: string;
  code?: string;
  website?: string;
  video?: string;
}

export interface Publication {
  id: string;
  userId?: string;  // User who created the publication
  title: string;
  authors: PublicationAuthor[];
  venue: string;
  venueShort?: string;
  year: number;
  month?: number;
  abstract: string;
  project: PublicationProject;
  type: PublicationType;
  status: PublicationStatus;
  links: PublicationLinks;
  tags?: string[];
  citations?: number;
  manuscriptNumber?: string;
  acceptanceDate?: string;
  publicationDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Schema link for publications
export interface PublicationSchemaLink {
  schemaId: string;
  schemaName?: string;
  description?: string;
  createdAt?: string;
}

// Collection link for publications
export interface PublicationCollectionLink {
  collectionId: string;
  collectionName?: string;
  description?: string;
  createdAt?: string;
}

// Extraction job link for publications
export interface PublicationExtractionJobLink {
  jobId: string;
  jobStatus?: string;
  description?: string;
  createdAt?: string;
}

// Publication with linked schemas, collections, and extraction jobs
export interface PublicationWithResources extends Publication {
  schemas?: PublicationSchemaLink[];
  collections?: PublicationCollectionLink[];
  extractionJobs?: PublicationExtractionJobLink[];
}

// Request types for creating/updating publications
export interface CreatePublicationRequest {
  title: string;
  authors: PublicationAuthor[];
  venue: string;
  venueShort?: string;
  year: number;
  month?: number;
  abstract: string;
  project: PublicationProject;
  type: PublicationType;
  status: PublicationStatus;
  links?: PublicationLinks;
  tags?: string[];
  citations?: number;
  manuscriptNumber?: string;
  acceptanceDate?: string;
  publicationDate?: string;
  schemaIds?: string[];
  collectionIds?: string[];
  extractionJobIds?: string[];
}

export interface UpdatePublicationRequest {
  title?: string;
  authors?: PublicationAuthor[];
  venue?: string;
  venueShort?: string;
  year?: number;
  month?: number;
  abstract?: string;
  project?: PublicationProject;
  type?: PublicationType;
  status?: PublicationStatus;
  links?: PublicationLinks;
  tags?: string[];
  citations?: number;
  manuscriptNumber?: string;
  acceptanceDate?: string;
  publicationDate?: string;
}

// Request types for linking/unlinking resources
export interface LinkSchemaRequest {
  schemaId: string;
  description?: string;
}

export interface LinkCollectionRequest {
  collectionId: string;
  description?: string;
}

export interface LinkExtractionJobRequest {
  jobId: string;
  description?: string;
}
