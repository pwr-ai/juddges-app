"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KeyRound,
  Plus,
  Building2,
  Globe,
  Shield,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import { Header, Breadcrumb } from "@/lib/styles/components";
import Link from "next/link";

interface SSOConnection {
  id: string;
  name: string;
  slug: string;
  organization: string;
  provider_type: "saml" | "oauth";
  status: "active" | "inactive" | "pending";
  domain: string;
  auto_provision_users: boolean;
  default_account_type: string;
  supabase_provider_id?: string;
  created_at: string;
  updated_at: string;
}

const STATUS_ICONS = {
  active: CheckCircle2,
  inactive: AlertCircle,
  pending: Clock,
};

const STATUS_COLORS = {
  active: "text-green-600 bg-green-50 border-green-200",
  inactive: "text-red-600 bg-red-50 border-red-200",
  pending: "text-amber-600 bg-amber-50 border-amber-200",
};

export default function SSOSettingsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<SSOConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    organization: "",
    provider_type: "saml" as "saml" | "oauth",
    domain: "",
    auto_provision_users: true,
    default_account_type: "base",
  });

  const fetchConnections = useCallback(async () => {
    try {
      const response = await fetch("/api/sso/connections");
      if (response.ok) {
        const data = await response.json();
        setConnections(Array.isArray(data) ? data : []);
      } else if (response.status === 403) {
        setError("Admin privileges required to manage SSO connections.");
      } else {
        setError("Failed to load SSO connections.");
      }
    } catch {
      setError("Failed to connect to server.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  const handleCreate = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/sso/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsDialogOpen(false);
        setFormData({
          name: "",
          organization: "",
          provider_type: "saml",
          domain: "",
          auto_provision_users: true,
          default_account_type: "base",
        });
        fetchConnections();
      } else {
        const data = await response.json();
        setError(data.detail || data.error || "Failed to create connection");
      }
    } catch {
      setError("Failed to create SSO connection");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (
    connectionId: string,
    newStatus: "active" | "inactive" | "pending"
  ) => {
    try {
      const response = await fetch(
        `/api/sso/connections/${connectionId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      if (response.ok) {
        fetchConnections();
      }
    } catch {
      setError("Failed to update connection status");
    }
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <Breadcrumb
        items={[
          { label: "Settings", href: "/settings" },
          { label: "SSO Connections" },
        ]}
      />

      <div className="flex items-center justify-between mb-8 mt-4">
        <Header
          icon={KeyRound}
          title="SSO Connections"
          size="4xl"
          description="Manage SAML 2.0 and OAuth 2.0 enterprise identity provider connections"
        />

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Connection
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>New SSO Connection</DialogTitle>
              <DialogDescription>
                Configure a new enterprise identity provider connection for
                SAML 2.0 or OAuth 2.0 authentication.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Connection Name</Label>
                <Input
                  id="name"
                  placeholder="Acme Corp Azure AD"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="organization">Organization</Label>
                <Input
                  id="organization"
                  placeholder="Acme Corporation"
                  value={formData.organization}
                  onChange={(e) =>
                    setFormData({ ...formData, organization: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="domain">Email Domain</Label>
                <Input
                  id="domain"
                  placeholder="acme.com"
                  value={formData.domain}
                  onChange={(e) =>
                    setFormData({ ...formData, domain: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Users with this email domain will see the SSO option on login
                </p>
              </div>

              <div className="space-y-2">
                <Label>Protocol</Label>
                <Select
                  value={formData.provider_type}
                  onValueChange={(value: "saml" | "oauth") =>
                    setFormData({ ...formData, provider_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saml">SAML 2.0</SelectItem>
                    <SelectItem value="oauth">OAuth 2.0 / OIDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Default Account Type</Label>
                <Select
                  value={formData.default_account_type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, default_account_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="base">Base</SelectItem>
                    <SelectItem value="researcher">Researcher</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="developer">Developer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={
                  isSubmitting ||
                  !formData.name ||
                  !formData.organization ||
                  !formData.domain
                }
              >
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Create Connection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {error && !isDialogOpen && (
        <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : connections.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <KeyRound className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">
              No SSO connections configured
            </h3>
            <p className="text-muted-foreground max-w-md mb-6">
              Set up enterprise SSO to allow users from your organization to
              sign in using their corporate identity provider (Azure AD, Okta,
              Google Workspace).
            </p>
            <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Your First Connection
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {connections.map((connection) => {
            const StatusIcon = STATUS_ICONS[connection.status];
            const statusColor = STATUS_COLORS[connection.status];

            return (
              <Card key={connection.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        {connection.provider_type === "saml" ? (
                          <Shield className="h-5 w-5 text-primary" />
                        ) : (
                          <Globe className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {connection.name}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Building2 className="h-3 w-3" />
                          {connection.organization}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${statusColor}`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {connection.status}
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">
                        Domain
                      </p>
                      <p className="font-medium">{connection.domain}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">
                        Protocol
                      </p>
                      <p className="font-medium uppercase">
                        {connection.provider_type}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">
                        Auto-Provision
                      </p>
                      <p className="font-medium">
                        {connection.auto_provision_users ? "Yes" : "No"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs mb-1">
                        Default Role
                      </p>
                      <p className="font-medium capitalize">
                        {connection.default_account_type}
                      </p>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Created{" "}
                      {new Date(connection.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex items-center gap-2">
                      {connection.status !== "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleStatusChange(connection.id, "active")
                          }
                        >
                          Activate
                        </Button>
                      )}
                      {connection.status === "active" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleStatusChange(connection.id, "inactive")
                          }
                        >
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
