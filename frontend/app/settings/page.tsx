"use client";

/**
 * Settings Page
 *
 * Centralized location for user preferences and administrative functions
 * that were previously scattered across the navigation
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
 User,
 Bell,
 Shield,
 Database,
 PieChart,
 ArrowRight,
 ExternalLink,
 Settings as SettingsIcon,
 KeyRound,
 Brain,
 Check,
 Loader2,
 AlertCircle,
 Zap,
 Globe,
 Cpu,
 Mail,
 MessageSquare,
 Webhook,
 Trash2,
 Plus,
 Pencil,
 X,
} from "lucide-react";
import { Header } from "@/lib/styles/components";
import { useEmailAlertStore } from "@/lib/store/emailAlertStore";
import type { EmailAlertSubscription, CreateEmailAlertInput, UpdateEmailAlertInput } from "@/types/email-alert";

interface EmbeddingModel {
 id: string;
 provider: string;
 model_name: string;
 dimensions: number;
 max_input_length: number;
 description: string;
 is_default: boolean;
 is_active: boolean;
 api_key_configured: boolean;
}

function EmbeddingModelsSection() {
 const [models, setModels] = useState<EmbeddingModel[]>([]);
 const [activeModelId, setActiveModelId] = useState<string>("");
 const [loading, setLoading] = useState(true);
 const [switching, setSwitching] = useState<string | null>(null);
 const [testing, setTesting] = useState<string | null>(null);
 const [testResult, setTestResult] = useState<{ modelId: string; success: boolean; message: string } | null>(null);
 const [error, setError] = useState<string | null>(null);

 const fetchModels = useCallback(async () => {
 try {
 setLoading(true);
 const response = await fetch("/api/embeddings?endpoint=models");
 if (!response.ok) throw new Error("Failed to fetch models");
 const data = await response.json();
 setModels(data.models || []);
 setActiveModelId(data.active_model_id || "");
 setError(null);
 } catch (err) {
 setError("Failed to load embedding models. The backend may be unavailable.");
 } finally {
 setLoading(false);
 }
 }, []);

 useEffect(() => {
 fetchModels();
 }, [fetchModels]);

 const handleSetActive = async (modelId: string) => {
 setSwitching(modelId);
 setTestResult(null);
 try {
 const response = await fetch("/api/embeddings?action=set-active", {
 method: "POST",
 headers: {"Content-Type": "application/json"},
 body: JSON.stringify({ model_id: modelId }),
 });
 if (!response.ok) {
 const err = await response.json().catch(() => ({ detail: "Failed to switch model"}));
 throw new Error(err.detail || "Failed to switch model");
 }
 setActiveModelId(modelId);
 setModels((prev) =>
 prev.map((m) => ({ ...m, is_active: m.id === modelId }))
 );
 } catch (err) {
 setError(err instanceof Error ? err.message : "Failed to switch model");
 } finally {
 setSwitching(null);
 }
 };

 const handleTestModel = async (modelId: string) => {
 setTesting(modelId);
 setTestResult(null);
 try {
 const response = await fetch("/api/embeddings?action=test", {
 method: "POST",
 headers: {"Content-Type": "application/json"},
 body: JSON.stringify({
 text: "Przepisy dotyczące podatku VAT w kontekście transakcji wewnątrzwspólnotowych",
 model_id: modelId,
 }),
 });
 const data = await response.json();
 if (!response.ok) {
 setTestResult({ modelId, success: false, message: data.detail || "Test failed"});
 } else {
 setTestResult({ modelId, success: true, message: `${data.dimensions}-dim embedding generated` });
 }
 } catch {
 setTestResult({ modelId, success: false, message: "Connection error"});
 } finally {
 setTesting(null);
 }
 };

 const providerIcon = (provider: string) => {
 switch (provider) {
 case"openai": return <Zap className="h-4 w-4"/>;
 case"cohere": return <Globe className="h-4 w-4"/>;
 case"local": return <Cpu className="h-4 w-4"/>;
 default: return <Brain className="h-4 w-4"/>;
 }
 };

 const providerColor = (provider: string) => {
 switch (provider) {
 case"openai": return"bg-green-100 text-green-800";
 case"cohere": return"bg-purple-100 text-purple-800";
 case"local": return"bg-blue-100 text-blue-800";
 default: return"bg-gray-100 text-gray-800";
 }
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center py-12">
 <Loader2 className="h-6 w-6 animate-spin text-muted-foreground"/>
 <span className="ml-2 text-sm text-muted-foreground">Loading embedding models...</span>
 </div>
 );
 }

 const isAllowed = (model: EmbeddingModel) => model.model_name === "BAAI/bge-m3";

 return (
 <div className="space-y-4">
 {error && (
 <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
 <AlertCircle className="h-4 w-4 flex-shrink-0"/>
 {error}
 </div>
 )}

 <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm border border-amber-200">
 <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5"/>
 <span>
 Only <strong>BAAI/bge-m3</strong> can be activated at the moment. Other models are listed
 for reference — in the future we plan to investigate how different embeddings perform on
 Polish legal texts and re-enable selection.
 </span>
 </div>

 {models.map((model) => (
 <div
 key={model.id}
 className={`p-4 rounded-lg border transition-colors ${
 model.is_active
 ? "border-primary bg-primary/5"
 : "border-border hover:border-muted-foreground/30"
 }`}
 >
 <div className="flex items-start justify-between gap-4">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <span className="font-medium">{model.model_name}</span>
 <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${providerColor(model.provider)}`}>
 {providerIcon(model.provider)}
 {model.provider}
 </span>
 {model.is_active && (
 <Badge variant="default"className="text-xs">
 <Check className="h-3 w-3 mr-1"/>
 Active
 </Badge>
 )}
 {!model.api_key_configured && (
 <Badge variant="outline"className="text-xs text-amber-600 border-amber-300">
 <AlertCircle className="h-3 w-3 mr-1"/>
 API key missing
 </Badge>
 )}
 </div>
 <p className="text-sm text-muted-foreground mt-1">{model.description}</p>
 <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
 <span>{model.dimensions} dimensions</span>
 <span>Max input: {model.max_input_length} chars</span>
 </div>
 {testResult && testResult.modelId === model.id && (
 <div
 className={`mt-2 text-xs px-2 py-1 rounded ${
 testResult.success
 ? "bg-green-50 text-green-700"
 : "bg-red-50 text-red-700"
 }`}
 >
 {testResult.success ? "Test passed": "Test failed"}: {testResult.message}
 </div>
 )}
 </div>
 <div className="flex gap-2 flex-shrink-0">
 <Button
 variant="outline"
 size="sm"
 onClick={() => handleTestModel(model.id)}
 disabled={testing === model.id || !model.api_key_configured}
 >
 {testing === model.id ? (
 <Loader2 className="h-3 w-3 animate-spin mr-1"/>
 ) : null}
 Test
 </Button>
 {!model.is_active && (
 <Button
 variant="default"
 size="sm"
 onClick={() => handleSetActive(model.id)}
 disabled={switching === model.id || !model.api_key_configured || !isAllowed(model)}
 title={!isAllowed(model) ? "Only BAAI/bge-m3 can be activated right now": undefined}
 >
 {switching === model.id ? (
 <Loader2 className="h-3 w-3 animate-spin mr-1"/>
 ) : null}
 Activate
 </Button>
 )}
 </div>
 </div>
 </div>
 ))}
 </div>
 );
}

/** Channel display config for badges and icons */
const CHANNEL_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  email: {
    label: "Email",
    icon: <Mail className="h-3 w-3" />,
    color: "bg-blue-100 text-blue-800",
  },
  in_app: {
    label: "In-App",
    icon: <Bell className="h-3 w-3" />,
    color: "bg-green-100 text-green-800",
  },
  webhook: {
    label: "Webhook",
    icon: <Webhook className="h-3 w-3" />,
    color: "bg-purple-100 text-purple-800",
  },
};

