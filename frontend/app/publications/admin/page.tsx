"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { PublicationWithResources } from "@/types/publication";
import { getPublications, deletePublication } from "@/lib/api/publications";

export default function PublicationsAdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [publications, setPublications] = useState<PublicationWithResources[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login?redirect=/publications/admin");
      return;
    }

    if (user) {
      loadPublications();
    }
  }, [user, authLoading, router]);

  const loadPublications = async () => {
    try {
      setLoading(true);
      const data = await getPublications();
      setPublications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load publications");
    } finally {
      setLoading(false);
    }
  };

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
        return "bg-green-100 text-green-800";
      case "accepted":
        return "bg-blue-100 text-blue-800";
      case "under_review":
        return "bg-yellow-100 text-yellow-800";
      case "preprint":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/publications">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Manage Publications</h1>
          <p className="text-muted-foreground">
            Create, edit, and manage your research publications
          </p>
        </div>
        <Link href="/publications/admin/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> New Publication
          </Button>
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
          {error}
          <button onClick={() => setError(null)} className="float-right">
            &times;
          </button>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Publications ({publications.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {publications.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No publications yet</h3>
              <p className="text-muted-foreground mb-4">
                Get started by creating your first publication
              </p>
              <Link href="/publications/admin/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Create Publication
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resources</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publications.map((publication) => (
                  <TableRow key={publication.id}>
                    <TableCell className="font-medium max-w-xs truncate">
                      {publication.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{publication.project}</Badge>
                    </TableCell>
                    <TableCell>{publication.year}</TableCell>
                    <TableCell className="capitalize">{publication.type}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(publication.status)}>
                        {publication.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(publication.schemas?.length || 0) > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {publication.schemas?.length} schemas
                          </Badge>
                        )}
                        {(publication.collections?.length || 0) > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {publication.collections?.length} collections
                          </Badge>
                        )}
                        {(publication.extractionJobs?.length || 0) > 0 && (
                          <Badge variant="secondary" className="text-xs">
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
                              <Button variant="ghost" size="icon">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Link>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={deleting === publication.id}
                                >
                                  {deleting === publication.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Publication</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete &quot;{publication.title}&quot;?
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDelete(publication.id)}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">View only</span>
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
