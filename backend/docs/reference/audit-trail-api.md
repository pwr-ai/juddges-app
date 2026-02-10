# Audit Trail and Legal Compliance API Reference

## Overview

The Audit Trail and Legal Compliance system provides comprehensive logging and data management features for legal compliance, including:

- **7-year audit trail** for all user interactions with the AI system
- **User consent management** (GDPR, professional acknowledgment)
- **Data retention policies** with configurable periods
- **GDPR compliance** (right to data portability, right to erasure)
- **Data Processing Agreement (DPA)** information

## Database Schema

### Core Tables

#### `audit_logs`
Comprehensive audit trail with 7-year retention period.

```sql
- id: UUID (primary key)
- user_id: TEXT (indexed)
- session_id: TEXT
- action_type: TEXT (query, document_view, export, etc.)
- input_data: JSONB (sanitized)
- output_data: JSONB (sanitized)
- model_used: TEXT
- ip_address: TEXT (anonymized)
- resource_type: TEXT
- resource_id: TEXT
- created_at: TIMESTAMPTZ
- retention_until: TIMESTAMPTZ (NOW() + 7 years)
```

#### `user_consent`
User consent tracking with version history.

```sql
- id: UUID (primary key)
- user_id: TEXT (unique, indexed)
- professional_acknowledgment_accepted: BOOLEAN
- professional_acknowledgment_date: TIMESTAMPTZ
- terms_accepted: BOOLEAN
- privacy_policy_accepted: BOOLEAN
- data_processing_consent: BOOLEAN
- marketing_consent: BOOLEAN
- consent_history: JSONB (array)
```

#### `data_retention_policies`
Configuration for data retention periods.

```sql
- policy_name: TEXT (unique)
- data_type: TEXT
- retention_period_days: INTEGER
- legal_basis: TEXT
- archive_before_delete: BOOLEAN
```

#### `data_deletion_requests`
GDPR right to erasure requests.

```sql
- id: UUID (primary key)
- user_id: TEXT
- request_type: TEXT (full_deletion, partial_deletion, anonymization)
- data_types: TEXT[]
- status: TEXT (pending, in_progress, completed, failed)
- deletion_summary: JSONB
```

## API Endpoints

### Audit Trail API (`/api/audit`)

#### GET `/api/audit/my-activity`
Retrieve your own audit trail.

**Authentication:** Required (JWT)

**Query Parameters:**
- `start_date` (optional): ISO 8601 date (default: 90 days ago)
- `end_date` (optional): ISO 8601 date (default: now)
- `action_types` (optional): List of action types to filter
- `limit` (default: 100, max: 1000): Page size
- `offset` (default: 0): Pagination offset

**Response:**
```json
{
  "user_id": "user-uuid",
  "audit_logs": [
    {
      "id": "log-uuid",
      "action_type": "query",
      "created_at": "2025-10-12T10:30:00Z",
      "resource_type": "query",
      "resource_id": null,
      "session_id": "session-uuid",
      "model_used": "gpt-4",
      "request_duration_ms": 1250
    }
  ],
  "total_count": 150,
  "limit": 100,
  "offset": 0,
  "start_date": "2025-07-13T00:00:00Z",
  "end_date": "2025-10-12T23:59:59Z"
}
```

**Example:**
```bash
curl -X GET "https://api.ai-tax.com/api/audit/my-activity?limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### GET `/api/audit/my-activity/statistics`
Get statistics about your activity.

**Authentication:** Required (JWT)

**Query Parameters:**
- `days` (default: 90, max: 365): Number of days to analyze

**Response:**
```json
{
  "user_id": "user-uuid",
  "total_actions": 250,
  "total_sessions": 15,
  "date_range": {
    "start": "2025-07-13T00:00:00Z",
    "end": "2025-10-12T23:59:59Z",
    "days": 90
  },
  "action_breakdown": {
    "query": 120,
    "document_view": 80,
    "export": 10,
    "collection_create": 5
  },
  "most_recent_activity": "2025-10-12T14:30:00Z"
}
```

#### GET `/api/audit/my-activity/export`
Export your audit trail as JSON or CSV.

**Authentication:** Required (JWT)

**Query Parameters:**
- `format` (default: "json"): Export format ("json" or "csv")
- `start_date` (optional): ISO 8601 date
- `end_date` (optional): ISO 8601 date

**Response:** File download

**Example:**
```bash
# Export as JSON
curl -X GET "https://api.ai-tax.com/api/audit/my-activity/export?format=json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o audit_trail.json

# Export as CSV
curl -X GET "https://api.ai-tax.com/api/audit/my-activity/export?format=csv" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o audit_trail.csv
```

### Consent Management API (`/api/consent`)

#### POST `/api/consent/update`
Update user consent.

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "consent_type": "professional_acknowledgment",
  "accepted": true,
  "version": "v1.0"
}
```