interface SubscriptionFormData {
  name: string;
  query: string;
  frequency: "daily" | "weekly";
  channels: string[];
  webhook_url: string;
}

const EMPTY_FORM: SubscriptionFormData = {
  name: "",
  query: "",
  frequency: "daily",
  channels: ["email"],
  webhook_url: "",
};

function DigestSubscriptionsSection() {
  const {
    alerts,
    isLoading,
    error,
    fetchAlerts,
    createAlert,
    updateAlert,
    deleteAlert,
    toggleAlert,
  } = useEmailAlertStore();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SubscriptionFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setShowForm(false);
    setEditingId(null);
  };

  const handleEdit = (alert: EmailAlertSubscription) => {
    setForm({
      name: alert.name,
      query: alert.query,
      frequency: alert.frequency,
      channels: [...alert.channels],
      webhook_url: alert.webhook_url || "",
    });
    setEditingId(alert.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.query.trim()) return;

    setSubmitting(true);

    if (editingId) {
      const input: UpdateEmailAlertInput = {
        name: form.name.trim(),
        query: form.query.trim(),
        frequency: form.frequency,
        channels: form.channels,
        webhook_url: form.channels.includes("webhook") ? form.webhook_url.trim() : undefined,
      };
      await updateAlert(editingId, input);
    } else {
      const input: CreateEmailAlertInput = {
        name: form.name.trim(),
        query: form.query.trim(),
        frequency: form.frequency,
        channels: form.channels,
        webhook_url: form.channels.includes("webhook") ? form.webhook_url.trim() : undefined,
      };
      await createAlert(input);
    }

    setSubmitting(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await deleteAlert(id);
    setDeletingId(null);
  };

  const handleChannelToggle = (channel: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      channels: checked
        ? [...prev.channels, channel]
        : prev.channels.filter((c) => c !== channel),
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading subscriptions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Subscription list */}
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-4 rounded-lg border transition-colors ${
            alert.is_active
              ? "border-border"
              : "border-border bg-muted/30 opacity-75"
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{alert.name}</span>
                <Badge variant="outline" className="text-xs">
                  {alert.frequency === "daily" ? "Daily" : "Weekly"}
                </Badge>
                {alert.channels.map((channel) => {
                  const config = CHANNEL_CONFIG[channel];
                  if (!config) return null;
                  return (
                    <span
                      key={channel}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}
                    >
                      {config.icon}
                      {config.label}
                    </span>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                <MessageSquare className="h-3 w-3 inline mr-1" />
                {alert.query}
              </p>
              {alert.last_sent_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last sent: {new Date(alert.last_sent_at).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Switch
                checked={alert.is_active}
                onCheckedChange={(checked) => toggleAlert(alert.id, checked)}
                aria-label={`Toggle ${alert.name}`}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(alert)}
                className="h-8 w-8 p-0"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Edit</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(alert.id)}
                disabled={deletingId === alert.id}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              >
                {deletingId === alert.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span className="sr-only">Delete</span>
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* Empty state */}
      {alerts.length === 0 && !showForm && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No digest subscriptions yet.</p>
          <p className="mt-1">Create one to receive notifications about new matching judgments.</p>
        </div>
      )}

      {/* Inline form for creating / editing */}
      {showForm && (
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">
              {editingId ? "Edit Subscription" : "New Subscription"}
            </p>
            <Button variant="ghost" size="sm" onClick={resetForm} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
              <span className="sr-only">Cancel</span>
            </Button>
          </div>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="alert-name">Name</Label>
              <Input
                id="alert-name"
                placeholder="e.g. Tax law updates"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="alert-query">Search Query</Label>
              <Input
                id="alert-query"
                placeholder="e.g. VAT deductions in construction"
                value={form.query}
                onChange={(e) => setForm((prev) => ({ ...prev, query: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    value="daily"
                    checked={form.frequency === "daily"}
                    onChange={() => setForm((prev) => ({ ...prev, frequency: "daily" }))}
                    className="accent-primary"
                  />
                  Daily
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="frequency"
                    value="weekly"
                    checked={form.frequency === "weekly"}
                    onChange={() => setForm((prev) => ({ ...prev, frequency: "weekly" }))}
                    className="accent-primary"
                  />
                  Weekly
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Channels</Label>
              <div className="flex gap-4">
                {Object.entries(CHANNEL_CONFIG).map(([key, config]) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={form.channels.includes(key)}
                      onCheckedChange={(checked) =>
                        handleChannelToggle(key, checked === true)
                      }
                    />
                    <span className="flex items-center gap-1">
                      {config.icon}
                      {config.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {form.channels.includes("webhook") && (
              <div className="space-y-1.5">
                <Label htmlFor="alert-webhook">Webhook URL</Label>
                <Input
                  id="alert-webhook"
                  placeholder="https://hooks.slack.com/services/..."
                  value={form.webhook_url}
                  onChange={(e) => setForm((prev) => ({ ...prev, webhook_url: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Slack or Discord webhook endpoint
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={submitting || !form.name.trim() || !form.query.trim() || form.channels.length === 0}
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {editingId ? "Save Changes" : "Create Subscription"}
            </Button>
            <Button variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Add button */}
      {!showForm && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditingId(null);
            setShowForm(true);
          }}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Subscription
        </Button>
      )}
    </div>
  );
}

export default function SettingsPage() {
 const { user } = useAuth();

 return (
 <div className="container mx-auto px-6 py-8 max-w-6xl">
 <Header
 icon={SettingsIcon}
 title="Settings"
 size="4xl"
 description="Manage your account preferences and view administrative tools"
 className="mb-8"
 />

 <Tabs defaultValue="account"className="space-y-6">
 <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
 <TabsTrigger value="account">Account</TabsTrigger>
 <TabsTrigger value="preferences">Preferences</TabsTrigger>
 <TabsTrigger value="ai-models">AI Models</TabsTrigger>
 <TabsTrigger value="data">Data & Privacy</TabsTrigger>
 <TabsTrigger value="admin">Administration</TabsTrigger>
 </TabsList>

 {/* Account Settings */}
 <TabsContent value="account"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <User className="h-5 w-5"/>
 Profile Information
 </CardTitle>
 <CardDescription>
 View and manage your account details
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="space-y-2">
 <label className="text-sm font-medium">Email</label>
 <p className="text-sm text-muted-foreground">
 {user?.email || "Not available"}
 </p>
 </div>
 <div className="space-y-2">
 <label className="text-sm font-medium">User ID</label>
 <p className="text-sm text-muted-foreground font-mono">
 {user?.id || "Not available"}
 </p>
 </div>
 <Separator />
 <div className="flex gap-2">
 <Button variant="outline"size="sm">
 Edit Profile
 </Button>
 <Button variant="outline"size="sm">
 Change Password
 </Button>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* Preferences */}
 <TabsContent value="preferences"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Bell className="h-5 w-5"/>
 Digest Subscriptions
 </CardTitle>
 <CardDescription>
 Subscribe to periodic digests of new court judgments matching your search queries.
 Receive updates via email, in-app notifications, or webhook integrations.
 </CardDescription>
 </CardHeader>
 <CardContent>
 <DigestSubscriptionsSection />
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Display Preferences</CardTitle>
 <CardDescription>
 Customize your viewing experience
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="font-medium">Theme</p>
 <p className="text-sm text-muted-foreground">
 Currently using system preference
 </p>
 </div>
 <Button variant="outline"size="sm">
 Change
 </Button>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* AI Models */}
 <TabsContent value="ai-models"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Brain className="h-5 w-5"/>
 Embedding Models
 </CardTitle>
 <CardDescription>
 Configure which embedding model is used for document search and similarity. Different models offer trade-offs between quality, speed, and cost.
 </CardDescription>
 </CardHeader>
 <CardContent>
 <EmbeddingModelsSection />
 </CardContent>
 </Card>

 <Card className="border-blue-200 bg-blue-50/50">
 <CardHeader>
 <CardTitle className="text-blue-900 text-sm">
 About Embedding Models
 </CardTitle>
 </CardHeader>
 <CardContent className="space-y-2">
 <p className="text-sm text-blue-800">
 Embedding models convert text into numerical vectors used for semantic search.
 Switching models affects how new searches are performed but does not re-embed existing documents.
 </p>
 <p className="text-sm text-blue-800">
 The platform currently uses <strong>BAAI/bge-m3</strong> — a multilingual model that performs
 well on Polish legal texts. Other providers (<strong>OpenAI</strong>, <strong>Cohere</strong>,
 alternative <strong>local</strong> models) are listed for reference and will be evaluated in
 future experiments comparing embedding quality on our corpus.
 </p>
 </CardContent>
 </Card>
 </TabsContent>

 {/* Data & Privacy */}
 <TabsContent value="data"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Shield className="h-5 w-5"/>
 Privacy & Data
 </CardTitle>
 <CardDescription>
 Manage your data and privacy settings
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <div className="flex items-center justify-between">
 <div>
 <p className="font-medium">Download your data</p>
 <p className="text-sm text-muted-foreground">
 Export your collections and search history
 </p>
 </div>
 <Button variant="outline"size="sm">
 <ExternalLink className="h-4 w-4 mr-2"/>
 Export
 </Button>
 </div>
 <Separator />
 <div className="flex items-center justify-between">
 <div>
 <p className="font-medium">Delete account</p>
 <p className="text-sm text-muted-foreground">
 Permanently remove your account and data
 </p>
 </div>
 <Button variant="destructive"size="sm">
 Delete
 </Button>
 </div>
 </CardContent>
 </Card>

 <Card>
 <CardHeader>
 <CardTitle>Privacy Policy</CardTitle>
 <CardDescription>
 Review our data handling practices
 </CardDescription>
 </CardHeader>
 <CardContent>
 <div className="flex items-center justify-between">
 <p className="text-sm text-muted-foreground">
 Last updated: January 2025
 </p>
 <Button variant="link"size="sm"asChild>
 <Link href="/privacy">
 Read Policy
 <ArrowRight className="h-4 w-4 ml-1"/>
 </Link>
 </Button>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 {/* Administration */}
 <TabsContent value="admin"className="space-y-6">
 <Card>
 <CardHeader>
 <CardTitle className="flex items-center gap-2">
 <Database className="h-5 w-5"/>
 Administrative Tools
 </CardTitle>
 <CardDescription>
 Access advanced features and analytics
 </CardDescription>
 </CardHeader>
 <CardContent className="space-y-4">
 <Link
 href="/statistics"
 className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
 >
 <div className="flex items-center gap-3">
 <PieChart className="h-5 w-5 text-muted-foreground"/>
 <div>
 <p className="font-medium">Database Statistics</p>
 <p className="text-sm text-muted-foreground">
 View metrics and analytics
 </p>
 </div>
 </div>
 <ArrowRight className="h-5 w-5 text-muted-foreground"/>
 </Link>

 <Link
 href="/settings/sso"
 className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
 >
 <div className="flex items-center gap-3">
 <KeyRound className="h-5 w-5 text-muted-foreground"/>
 <div>
 <p className="font-medium">SSO Connections</p>
 <p className="text-sm text-muted-foreground">
 Manage SAML 2.0 and OAuth 2.0 enterprise SSO
 </p>
 </div>
 </div>
 <ArrowRight className="h-5 w-5 text-muted-foreground"/>
 </Link>
 </CardContent>
 </Card>

 <Card className="border-amber-200 bg-amber-50/50">
 <CardHeader>
 <CardTitle className="text-amber-900">
 Research Project Notice
 </CardTitle>
 </CardHeader>
 <CardContent>
 <p className="text-sm text-amber-800">
 This platform is a research project by Wroclaw University of Science and Technology.
 Some administrative features may require special permissions.
 </p>
 </CardContent>
 </Card>
 </TabsContent>
 </Tabs>
 </div>
 );
}
