"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Bell, Plus, Check } from 'lucide-react';
import { useEmailAlertStore } from '@/lib/store/emailAlertStore';
import { useSavedSearchStore } from '@/lib/store/savedSearchStore';
import type {
  AlertType,
  AlertFrequency,
  DigestDay,
  CreateEmailAlertInput,
} from '@/types/email-alert';
import { ALERT_TYPE_LABELS, FREQUENCY_LABELS, DAY_LABELS } from '@/types/email-alert';

interface CreateEmailAlertDialogProps {
  /** Pre-select alert type */
  defaultAlertType?: AlertType;
  /** Pre-select a saved search */
  defaultSavedSearchId?: string;
  /** Custom trigger button */
  trigger?: React.ReactNode;
}

export function CreateEmailAlertDialog({
  defaultAlertType,
  defaultSavedSearchId,
  trigger,
}: CreateEmailAlertDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [alertType, setAlertType] = useState<AlertType>(defaultAlertType || 'saved_search');
  const [savedSearchId, setSavedSearchId] = useState(defaultSavedSearchId || '');
  const [documentId, setDocumentId] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [frequency, setFrequency] = useState<AlertFrequency>('daily');
  const [digestDay, setDigestDay] = useState<DigestDay>('monday');
  const [digestTime, setDigestTime] = useState('09:00');
  const [emailAddress, setEmailAddress] = useState('');

  const { createAlert } = useEmailAlertStore();
  const { searches, fetchSearches } = useSavedSearchStore();

  useEffect(() => {
    if (open && searches.length === 0) {
      fetchSearches();
    }
  }, [open, searches.length, fetchSearches]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setAlertType(defaultAlertType || 'saved_search');
    setSavedSearchId(defaultSavedSearchId || '');
    setDocumentId('');
    setCollectionId('');
    setFrequency('daily');
    setDigestDay('monday');
    setDigestTime('09:00');
    setEmailAddress('');
    setSuccess(false);
    setSaving(false);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);

    const input: CreateEmailAlertInput = {
      alert_type: alertType,
      name: name.trim(),
      description: description.trim() || undefined,
      frequency,
      digest_time: digestTime + ':00',
      email_address: emailAddress.trim() || undefined,
    };

    if (alertType === 'saved_search') {
      input.saved_search_id = savedSearchId;
    } else if (alertType === 'citation_update') {
      input.document_id = documentId;
    } else if (alertType === 'collection_change') {
      input.collection_id = collectionId;
    }

    if (frequency === 'weekly') {
      input.digest_day = digestDay;
    }

    const result = await createAlert(input);

    if (result) {
      setSuccess(true);
      setTimeout(() => {
        setOpen(false);
        resetForm();
      }, 800);
    } else {
      setSaving(false);
    }
  };

  const canSave = () => {
    if (!name.trim()) return false;
    if (alertType === 'saved_search' && !savedSearchId) return false;
    if (alertType === 'citation_update' && !documentId.trim()) return false;
    if (alertType === 'collection_change' && !collectionId.trim()) return false;
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Alert
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {success ? (
              <>
                <Check className="h-5 w-5 text-green-500" />
                Alert Created
              </>
            ) : (
              <>
                <Bell className="h-5 w-5" />
                Create Email Alert
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            You will receive email notifications based on your settings.
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Name */}
            <div>
              <label className="text-sm font-medium">Alert Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., New VAT rulings"
                maxLength={200}
                className="mt-1"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium">Description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="mt-1"
              />
            </div>

            {/* Alert Type */}
            <div>
              <label className="text-sm font-medium">Alert Type *</label>
              <Select value={alertType} onValueChange={(v) => setAlertType(v as AlertType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ALERT_TYPE_LABELS) as AlertType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {ALERT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reference Selection based on alert type */}
            {alertType === 'saved_search' && (
              <div>
                <label className="text-sm font-medium">Saved Search *</label>
                <Select value={savedSearchId} onValueChange={setSavedSearchId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a saved search" />
                  </SelectTrigger>
                  <SelectContent>
                    {searches.map((search) => (
                      <SelectItem key={search.id} value={search.id}>
                        {search.name}
                      </SelectItem>
                    ))}
                    {searches.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No saved searches found
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {alertType === 'citation_update' && (
              <div>
                <label className="text-sm font-medium">Document ID *</label>
                <Input
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  placeholder="Enter document ID to watch"
                  className="mt-1"
                />
              </div>
            )}

            {alertType === 'collection_change' && (
              <div>
                <label className="text-sm font-medium">Collection ID *</label>
                <Input
                  value={collectionId}
                  onChange={(e) => setCollectionId(e.target.value)}
                  placeholder="Enter collection ID to watch"
                  className="mt-1"
                />
              </div>
            )}

            {/* Frequency */}
            <div>
              <label className="text-sm font-medium">Frequency *</label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as AlertFrequency)}>
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

            {/* Weekly digest day */}
            {frequency === 'weekly' && (
              <div>
                <label className="text-sm font-medium">Digest Day</label>
                <Select value={digestDay} onValueChange={(v) => setDigestDay(v as DigestDay)}>
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

            {/* Digest time (for daily/weekly) */}
            {frequency !== 'immediate' && (
              <div>
                <label className="text-sm font-medium">Delivery Time</label>
                <Input
                  type="time"
                  value={digestTime}
                  onChange={(e) => setDigestTime(e.target.value)}
                  className="mt-1"
                />
              </div>
            )}

            {/* Email override */}
            <div>
              <label className="text-sm font-medium">Email Address</label>
              <Input
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="Leave empty to use account email"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional. Defaults to your account email.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {!success && (
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!canSave() || saving}
              >
                {saving ? 'Creating...' : 'Create Alert'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
