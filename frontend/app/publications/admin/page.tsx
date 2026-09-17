"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, BookOpen, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { StatusBadge } from "@/components/editorial";
import { PublicationWithResources, PublicationStatus } from "@/types/publication";
import { getPublications, deletePublication } from "@/lib/api/publications";

const statusLabelConfig: Record<PublicationStatus, string> = {
  [PublicationStatus.PUBLISHED]: "Published",
  [PublicationStatus.ACCEPTED]: "Accepted",
  [PublicationStatus.UNDER_REVIEW]: "Under Review",
  [PublicationStatus.PREPRINT]: "Preprint",
};

export default function PublicationsAdminPage() {
  const { user } = useAuth();
  const [publications, setPublications] = useState<PublicationWithResources[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadPublications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPublications();
      setPublications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load publications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadPublications();
    }
  }, [loadPublications, user]);

  const handleDelete = async (id: string) => {
    try {
      setDeleting(id);
      await deletePublication(id);
      setPublications(publications.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete publication");
    } finally {
      setDeleting(null);
    }
  };

  const canEdit = (publication: PublicationWithResources) => {
    // User can edit if they created it OR if userId is null (system publications)
    return !publication.userId || publication.userId === user?.id;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-ink-soft" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/publications">
          <Button variant="ghost" size="icon" className="rounded-none hover:bg-parchment-deep text-ink">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Manage Publications</h1>
          <p className="text-sm text-ink-soft">
            Create, edit, and manage your research publications
          </p>
        </div>
        <Link href="/publications/admin/new">
          <Button className="rounded-none bg-oxblood hover:bg-oxblood-deep text-white font-mono text-xs uppercase tracking-wider">
            <Plus className="mr-2 h-4 w-4" /> New Publication
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-parchment-deep border border-oxblood text-oxblood px-4 py-3 rounded-none mb-6 text-sm">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">
            &times;
          </button>
        </div>
      )}

      <Card className="rounded-none border border-rule bg-parchment shadow-none">
        <CardHeader>
          <CardTitle className="font-serif text-xl font-bold text-ink flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-oxblood" />
            Publications ({publications.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {publications.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-ink-soft mb-4" />
              <h3 className="font-serif text-lg font-medium text-ink mb-2">No publications yet</h3>
              <p className="text-sm text-ink-soft mb-4">
                Get started by creating your first publication
              </p>
              <Link href="/publications/admin/new">
                <Button className="rounded-none bg-oxblood hover:bg-oxblood-deep text-white font-mono text-xs uppercase tracking-wider">
                  <Plus className="mr-2 h-4 w-4" /> Create Publication
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b border-rule hover:bg-transparent">
                  <TableHead className="font-mono text-xs uppercase text-ink-soft">Title</TableHead>
                  <TableHead className="font-mono text-xs uppercase text-ink-soft">Project</TableHead>
                  <TableHead className="font-mono text-xs uppercase text-ink-soft">Year</TableHead>
                  <TableHead className="font-mono text-xs uppercase text-ink-soft">Type</TableHead>
                  <TableHead className="font-mono text-xs uppercase text-ink-soft">Status</TableHead>
                  <TableHead className="font-mono text-xs uppercase text-ink-soft">Resources</TableHead>
                  <TableHead className="text-right font-mono text-xs uppercase text-ink-soft">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publications.map((publication) => (
                  <TableRow key={publication.id} className="border-b border-rule hover:bg-parchment-deep/40">
                    <TableCell className="font-medium text-ink max-w-xs truncate">
                      {publication.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs border-rule rounded-none text-ink-soft">
                        {publication.project}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-ink-soft">{publication.year}</TableCell>
                    <TableCell className="capitalize text-sm text-ink">{publication.type}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={publication.status}
                        label={statusLabelConfig[publication.status] ?? publication.status}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(publication.schemas?.length || 0) > 0 && (
                          <Badge variant="secondary" className="text-xs font-mono rounded-none border border-rule bg-parchment-deep text-ink-soft">
                            {publication.schemas?.length} schemas
                          </Badge>
                        )}
                        {(publication.collections?.length || 0) > 0 && (
                          <Badge variant="secondary" className="text-xs font-mono rounded-none border border-rule bg-parchment-deep text-ink-soft">
                            {publication.collections?.length} collections
                          </Badge>
                        )}
                        {(publication.extractionJobs?.length || 0) > 0 && (
                          <Badge variant="secondary" className="text-xs font-mono rounded-none border border-rule bg-parchment-deep text-ink-soft">
                            {publication.extractionJobs?.length} jobs
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {canEdit(publication) ? (
                          <>
                            <Link href={`/publications/admin/${publication.id}`}>
                              <Button variant="ghost" size="icon" className="rounded-none hover:bg-parchment-deep text-ink-soft hover:text-ink">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Link>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={deleting === publication.id}
                                  className="rounded-none hover:bg-parchment-deep text-ink-soft hover:text-oxblood"
                                >
                                  {deleting === publication.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-oxblood" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-oxblood" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-none border border-rule bg-parchment">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="font-serif text-xl font-bold text-ink">Delete Publication</AlertDialogTitle>
                                  <AlertDialogDescription className="text-ink-soft text-sm">
                                    Are you sure you want to delete &quot;{publication.title}&quot;?
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-none border border-rule text-ink hover:bg-parchment-deep">Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(publication.id)}
                                    className="rounded-none bg-oxblood hover:bg-oxblood-deep text-white font-mono text-xs uppercase"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        ) : (
                          <span className="text-xs font-mono text-ink-soft">View only</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