**Consent Types:**
- `professional_acknowledgment`: AI-Tax is not a replacement for professional advice
- `terms`: Terms of Service
- `privacy_policy`: Privacy Policy
- `data_processing`: Data processing consent (GDPR)
- `marketing`: Marketing communications consent

**Response:**
```json
{
  "status": "success",
  "message": "Consent accepted successfully",
  "consent_status": {
    "user_id": "user-uuid",
    "professional_acknowledgment_accepted": true,
    "professional_acknowledgment_date": "2025-10-12T10:00:00Z",
    "professional_acknowledgment_version": "v1.0",
    "terms_accepted": true,
    "privacy_policy_accepted": true,
    "data_processing_consent": true,
    "marketing_consent": false,
    "is_compliant": true,
    "last_updated": "2025-10-12T10:00:00Z"
  }
}
```

#### GET `/api/consent/status`
Get current consent status.

**Authentication:** Required (JWT)

**Response:** Same as `consent_status` object above.

#### GET `/api/consent/history`
Get consent change history.

**Authentication:** Required (JWT)

**Response:**
```json
{
  "user_id": "user-uuid",
  "consent_history": [
    {
      "consent_type": "professional_acknowledgment",
      "accepted": true,
      "version": "v1.0",
      "timestamp": "2025-10-12T10:00:00Z"
    }
  ]
}
```

#### POST `/api/consent/professional-acknowledgment`
Convenience endpoint to accept professional acknowledgment.

**Authentication:** Required (JWT)

**Query Parameters:**
- `version` (default: "v1.0"): Version to accept

**Response:** Same as `/api/consent/update`

### Legal & Compliance API (`/api/legal`)

#### GET `/api/legal/dpa`
Get Data Processing Agreement (DPA) information.

**Authentication:** Optional

**Response:**
```json
{
  "version": "1.0",
  "effective_date": "2025-01-01",
  "data_processor": {
    "name": "AI-Tax",
    "contact": "legal@legal-ai.augustyniak.ai",
    "dpo_email": "dpo@legal-ai.augustyniak.ai"
  },
  "processing_purposes": [
    "Legal research and document analysis",
    "AI-powered search and recommendations"
  ],
  "data_categories": [
    "User account information",
    "Search queries and analysis requests"
  ],
  "retention_periods": [
    {
      "data_type": "audit_logs",
      "retention_period_days": 2555,
      "retention_period_description": "7 years",
      "legal_basis": "Tax law and GDPR Art. 6(1)(c)",
      "archive_before_delete": true
    }
  ],
  "sub_processors": [
    {
      "name": "OpenAI",
      "purpose": "AI language model processing",
      "location": "United States",
      "safeguards": "Standard Contractual Clauses (SCCs)"
    }
  ],
  "security_measures": [
    "End-to-end encryption for data in transit (TLS 1.3)",
    "Encryption at rest for sensitive data"
  ]
}
```

#### POST `/api/legal/data-export`
Export all your personal data (GDPR right to data portability).

**Authentication:** Required (JWT)

**Query Parameters:**
- `format` (default: "json"): Export format

**Response:**
```json
{
  "status": "success",
  "message": "Data exported successfully",
  "export_data": {
    "user_id": "user-uuid",
    "export_date": "2025-10-12T10:00:00Z",
    "consent": [...],
    "audit_logs": [...],
    "events": [...],
    "search_queries": [...],
    "feedback": [...]
  }
}
```

#### POST `/api/legal/data-deletion`
Request deletion of your personal data (GDPR right to erasure).

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "request_type": "full_deletion",
  "data_types": ["audit_logs", "analytics", "feedback"],
  "reason": "I no longer use the service"
}
```

**Request Types:**
- `full_deletion`: Complete account and data deletion
- `partial_deletion`: Delete specific data types only
- `anonymization`: Anonymize data instead of deleting

**Response:**
```json
{
  "status": "success",
  "request_id": "request-uuid",
  "message": "Data deletion request created. It will be processed within 30 days as required by GDPR.",
  "processing_time": "30 days"
}
```

#### GET `/api/legal/retention-policies`
Get information about data retention policies.

**Authentication:** Optional

**Response:**
```json
[
  {
    "data_type": "audit_logs",
    "retention_period_days": 2555,
    "retention_period_description": "7 years (legal requirement)",
    "legal_basis": "Tax law and GDPR Art. 6(1)(c)",
    "archive_before_delete": true
  }
]
```

## Service Layer

### AuditService

Provides audit logging functionality.

```python
from app.services import AuditService

