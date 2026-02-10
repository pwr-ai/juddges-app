"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Loader2, Database, FileText, Briefcase, Link2 } from "lucide-react";
import {
  PublicationProject,
  PublicationType,
  PublicationStatus,
  PublicationAuthor,
  PublicationLinks,
  PublicationWithResources,
  PublicationSchemaLink,
  PublicationCollectionLink,
  PublicationExtractionJobLink,
  CreatePublicationRequest,
  UpdatePublicationRequest,
} from "@/types/publication";
import {
  createPublication,
  updatePublication,
  linkSchema,
  unlinkSchema,
  linkCollection,
  unlinkCollection,
  linkExtractionJob,
  unlinkExtractionJob,
} from "@/lib/api/publications";

interface AvailableSchema {
  id: string;
  name: string;
  description?: string;
}

interface AvailableCollection {
  id: string;
  name: string;
  description?: string;
}

interface AvailableExtractionJob {
  id: string;
  job_id: string;
  schema_name?: string;
  status: string;
  created_at: string;
}

interface PublicationFormProps {
  publication?: PublicationWithResources;
  onSuccess?: () => void;
}

export function PublicationForm({ publication, onSuccess }: PublicationFormProps) {
  const router = useRouter();
  const isEditing = !!publication;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resourceLoading, setResourceLoading] = useState(false);

  // Available resources
  const [availableSchemas, setAvailableSchemas] = useState<AvailableSchema[]>([]);
  const [availableCollections, setAvailableCollections] = useState<AvailableCollection[]>([]);
  const [availableJobs, setAvailableJobs] = useState<AvailableExtractionJob[]>([]);

  // Linked resources (only for editing)
  const [linkedSchemas, setLinkedSchemas] = useState<PublicationSchemaLink[]>(
    publication?.schemas || []
  );
  const [linkedCollections, setLinkedCollections] = useState<PublicationCollectionLink[]>(
    publication?.collections || []
  );
  const [linkedJobs, setLinkedJobs] = useState<PublicationExtractionJobLink[]>(
    publication?.extractionJobs || []
  );

  // New resource to add
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>("");
  const [schemaDescription, setSchemaDescription] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [jobDescription, setJobDescription] = useState("");

  // Form state
  const [title, setTitle] = useState(publication?.title || "");
  const [authors, setAuthors] = useState<PublicationAuthor[]>(
    publication?.authors || [{ name: "" }]
  );
  const [venue, setVenue] = useState(publication?.venue || "");
  const [venueShort, setVenueShort] = useState(publication?.venueShort || "");
  const [year, setYear] = useState(publication?.year || new Date().getFullYear());
  const [month, setMonth] = useState<number | undefined>(publication?.month);
  const [abstract, setAbstract] = useState(publication?.abstract || "");
  const [project, setProject] = useState<PublicationProject>(
    publication?.project || PublicationProject.AI_TAX
  );
  const [type, setType] = useState<PublicationType>(
    publication?.type || PublicationType.CONFERENCE
  );
  const [status, setStatus] = useState<PublicationStatus>(
    publication?.status || PublicationStatus.PUBLISHED
  );
  const [links, setLinks] = useState<PublicationLinks>(publication?.links || {});
  const [tags, setTags] = useState<string[]>(publication?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [citations, setCitations] = useState<number | undefined>(publication?.citations);
  const [manuscriptNumber, setManuscriptNumber] = useState(publication?.manuscriptNumber || "");

  // Fetch available resources on mount (only when editing)
  useEffect(() => {
    if (isEditing) {
      fetchAvailableResources();
    }
  }, [isEditing]);

  const fetchAvailableResources = async () => {
    setResourceLoading(true);
    try {
      // Fetch schemas
      const schemasRes = await fetch("/api/schemas");
      if (schemasRes.ok) {
        const schemasData = await schemasRes.json();
        setAvailableSchemas(schemasData);
      }

      // Fetch collections
      const collectionsRes = await fetch("/api/collections");
      if (collectionsRes.ok) {
        const collectionsData = await collectionsRes.json();
        setAvailableCollections(collectionsData);
      }

      // Fetch extraction jobs
      const jobsRes = await fetch("/api/extractions");
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setAvailableJobs(jobsData);
      }
    } catch (err) {
      console.error("Failed to fetch resources:", err);
    } finally {
      setResourceLoading(false);
    }
  };

  const handleAuthorChange = (index: number, field: keyof PublicationAuthor, value: string) => {
    const newAuthors = [...authors];
    newAuthors[index] = { ...newAuthors[index], [field]: value };
    setAuthors(newAuthors);
  };

  const addAuthor = () => {
    setAuthors([...authors, { name: "" }]);
  };

  const removeAuthor = (index: number) => {
    if (authors.length > 1) {
      setAuthors(authors.filter((_, i) => i !== index));
    }
  };

  const handleLinkChange = (field: keyof PublicationLinks, value: string) => {
    setLinks({ ...links, [field]: value || undefined });
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Resource linking handlers
  const handleLinkSchema = async () => {
    if (!selectedSchemaId || !publication?.id) return;
    setResourceLoading(true);
    try {
      await linkSchema(publication.id, selectedSchemaId, schemaDescription || undefined);
      const schema = availableSchemas.find((s) => s.id === selectedSchemaId);
      setLinkedSchemas([
        ...linkedSchemas,
        {
          schemaId: selectedSchemaId,
          schemaName: schema?.name,
          description: schemaDescription || undefined,
        },
      ]);
      setSelectedSchemaId("");
      setSchemaDescription("");
    } catch (err) {
      setError("Failed to link schema");
    } finally {
      setResourceLoading(false);
    }
  };

  const handleUnlinkSchema = async (schemaId: string) => {
    if (!publication?.id) return;
    setResourceLoading(true);
    try {
      await unlinkSchema(publication.id, schemaId);
      setLinkedSchemas(linkedSchemas.filter((s) => s.schemaId !== schemaId));
    } catch (err) {
      setError("Failed to unlink schema");
    } finally {
      setResourceLoading(false);
    }
  };

  const handleLinkCollection = async () => {
    if (!selectedCollectionId || !publication?.id) return;
    setResourceLoading(true);
    try {
      await linkCollection(publication.id, selectedCollectionId, collectionDescription || undefined);
      const collection = availableCollections.find((c) => c.id === selectedCollectionId);
      setLinkedCollections([
        ...linkedCollections,
        {
          collectionId: selectedCollectionId,
          collectionName: collection?.name,
          description: collectionDescription || undefined,
        },
      ]);
      setSelectedCollectionId("");
      setCollectionDescription("");
    } catch (err) {
      setError("Failed to link collection");
    } finally {
      setResourceLoading(false);
    }
  };

  const handleUnlinkCollection = async (collectionId: string) => {
    if (!publication?.id) return;
    setResourceLoading(true);
    try {
      await unlinkCollection(publication.id, collectionId);
      setLinkedCollections(linkedCollections.filter((c) => c.collectionId !== collectionId));
    } catch (err) {
      setError("Failed to unlink collection");
    } finally {
      setResourceLoading(false);
    }
  };

  const handleLinkJob = async () => {
    if (!selectedJobId || !publication?.id) return;
    setResourceLoading(true);
    try {
      await linkExtractionJob(publication.id, selectedJobId, jobDescription || undefined);
      const job = availableJobs.find((j) => j.id === selectedJobId);
      setLinkedJobs([
        ...linkedJobs,
        {
          jobId: selectedJobId,
          jobStatus: job?.status,
          description: jobDescription || undefined,
        },
      ]);
      setSelectedJobId("");
      setJobDescription("");
    } catch (err) {
      setError("Failed to link extraction job");
    } finally {
      setResourceLoading(false);
    }
  };

  const handleUnlinkJob = async (jobId: string) => {
    if (!publication?.id) return;
    setResourceLoading(true);
    try {
      await unlinkExtractionJob(publication.id, jobId);
      setLinkedJobs(linkedJobs.filter((j) => j.jobId !== jobId));
    } catch (err) {
      setError("Failed to unlink extraction job");
    } finally {
      setResourceLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Filter out empty authors
      const validAuthors = authors.filter((a) => a.name.trim());
      if (validAuthors.length === 0) {
        throw new Error("At least one author is required");
      }

      if (isEditing) {
        const data: UpdatePublicationRequest = {
          title,
          authors: validAuthors,
          venue,
          venueShort: venueShort || undefined,
          year,
          month,
          abstract,
          project,
          type,
          status,
          links,
          tags: tags.length > 0 ? tags : undefined,
          citations,
          manuscriptNumber: manuscriptNumber || undefined,
        };
        await updatePublication(publication.id, data);
      } else {
        const data: CreatePublicationRequest = {
          title,
          authors: validAuthors,
          venue,
          venueShort: venueShort || undefined,
          year,
          month,
          abstract,
          project,
          type,
          status,
          links,
          tags: tags.length > 0 ? tags : undefined,
          citations,
          manuscriptNumber: manuscriptNumber || undefined,
        };
        await createPublication(data);
      }

      onSuccess?.();
      router.push("/publications");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Filter out already linked resources
  const unlinkedSchemas = availableSchemas.filter(
    (s) => !linkedSchemas.some((ls) => ls.schemaId === s.id)
  );
  const unlinkedCollections = availableCollections.filter(
    (c) => !linkedCollections.some((lc) => lc.collectionId === c.id)
  );
  const unlinkedJobs = availableJobs.filter(
    (j) => !linkedJobs.some((lj) => lj.jobId === j.id)
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Publication title"
            />
          </div>

          <div>
            <Label htmlFor="abstract">Abstract *</Label>
            <Textarea
              id="abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              required
              rows={5}
              placeholder="Publication abstract"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="venue">Venue *</Label>
              <Input
                id="venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                required
                placeholder="e.g., NeurIPS 2024"
              />
            </div>
            <div>
              <Label htmlFor="venueShort">Venue Short</Label>
              <Input
                id="venueShort"
                value={venueShort}
                onChange={(e) => setVenueShort(e.target.value)}
                placeholder="e.g., NeurIPS"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="year">Year *</Label>
              <Input
                id="year"
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                required
                min={1900}
                max={2100}
              />
            </div>
            <div>
              <Label htmlFor="month">Month</Label>
              <Select
                value={month?.toString() || "none"}
                onValueChange={(v) => setMonth(v === "none" ? undefined : parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No month</SelectItem>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={(i + 1).toString()}>
                      {new Date(2000, i).toLocaleString("default", { month: "long" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Authors */}
      <Card>
        <CardHeader>
          <CardTitle>Authors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {authors.map((author, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <Input
                  value={author.name}
                  onChange={(e) => handleAuthorChange(index, "name", e.target.value)}
                  placeholder="Name *"
                  required={index === 0}
                />
                <Input
                  value={author.affiliation || ""}
                  onChange={(e) => handleAuthorChange(index, "affiliation", e.target.value)}
                  placeholder="Affiliation"
                />
                <Input
                  value={author.url || ""}
                  onChange={(e) => handleAuthorChange(index, "url", e.target.value)}
                  placeholder="URL"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeAuthor(index)}
                disabled={authors.length === 1}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addAuthor}>
            <Plus className="h-4 w-4 mr-2" /> Add Author
          </Button>
        </CardContent>
      </Card>

      {/* Classification */}
      <Card>
        <CardHeader>
          <CardTitle>Classification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label>Project *</Label>
              <Select value={project} onValueChange={(v) => setProject(v as PublicationProject)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PublicationProject.AI_TAX}>AI-TAX</SelectItem>
                  <SelectItem value={PublicationProject.JUDDGES}>JuDDGES</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as PublicationType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PublicationType.JOURNAL}>Journal</SelectItem>
                  <SelectItem value={PublicationType.CONFERENCE}>Conference</SelectItem>
                  <SelectItem value={PublicationType.WORKSHOP}>Workshop</SelectItem>
                  <SelectItem value={PublicationType.PREPRINT}>Preprint</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status *</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as PublicationStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PublicationStatus.PUBLISHED}>Published</SelectItem>
                  <SelectItem value={PublicationStatus.ACCEPTED}>Accepted</SelectItem>
                  <SelectItem value={PublicationStatus.UNDER_REVIEW}>Under Review</SelectItem>
                  <SelectItem value={PublicationStatus.PREPRINT}>Preprint</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Tags</Label>
            <div className="flex gap-2 mb-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add a tag"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Add
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Research Resources - Only show when editing */}
      {isEditing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Research Resources
            </CardTitle>
            <CardDescription>
              Link schemas, collections, and extraction jobs used in this publication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {resourceLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}

            {/* Schemas Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-500" />
                <Label className="text-base font-semibold">Extraction Schemas</Label>
              </div>

              {/* Linked Schemas */}
              {linkedSchemas.length > 0 && (
                <div className="space-y-2">
                  {linkedSchemas.map((schema) => (
                    <div
                      key={schema.schemaId}
                      className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg"
                    >
                      <div>
                        <span className="font-medium">{schema.schemaName || schema.schemaId}</span>
                        {schema.description && (
                          <p className="text-sm text-muted-foreground">{schema.description}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnlinkSchema(schema.schemaId)}
                        disabled={resourceLoading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Schema */}
              {unlinkedSchemas.length > 0 && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select value={selectedSchemaId} onValueChange={setSelectedSchemaId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a schema to link" />
                      </SelectTrigger>
                      <SelectContent>
                        {unlinkedSchemas.map((schema) => (
                          <SelectItem key={schema.id} value={schema.id}>
                            {schema.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    placeholder="Description (optional)"
                    value={schemaDescription}
                    onChange={(e) => setSchemaDescription(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLinkSchema}
                    disabled={!selectedSchemaId || resourceLoading}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Link
                  </Button>
                </div>
              )}
            </div>

            {/* Collections Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-green-500" />
                <Label className="text-base font-semibold">Document Collections</Label>
              </div>

              {/* Linked Collections */}
              {linkedCollections.length > 0 && (
                <div className="space-y-2">
                  {linkedCollections.map((collection) => (
                    <div
                      key={collection.collectionId}
                      className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg"
                    >
                      <div>
                        <span className="font-medium">
                          {collection.collectionName || collection.collectionId}
                        </span>
                        {collection.description && (
                          <p className="text-sm text-muted-foreground">{collection.description}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnlinkCollection(collection.collectionId)}
                        disabled={resourceLoading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Collection */}
              {unlinkedCollections.length > 0 && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select value={selectedCollectionId} onValueChange={setSelectedCollectionId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a collection to link" />
                      </SelectTrigger>
                      <SelectContent>
                        {unlinkedCollections.map((collection) => (
                          <SelectItem key={collection.id} value={collection.id}>
                            {collection.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    placeholder="Description (optional)"
                    value={collectionDescription}
                    onChange={(e) => setCollectionDescription(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLinkCollection}
                    disabled={!selectedCollectionId || resourceLoading}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Link
                  </Button>
                </div>
              )}
            </div>

            {/* Extraction Jobs Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-purple-500" />
                <Label className="text-base font-semibold">Extraction Jobs</Label>
              </div>

              {/* Linked Jobs */}
              {linkedJobs.length > 0 && (
                <div className="space-y-2">
                  {linkedJobs.map((job) => (
                    <div
                      key={job.jobId}
                      className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950 rounded-lg"
                    >
                      <div>
                        <span className="font-medium">{job.jobId}</span>
                        <div className="flex items-center gap-2">
                          {job.jobStatus && (
                            <Badge variant="outline" className="text-xs">
                              {job.jobStatus}
                            </Badge>
                          )}
                          {job.description && (
                            <span className="text-sm text-muted-foreground">{job.description}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleUnlinkJob(job.jobId)}
                        disabled={resourceLoading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Job */}
              {unlinkedJobs.length > 0 && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an extraction job to link" />
                      </SelectTrigger>
                      <SelectContent>
                        {unlinkedJobs.map((job) => (
                          <SelectItem key={job.id} value={job.id}>
                            {job.schema_name || job.job_id} ({job.status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    placeholder="Description (optional)"
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLinkJob}
                    disabled={!selectedJobId || resourceLoading}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Link
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pdf">PDF URL</Label>
              <Input
                id="pdf"
                value={links.pdf || ""}
                onChange={(e) => handleLinkChange("pdf", e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="arxiv">arXiv URL</Label>
              <Input
                id="arxiv"
                value={links.arxiv || ""}
                onChange={(e) => handleLinkChange("arxiv", e.target.value)}
                placeholder="https://arxiv.org/abs/..."
              />
            </div>
            <div>
              <Label htmlFor="doi">DOI URL</Label>
              <Input
                id="doi"
                value={links.doi || ""}
                onChange={(e) => handleLinkChange("doi", e.target.value)}
                placeholder="https://doi.org/..."
              />
            </div>
            <div>
              <Label htmlFor="code">Code URL</Label>
              <Input
                id="code"
                value={links.code || ""}
                onChange={(e) => handleLinkChange("code", e.target.value)}
                placeholder="https://github.com/..."
              />
            </div>
            <div>
              <Label htmlFor="website">Website URL</Label>
              <Input
                id="website"
                value={links.website || ""}
                onChange={(e) => handleLinkChange("website", e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div>
              <Label htmlFor="video">Video URL</Label>
              <Input
                id="video"
                value={links.video || ""}
                onChange={(e) => handleLinkChange("video", e.target.value)}
                placeholder="https://youtube.com/..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Info */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="citations">Citations</Label>
              <Input
                id="citations"
                type="number"
                value={citations || ""}
                onChange={(e) => setCitations(e.target.value ? parseInt(e.target.value) : undefined)}
                min={0}
              />
            </div>
            <div>
              <Label htmlFor="manuscriptNumber">Manuscript Number</Label>
              <Input
                id="manuscriptNumber"
                value={manuscriptNumber}
                onChange={(e) => setManuscriptNumber(e.target.value)}
                placeholder="e.g., PAPER-2024-001"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? "Update Publication" : "Create Publication"}
        </Button>
      </div>
    </form>
  );
}
