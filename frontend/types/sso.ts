/**
 * SSO (Single Sign-On) type definitions
 * Used for SAML 2.0 and OAuth 2.0 enterprise identity provider integration
 */

export type SSOProviderType = "saml" | "oauth";
export type SSOConnectionStatus = "active" | "inactive" | "pending";

export interface SSOConnection {
  id: string;
  name: string;
  slug: string;
  organization: string;
  provider_type: SSOProviderType;
  status: SSOConnectionStatus;
  domain: string;
  auto_provision_users: boolean;
  default_account_type: string;
  supabase_provider_id?: string;

  // SAML fields
  saml_entity_id?: string;
  saml_sso_url?: string;
  saml_metadata_url?: string;

  // OAuth fields
  oauth_client_id?: string;
  oauth_authorization_url?: string;
  oauth_token_url?: string;
  oauth_userinfo_url?: string;
  oauth_scopes?: string;

  created_at: string;
  updated_at: string;
}

export interface SSODomainCheckResponse {
  sso_enabled: boolean;
  provider_type?: SSOProviderType;
  connection_id?: string;
  connection_name?: string;
  organization?: string;
}

export interface SSOLoginEvent {
  id: string;
  connection_id: string;
  connection_name?: string;
  user_id?: string;
  email: string;
  event_type: string;
  ip_address?: string;
  error_message?: string;
  created_at: string;
}

export interface CreateSSOConnectionRequest {
  name: string;
  organization: string;
  provider_type: SSOProviderType;
  domain: string;
  auto_provision_users?: boolean;
  default_account_type?: string;

  // SAML-specific
  saml_entity_id?: string;
  saml_sso_url?: string;
  saml_certificate?: string;
  saml_metadata_url?: string;

  // OAuth-specific
  oauth_client_id?: string;
  oauth_client_secret?: string;
  oauth_authorization_url?: string;
  oauth_token_url?: string;
  oauth_userinfo_url?: string;
  oauth_scopes?: string;
}
