"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  History,
  GitBranch,
  RotateCcw,
  Eye,
  Clock,
  User,
  FileText,
  ChevronDown,
  ChevronRight,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Schema version from database
 */
interface SchemaVersion {
  id: string;
  schema_id: string;
  version_number: number;
  change_type: 'create' | 'ai_update' | 'visual_edit' | 'code_edit' | 'bulk_import' | 'rollback' | 'merge';
  change_summary: string | null;
  changed_fields: string[] | null;
  diff_from_previous: Record<string, unknown> | null;
  user_id: string | null;
  created_at: string;
  schema_snapshot: Record<string, unknown>;
  field_snapshot: unknown[];
}

interface SchemaVersionHistoryProps {
  schemaId: string;
  schemaName: string;
  currentVersion?: number;
  onVersionRestored?: () => void;
}

/**
 * SchemaVersionHistory - Timeline visualization of schema version history
 * with comparison and rollback capabilities
 */
export function SchemaVersionHistory({
  schemaId,
  schemaName,
  currentVersion,
  onVersionRestored,
}: SchemaVersionHistoryProps) {
  const [versions, setVersions] = useState<SchemaVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState<SchemaVersion | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [isRollingBack, setIsRollingBack] = useState(false);

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/schemas/${schemaId}/versions`);
      if (!response.ok) throw new Error('Failed to fetch versions');

      const data = await response.json();
      setVersions(data.versions || []);
    } catch (error) {
      console.error('Error fetching versions:', error);
      toast.error('Failed to load version history');
    } finally {
      setLoading(false);
    }
  }, [schemaId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleRollback = async (versionNumber: number) => {
    if (!confirm(`Are you sure you want to rollback to version ${versionNumber}? This will replace the current schema.`)) {
      return;
    }

    try {
      setIsRollingBack(true);
      const response = await fetch(`/api/schemas/${schemaId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_number: versionNumber }),
      });

      if (!response.ok) throw new Error('Failed to rollback');

      toast.success(`Successfully rolled back to version ${versionNumber}`);
      setSelectedVersion(null);
      await fetchVersions();
      onVersionRestored?.();
    } catch (error) {
      console.error('Error rolling back:', error);
      toast.error('Failed to rollback schema');
    } finally {
      setIsRollingBack(false);
    }
  };

  const toggleExpanded = (versionId: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        next.add(versionId);
      }
      return next;
    });
  };

  const getChangeTypeColor = (changeType: string) => {
    switch (changeType) {
      case 'create':
        return 'bg-green-500';
      case 'ai_update':
        return 'bg-purple-500';
      case 'visual_edit':
        return 'bg-blue-500';
      case 'code_edit':
        return 'bg-orange-500';
      case 'rollback':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getChangeTypeIcon = (changeType: string) => {
    switch (changeType) {
      case 'create':
        return <FileText className="h-4 w-4" />;
      case 'ai_update':
        return <GitBranch className="h-4 w-4" />;
      case 'visual_edit':
        return <Eye className="h-4 w-4" />;
      case 'code_edit':
        return <FileText className="h-4 w-4" />;
      case 'rollback':
        return <RotateCcw className="h-4 w-4" />;
      default:
        return <History className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (versions.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No version history available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
            <Badge variant="secondary" className="ml-auto">
              {versions.length} version{versions.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-0 bottom-0 w-0.5 bg-border" />

              {/* Version cards */}
              <div className="space-y-4">
                {versions.map((version, index) => {
                  const isExpanded = expandedVersions.has(version.id);
                  const isCurrent = version.version_number === currentVersion;
                  const fieldCount = Array.isArray(version.field_snapshot)
                    ? version.field_snapshot.length
                    : 0;

                  return (
                    <div key={version.id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div
                        className={cn(
                          'absolute left-0 top-2 w-8 h-8 rounded-full border-4 border-background flex items-center justify-center',
                          getChangeTypeColor(version.change_type)
                        )}
                      >
                        {isCurrent ? (
                          <Check className="h-4 w-4 text-white" />
                        ) : (
                          <span className="text-xs font-bold text-white">
                            {version.version_number}
                          </span>
                        )}
                      </div>

                      {/* Version card */}
                      <Card className={cn('transition-all', isCurrent && 'ring-2 ring-primary')}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold">
                                  Version {version.version_number}
                                </h4>
                                {isCurrent && (
                                  <Badge variant="default" className="text-xs">
                                    Current
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {version.change_type.replace('_', ' ')}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {version.change_summary || 'No description'}
                              </p>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleExpanded(version.id)}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </div>

                          {/* Metadata */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDate(version.created_at)}
                            </div>
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {fieldCount} field{fieldCount !== 1 ? 's' : ''}
                            </div>
                            {version.changed_fields && version.changed_fields.length > 0 && (
                              <div className="flex items-center gap-1">
                                <GitBranch className="h-3 w-3" />
                                {version.changed_fields.length} changed
                              </div>
                            )}
                          </div>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="pt-3 border-t space-y-3">
                              {version.changed_fields && version.changed_fields.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium mb-1">Changed Fields:</p>
                                  <div className="flex flex-wrap gap-1">
                                    {version.changed_fields.map((field, i) => (
                                      <Badge key={i} variant="secondary" className="text-xs">
                                        {field}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {version.diff_from_previous && (
                                <div>
                                  <p className="text-xs font-medium mb-1">Changes:</p>
                                  <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                                    {JSON.stringify(version.diff_from_previous, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Actions */}
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedVersion(version)}
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  View Details
                                </Button>
                                {!isCurrent && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRollback(version.version_number)}
                                    disabled={isRollingBack}
                                  >
                                    <RotateCcw className="h-3 w-3 mr-1" />
                                    Restore
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Version detail dialog */}
      <Dialog open={!!selectedVersion} onOpenChange={() => setSelectedVersion(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Version {selectedVersion?.version_number} Details
            </DialogTitle>
            <DialogDescription>
              {schemaName} • {selectedVersion && formatDate(selectedVersion.created_at)}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {selectedVersion && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Schema Snapshot</h4>
                  <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
                    {JSON.stringify(selectedVersion.schema_snapshot, null, 2)}
                  </pre>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">
                    Fields ({Array.isArray(selectedVersion.field_snapshot) ? selectedVersion.field_snapshot.length : 0})
                  </h4>
                  <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
                    {JSON.stringify(selectedVersion.field_snapshot, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
