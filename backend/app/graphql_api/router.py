"""
FastAPI router for the GraphQL endpoint.

Mounts Strawberry's GraphQL view at /graphql with:
- HTTP POST for queries and mutations
- WebSocket for subscriptions
- GraphiQL playground in development mode
"""

import os

from strawberry.fastapi import GraphQLRouter

from app.graphql_api.schema import schema

# Enable GraphiQL playground in non-production environments
_is_production = os.getenv("PYTHON_ENV", "development") == "production"

graphql_router = GraphQLRouter(
    schema,
    graphql_ide="graphiql" if not _is_production else None,
)
