"use client";

import { FC, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/editorial";
import { PublicationWithResources, PublicationStatus } from "@/types/publication";
import {
	FileText,
	Code,
	ExternalLink,
	ChevronDown,
	ChevronUp,
	Calendar,
	Users,
	BookOpen,
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

const statusLabelConfig: Record<PublicationStatus, string> = {
  [PublicationStatus.PUBLISHED]: "Published",
  [PublicationStatus.ACCEPTED]: "Accepted",
  [PublicationStatus.UNDER_REVIEW]: "Under Review",
  [PublicationStatus.PREPRINT]: "Preprint",
};

export const PublicationCard: FC<PublicationCardProps> = ({ publication, currentUserId }) => {
	const [isExpanded, setIsExpanded] = useState(false);

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

	return (
		<Card className="group border border-rule bg-parchment rounded-none hover:border-oxblood transition-colors">
			<CardHeader className="space-y-3">
				{/* Status */}
				<div className="flex items-center gap-2 flex-wrap">
					<StatusBadge
						status={publication.status}
						label={statusLabelConfig[publication.status] ?? publication.status}
					/>
					{publication.manuscriptNumber && (
						<Badge variant="outline" className="text-xs font-mono text-ink-soft border-rule rounded-none">
							{publication.manuscriptNumber}
						</Badge>
					)}
					{canEdit && (
						<Link
							href={`/publications/admin/${publication.id}`}
							className="ml-auto p-1.5 text-ink-soft hover:text-oxblood hover:bg-parchment-deep rounded-none transition-colors border border-transparent hover:border-rule"
							title="Edit publication"
						>
							<Pencil className="h-4 w-4" />
						</Link>
					)}
				</div>

				{/* Title */}
				<h3 className="font-serif text-xl font-bold leading-tight text-ink group-hover:text-oxblood transition-colors">
					{publication.title}
				</h3>

				{/* Authors */}
				<div className="flex items-start gap-2 text-sm text-ink-soft">
					<Users className="h-4 w-4 mt-0.5 shrink-0 text-ink-soft" />
					<span>{formatAuthors()}</span>
				</div>

				{/* Venue and Date */}
				<div className="flex flex-col gap-2 text-sm">
					<div className="flex items-start gap-2 text-ink-soft">
						<BookOpen className="h-4 w-4 mt-0.5 shrink-0 text-ink-soft" />
						<span className="font-medium text-ink">{publication.venue}</span>
					</div>
					<div className="flex items-center gap-2 text-xs font-mono text-ink-soft">
						<Calendar className="h-4 w-4 shrink-0 text-ink-soft" />
						<span>{formatDate()}</span>
						{publication.acceptanceDate && (
							<span className="text-ink-soft">
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
						"text-sm text-ink-soft leading-relaxed",
						!isExpanded && "line-clamp-3"
					)}>
						{publication.abstract}
					</p>
					<button
						onClick={() => setIsExpanded(!isExpanded)}
						className="mt-2 text-xs font-mono text-ink-soft hover:text-oxblood flex items-center gap-1 transition-colors"
					>
						{isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
						{isExpanded ? "Show less" : "Read more"}
					</button>
				</div>

				{/* Tags */}
				{publication.tags && publication.tags.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{publication.tags.map((tag, index) => (
							<Badge key={index} variant="secondary" className="text-xs font-mono bg-parchment-deep border-rule text-ink-soft rounded-none">
								{tag}
							</Badge>
						))}
					</div>
				)}

				{/* Research Resources */}
				{((publication.schemas && publication.schemas.length > 0) ||
					(publication.collections && publication.collections.length > 0) ||
					(publication.extractionJobs || (publication as any).extraction_jobs)?.length > 0) && (
					<div className="pt-3 border-t border-rule">
						<div className="flex items-center gap-1.5 mb-2 text-xs font-mono font-medium text-ink-soft">
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
										className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono rounded-none bg-parchment-deep text-ink hover:text-oxblood border border-rule transition-colors"
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
										className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono rounded-none bg-parchment-deep text-ink hover:text-oxblood border border-rule transition-colors"
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
										className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono rounded-none bg-parchment-deep text-ink hover:text-oxblood border border-rule transition-colors"
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
				<CardFooter className="flex flex-wrap gap-2 pt-0">
					{publication.links.pdf && (
						<Button
							size="sm"
							className="rounded-none bg-oxblood text-parchment hover:bg-oxblood-deep font-mono text-xs"
							onClick={() => window.open(publication.links.pdf, '_blank', 'noopener,noreferrer')}
						>
							<FileText className="mr-1.5 h-3.5 w-3.5" />
							PDF
						</Button>
					)}
					{publication.links.arxiv && (
						<Button
							size="sm"
							variant="outline"
							className="rounded-none border-rule text-ink hover:bg-parchment-deep hover:border-oxblood hover:text-oxblood font-mono text-xs"
							onClick={() => window.open(publication.links.arxiv, '_blank', 'noopener,noreferrer')}
						>
							<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
							arXiv
						</Button>
					)}
					{publication.links.code && (
						<Button
							size="sm"
							variant="outline"
							className="rounded-none border-rule text-ink hover:bg-parchment-deep hover:border-oxblood hover:text-oxblood font-mono text-xs"
							onClick={() => window.open(publication.links.code, '_blank', 'noopener,noreferrer')}
						>
							<Code className="mr-1.5 h-3.5 w-3.5" />
							Code
						</Button>
					)}
					{publication.links.doi && (
						<Button
							size="sm"
							variant="outline"
							className="rounded-none border-rule text-ink hover:bg-parchment-deep hover:border-oxblood hover:text-oxblood font-mono text-xs"
							onClick={() => window.open(
								publication.links.doi?.startsWith('http') ? publication.links.doi : `https://doi.org/${publication.links.doi}`,
								'_blank',
								'noopener,noreferrer'
							)}
						>
							<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
							DOI
						</Button>
					)}
					{publication.links.website && (
						<Button
							size="sm"
							variant="outline"
							className="rounded-none border-rule text-ink hover:bg-parchment-deep hover:border-oxblood hover:text-oxblood font-mono text-xs"
							onClick={() => window.open(publication.links.website, '_blank', 'noopener,noreferrer')}
						>
							<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
							Website
						</Button>
					)}
					{publication.links.video && (
						<Button
							size="sm"
							variant="outline"
							className="rounded-none border-rule text-ink hover:bg-parchment-deep hover:border-oxblood hover:text-oxblood font-mono text-xs"
							onClick={() => window.open(publication.links.video, '_blank', 'noopener,noreferrer')}
						>
							<ExternalLink className="mr-1.5 h-3.5 w-3.5" />
							Video
						</Button>
					)}
				</CardFooter>
			)}
		</Card>
	);
};
