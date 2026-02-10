"use client";

import { useEffect, useState } from 'react';
import { useEmailAlertStore } from '@/lib/store/emailAlertStore';
import { PageContainer } from '@/lib/styles/components';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Bell,
  BellOff,
  MoreVertical,
  Trash2,
  Edit,
  Search,
  Clock,
  Mail,
  Calendar,
  Bookmark,
  FileText,
  FolderOpen,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateEmailAlertDialog } from '@/components/CreateEmailAlertDialog';
import type {
  EmailAlertSubscription,
  AlertType,
  AlertFrequency,
  DigestDay,
  UpdateEmailAlertInput,
} from '@/types/email-alert';
import {
  ALERT_TYPE_LABELS,
  FREQUENCY_LABELS,
  DAY_LABELS,
} from '@/types/email-alert';

function AlertTypeIcon({ type }: { type: AlertType }) {
  switch (type) {
    case 'saved_search':
      return <Bookmark className="h-4 w-4 text-blue-500" />;
    case 'citation_update':
      return <FileText className="h-4 w-4 text-amber-500" />;
    case 'collection_change':
      return <FolderOpen className="h-4 w-4 text-green-500" />;
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatTime(timeStr: string): string {
  // Convert "09:00:00" to "9:00 AM"
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function AlertCard({
  alert,
  onToggle,
  onEdit,
  onDelete,
  onViewHistory,
}: {
  alert: EmailAlertSubscription;
  onToggle: (isActive: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewHistory: () => void;
}) {
  return (
    <div className={cn(
      "group relative rounded-lg border bg-card p-4 transition-all",
      alert.is_active
        ? "border-border hover:border-primary/30 hover:shadow-sm"
        : "border-border/50 opacity-60"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <AlertTypeIcon type={alert.alert_type} />
            <h3 className="font-medium text-sm truncate">{alert.name}</h3>
            <Switch
              checked={alert.is_active}
              onCheckedChange={onToggle}
              aria-label={`Toggle ${alert.name}`}
            />
          </div>

          {alert.description && (
            <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
              {alert.description}
            </p>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              {ALERT_TYPE_LABELS[alert.alert_type]}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Clock className="h-3 w-3 mr-1" />
              {FREQUENCY_LABELS[alert.frequency]}
            </Badge>
            {alert.frequency === 'weekly' && alert.digest_day && (
              <Badge variant="outline" className="text-xs">
                <Calendar className="h-3 w-3 mr-1" />
                {DAY_LABELS[alert.digest_day]}
              </Badge>
            )}
            {alert.frequency !== 'immediate' && (
              <Badge variant="outline" className="text-xs">
                {formatTime(alert.digest_time)}
              </Badge>
            )}
            {alert.saved_search && (
              <Badge variant="outline" className="text-xs">
                <Search className="h-3 w-3 mr-1" />
                {alert.saved_search.name}
              </Badge>
            )}
            {alert.email_address && (
              <Badge variant="outline" className="text-xs">
                <Mail className="h-3 w-3 mr-1" />
                {alert.email_address}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            {alert.last_sent_at && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Last sent {formatRelativeTime(alert.last_sent_at)}
              </span>
            )}
            {alert.trigger_count > 0 && (
              <span>{alert.trigger_count} notification{alert.trigger_count > 1 ? 's' : ''} sent</span>
            )}
            {!alert.last_sent_at && (
              <span className="italic">No notifications sent yet</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onViewHistory}>
                <History className="h-4 w-4 mr-2" />
                View History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default function EmailAlertsPage() {
  const {
    alerts,
    logs,
    isLoading,
    isLoadingLogs,
    error,
    fetchAlerts,
    updateAlert,
    deleteAlert,
    toggleAlert,
    fetchLogs,
  } = useEmailAlertStore();

  const [filterType, setFilterType] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<EmailAlertSubscription | null>(null);
  const [editTarget, setEditTarget] = useState<EmailAlertSubscription | null>(null);
  const [historyTarget, setHistoryTarget] = useState<EmailAlertSubscription | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFrequency, setEditFrequency] = useState<AlertFrequency>('daily');
  const [editDigestDay, setEditDigestDay] = useState<DigestDay>('monday');
  const [editDigestTime, setEditDigestTime] = useState('09:00');
  const [editEmail, setEditEmail] = useState('');

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const filteredAlerts = alerts.filter(a => {
    if (filterType !== 'all' && a.alert_type !== filterType) return false;
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        (a.description && a.description.toLowerCase().includes(q)) ||
        (a.saved_search?.name && a.saved_search.name.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const activeCount = alerts.filter(a => a.is_active).length;

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteAlert(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const handleEdit = (alert: EmailAlertSubscription) => {
    setEditTarget(alert);
    setEditName(alert.name);
    setEditDescription(alert.description || '');
    setEditFrequency(alert.frequency);
    setEditDigestDay(alert.digest_day || 'monday');
    setEditDigestTime(alert.digest_time?.slice(0, 5) || '09:00');
    setEditEmail(alert.email_address || '');
  };

  const handleSaveEdit = async () => {
    if (editTarget) {
      const updates: UpdateEmailAlertInput = {
        name: editName,
        description: editDescription || null,
        frequency: editFrequency,
        digest_day: editFrequency === 'weekly' ? editDigestDay : null,
        digest_time: editDigestTime + ':00',
        email_address: editEmail || null,
      };
      await updateAlert(editTarget.id, updates);
      setEditTarget(null);
    }
  };

  const handleViewHistory = (alert: EmailAlertSubscription) => {
    setHistoryTarget(alert);
    fetchLogs(alert.id);
  };

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Bell className="h-6 w-6 text-primary" />
              Email Alerts
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Get notified when new documents match your saved searches, citations change, or collections update
            </p>
          </div>
          <div className="flex items-center gap-2">
            {alerts.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {activeCount} active
              </Badge>
            )}
            <CreateEmailAlertDialog />
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter alerts..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant={filterType === 'all' ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilterType('all')}
              className="h-8 text-xs"
            >
              All
            </Button>
            <Button
              variant={filterType === 'saved_search' ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilterType('saved_search')}
              className="h-8 text-xs"
            >
              <Bookmark className="h-3 w-3 mr-1" />
              Searches
            </Button>
            <Button
              variant={filterType === 'citation_update' ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilterType('citation_update')}
              className="h-8 text-xs"
            >
              <FileText className="h-3 w-3 mr-1" />
              Citations
            </Button>
            <Button
              variant={filterType === 'collection_change' ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setFilterType('collection_change')}
              className="h-8 text-xs"
            >
              <FolderOpen className="h-3 w-3 mr-1" />
              Collections
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={() => fetchAlerts()} className="mt-4">
              Try again
            </Button>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="text-center py-12">
            <BellOff className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">No email alerts</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {searchFilter || filterType !== 'all'
                ? 'No alerts match your filter.'
                : 'Create an email alert to get notified about new documents matching your criteria.'}
            </p>
            {!searchFilter && filterType === 'all' && (
              <div className="mt-4">
                <CreateEmailAlertDialog />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAlerts.map(alert => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onToggle={(isActive) => toggleAlert(alert.id, isActive)}
                onEdit={() => handleEdit(alert)}
                onDelete={() => setDeleteTarget(alert)}
                onViewHistory={() => handleViewHistory(alert)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete email alert</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the alert &quot;{deleteTarget?.name}&quot;? You will stop receiving notifications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <AlertDialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit email alert</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Alert name"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Frequency</label>
              <Select value={editFrequency} onValueChange={(v) => setEditFrequency(v as AlertFrequency)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABELS) as AlertFrequency[]).map((freq) => (
                    <SelectItem key={freq} value={freq}>
                      {FREQUENCY_LABELS[freq]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editFrequency === 'weekly' && (
              <div>
                <label className="text-sm font-medium">Digest Day</label>
                <Select value={editDigestDay} onValueChange={(v) => setEditDigestDay(v as DigestDay)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(DAY_LABELS) as DigestDay[]).map((day) => (
                      <SelectItem key={day} value={day}>
                        {DAY_LABELS[day]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {editFrequency !== 'immediate' && (
              <div>
                <label className="text-sm font-medium">Delivery Time</label>
                <Input
                  type="time"
                  value={editDigestTime}
                  onChange={(e) => setEditDigestTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Email Address</label>
              <Input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="Leave empty to use account email"
                className="mt-1"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveEdit} disabled={!editName.trim()}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* History Dialog */}
      <AlertDialog open={!!historyTarget} onOpenChange={() => setHistoryTarget(null)}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Alert History: {historyTarget?.name}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {isLoadingLogs ? (
              <div className="space-y-2 py-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 rounded bg-muted animate-pulse" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No notification history yet.
              </p>
            ) : (
              <div className="space-y-2 py-2">
                {logs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 p-2 rounded border border-border text-sm">
                    <Badge
                      variant={
                        log.status === 'sent' ? 'secondary' :
                        log.status === 'failed' ? 'destructive' :
                        'outline'
                      }
                      className="text-xs shrink-0 mt-0.5"
                    >
                      {log.status}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{log.subject}</p>
                      {log.new_documents_count > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {log.new_documents_count} new document{log.new_documents_count > 1 ? 's' : ''}
                        </p>
                      )}
                      {log.error_message && (
                        <p className="text-xs text-destructive">{log.error_message}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {log.sent_at ? formatRelativeTime(log.sent_at) : formatRelativeTime(log.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}