# Log a query
await AuditService.log_query(
    user_id="user-uuid",
    query="tax question",
    response={"answer": "..."},
    session_id="session-uuid",
    model_used="gpt-4"
)

# Log document access
await AuditService.log_document_access(
    user_id="user-uuid",
    document_id="doc-123",
    action="view",
    session_id="session-uuid"
)

# Log export
await AuditService.log_export(
    user_id="user-uuid",
    export_type="audit_trail",
    data_range={"start_date": "...", "end_date": "..."}
)

# Get user audit trail
result = await AuditService.get_user_audit_trail(
    user_id="user-uuid",
    start_date=datetime(2025, 1, 1),
    end_date=datetime(2025, 12, 31)
)
```

**Background Logging (Non-blocking):**
```python
from fastapi import BackgroundTasks
from app.services import log_audit_background

@router.post("/some-endpoint")
async def endpoint(background_tasks: BackgroundTasks):
    # Your endpoint logic...

    # Add audit logging as background task
    log_audit_background(
        background_tasks,
        user_id="user-uuid",
        action_type="query",
        input_data={"query": "..."},
        output_data={"result": "..."}
    )
```

### RetentionService

Manages data retention and cleanup.

```python
from app.services import RetentionService

# Archive expired audit logs
result = await RetentionService.archive_expired_audit_logs()

# Cleanup expired sessions
result = await RetentionService.cleanup_expired_sessions()

# Export user data
result = await RetentionService.export_user_data(
    user_id="user-uuid",
    format="json"
)

# Request data deletion
result = await RetentionService.request_data_deletion(
    user_id="user-uuid",
    request_type="full_deletion"
)
```

## Data Retention Periods

| Data Type | Retention Period | Legal Basis |
|-----------|-----------------|-------------|
| Audit logs | 7 years (2555 days) | Tax law, GDPR Art. 6(1)(c) |
| User data | 3 years after last activity | GDPR Art. 6(1)(b) |
| Chat history | 1 year (configurable) | User consent |
| Analytics data | 2 years | GDPR Art. 6(1)(f) |
| Feedback data | 3 years | GDPR Art. 6(1)(f) |
| Temporary analysis | 90 days | User consent |
| Session data | 30 days | Technical necessity |

## Security Features

### Data Sanitization
- Sensitive fields (passwords, tokens, API keys) are automatically redacted
- Long strings are truncated to prevent abuse
- Input/output data is sanitized before storage

### IP Anonymization
- IP addresses are hashed using SHA-256
- Only first 16 characters of hash are stored
- Maintains uniqueness while protecting privacy

### Access Control
- Row Level Security (RLS) enforced on all tables
- Users can only access their own audit logs
- Service role required for administrative operations

### Compliance
- GDPR Article 17 (Right to erasure)
- GDPR Article 20 (Right to data portability)
- GDPR Article 28 (Data processing agreement)
- 7-year retention for legal compliance

## Migration Instructions

1. **Run Database Migration:**
   ```bash
   # Execute the SQL migration in Supabase SQL editor
   psql -d aiTax -f backend/migrations/002_audit_trail_and_compliance.sql
   ```

2. **Verify Tables:**
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname = 'public'
   AND tablename IN ('audit_logs', 'user_consent', 'data_retention_policies', 'data_deletion_requests');
   ```

3. **Test Audit Logging:**
   ```python
   from app.services import AuditService

   # Test creating an audit log
   audit_id = await AuditService.log_action(
       user_id="test-user",
       action_type="query",
       input_data={"test": "data"}
   )
   ```

4. **Configure Scheduled Jobs:**
   Set up cron jobs or scheduled tasks for:
   - Daily: `RetentionService.cleanup_expired_sessions()`
   - Monthly: `RetentionService.archive_expired_audit_logs()`

## Best Practices

1. **Always use background tasks** for audit logging to avoid blocking requests
2. **Sanitize sensitive data** before logging
3. **Use appropriate action types** from the predefined list
4. **Include session_id** when available for better tracking
5. **Log both successful and failed operations**
6. **Regularly review and archive** old audit logs
7. **Test GDPR compliance** features regularly

## Troubleshooting

### Common Issues

**Issue:** Audit logs not appearing
- Check user_id is correct
- Verify Supabase connection
- Check RLS policies

**Issue:** Permission denied errors
- Verify JWT token is valid
- Check RLS policies match user_id
- Ensure service role key is set

**Issue:** Data export failing
- Check Supabase quota limits
- Verify large datasets can be exported
- Use pagination for large exports

## Additional Resources

- [GDPR Compliance Guide](https://gdpr.eu/)
- [Data Processing Agreement Template](https://gdpr.eu/data-processing-agreement/)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
