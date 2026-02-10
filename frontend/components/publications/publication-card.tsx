"use client";

import { FC, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccentButton, SecondaryButton, TextButton } from "@/lib/styles/components";
import { PublicationWithResources, PublicationStatus, PublicationProject } from "@/types/publication";
import { ProjectBadge } from "./project-badge";
import {
  FileText,
  Code,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Calendar,
  Users,
  BookOpen,
  CheckCircle,
  Clock,
  Pencil,
  Database,
  Briefcase,
  Link2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PublicationCardProps {
  publication: PublicationWithResources;
  currentUserId?: string;
}

const statusConfig = {
  [PublicationStatus.PUBLISHED]: {
    label: "Published",
    icon: CheckCircle,
    className: "bg-green-400/10 text-green-600 border-green-400/30 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/30"
  },
  [PublicationStatus.ACCEPTED]: {
    label: "Accepted",
    icon: CheckCircle,
    className: "bg-blue-400/10 text-blue-600 border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/30"
  },
  [PublicationStatus.UNDER_REVIEW]: {
    label: "Under Review",
    icon: Clock,
    className: "bg-amber-400/10 text-amber-700 border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30"
  },
  [PublicationStatus.PREPRINT]: {
    label: "Preprint",
    icon: FileText,
    className: "bg-slate-100/50 text-slate-700 border-slate-300/30 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700/30"
  }
};

export const PublicationCard: FC<PublicationCardProps> = ({ publication, currentUserId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const statusInfo = statusConfig[publication.status];
  const StatusIcon = statusInfo.icon;

  // Check if current user can edit (owner or system publication with null userId)
  const canEdit = currentUserId && (!publication.userId || publication.userId === currentUserId);

  const formatAuthors = (): string => {
    return publication.authors.map(a => a.name).join(", ");
  };

  const formatDate = (): string => {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (publication.month) {
      return `${monthNames[publication.month - 1]} ${publication.year}`;
    }
    return publication.year.toString();
  };

  // Project-specific gradient backgrounds
  const gradientClass = publication.project === PublicationProject.JUDDGES
    ? "bg-gradient-to-br from-blue-400/15 via-indigo-400/10 to-blue-400/8 dark:from-blue-500/15 dark:via-indigo-500/10 dark:to-blue-500/8"
    : "bg-gradient-to-br from-purple-400/15 via-indigo-400/10 to-purple-400/8 dark:from-purple-500/15 dark:via-indigo-500/10 dark:to-purple-500/8";

  return (
    <Card className={cn(
      "group border border-slate-200/50 dark:border-slate-800/50",
      gradientClass,
      "hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300"
    )}>
      <CardHeader className="space-y-3">
        {/* Project badge and status */}
        <div className="flex items-center gap-2 flex-wrap">
          <ProjectBadge project={publication.project} />
          <Badge variant="outline" className={cn("font-medium", statusInfo.className)}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusInfo.label}
          </Badge>
          {publication.manuscriptNumber && (
            <Badge variant="outline" className="text-xs text-foreground/70 border-slate-300/50 dark:border-slate-700/50">
              {publication.manuscriptNumber}
            </Badge>
          )}
          {canEdit && (
            <Link
              href={`/publications/admin/${publication.id}`}
              className="ml-auto p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
              title="Edit publication"
            >
              <Pencil className="h-4 w-4" />
            </Link>
          )}
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold leading-tight text-foreground group-hover:bg-gradient-to-r group-hover:from-primary group-hover:via-indigo-400 group-hover:to-purple-400 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
          {publication.title}
        </h3>

        {/* Authors */}
        <div className="flex items-start gap-2 text-sm text-foreground/70">
          <Users className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span>{formatAuthors()}</span>
        </div>

        {/* Venue and Date */}
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-start gap-2 text-foreground/70">
            <BookOpen className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="font-medium">{publication.venue}</span>
          </div>
          <div className="flex items-center gap-2 text-foreground/70">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>{formatDate()}</span>
            {publication.acceptanceDate && (
              <span className="text-xs text-foreground/60">
                (Accepted: {new Date(publication.acceptanceDate).toLocaleDateString()})
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Abstract */}
        <div>
          <p className={cn(
            "text-sm text-foreground/80 leading-relaxed",
            !isExpanded && "line-clamp-3"
          )}>
            {publication.abstract}
          </p>
          <TextButton
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-xs"
            icon={isExpanded ? ChevronUp : ChevronDown}
            iconPosition="left"
          >
            {isExpanded ? "Show less" : "Read more"}
          </TextButton>
        </div>

        {/* Tags */}
        {publication.tags && publication.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {publication.tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="text-xs bg-white/50 dark:bg-slate-800/50 border-slate-200/50 dark:border-slate-700/50 text-foreground/70">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Research Resources */}
        {((publication.schemas && publication.schemas.length > 0) ||
          (publication.collections && publication.collections.length > 0) ||
          (publication.extractionJobs || (publication as any).extraction_jobs)?.length > 0) && (
          <div className="pt-3 border-t border-slate-200/50 dark:border-slate-700/50">
            <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
              <Link2 className="h-3 w-3" />
              Research Resources
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Schemas */}
              {publication.schemas?.map((schema: any) => {
                const schemaId = schema.schemaId || schema.schema_id;
                const schemaName = schema.schemaName || schema.schema_name;
                if (!schemaId) return null;
                return (
                  <Link
                    key={schemaId}
                    href={`/schemas/${schemaId}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                    title={schema.description || "Extraction Schema"}
                  >
                    <FileText className="h-3 w-3" />
                    {schemaName || "Schema"}
                  </Link>
                );
              })}
              {/* Collections */}
              {publication.collections?.map((collection: any) => {
                const collectionId = collection.collectionId || collection.collection_id;
                const collectionName = collection.collectionName || collection.collection_name;
                if (!collectionId) return null;
                return (
                  <Link
                    key={collectionId}
                    href={`/collections/${collectionId}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
                    title={collection.description || "Document Collection"}
                  >
                    <Database className="h-3 w-3" />
                    {collectionName || "Collection"}
                  </Link>
                );
              })}
              {/* Extraction Jobs */}
              {(publication.extractionJobs || (publication as any).extraction_jobs)?.map((job: any) => {
                const jobId = job.jobId || job.job_id;
                const jobStatus = job.jobStatus || job.job_status;
                if (!jobId) return null;
                return (
                  <Link
                    key={jobId}
                    href={`/extractions/${jobId}`}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900 transition-colors"
                    title={job.description || `Extraction Job (${jobStatus || "unknown"})`}
                  >
                    <Briefcase className="h-3 w-3" />
                    {jobStatus ? `Job (${jobStatus})` : "Extraction Job"}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>

      {/* Links */}
      {Object.keys(publication.links).length > 0 && (
        <CardFooter className="flex flex-wrap gap-2">
          {publication.links.pdf && (
            <AccentButton 
              size="sm"
              onClick={() => window.open(publication.links.pdf, '_blank', 'noopener,noreferrer')}
              icon={FileText}
            >
              PDF
            </AccentButton>
          )}
          {publication.links.arxiv && (
            <SecondaryButton 
              size="sm"
              onClick={() => window.open(publication.links.arxiv, '_blank', 'noopener,noreferrer')}
              icon={ExternalLink}
            >
              arXiv
            </SecondaryButton>
          )}
          {publication.links.code && (
            <SecondaryButton 
              size="sm"
              onClick={() => window.open(publication.links.code, '_blank', 'noopener,noreferrer')}
              icon={Code}
            >
              Code
            </SecondaryButton>
          )}
          {publication.links.doi && (
            <SecondaryButton 
              size="sm"
              onClick={() => window.open(
                publication.links.doi?.startsWith('http') ? publication.links.doi : `https://doi.org/${publication.links.doi}`,
                '_blank',
                'noopener,noreferrer'
              )}
              icon={ExternalLink}
            >
              DOI
            </SecondaryButton>
          )}
          {publication.links.website && (
            <SecondaryButton 
              size="sm"
              onClick={() => window.open(publication.links.website, '_blank', 'noopener,noreferrer')}
              icon={ExternalLink}
            >
              Website
            </SecondaryButton>
          )}
          {publication.links.video && (
            <SecondaryButton 
              size="sm"
              onClick={() => window.open(publication.links.video, '_blank', 'noopener,noreferrer')}
              icon={ExternalLink}
            >
              Video
            </SecondaryButton>
          )}
        </CardFooter>
      )}
    </Card>
  );
};
