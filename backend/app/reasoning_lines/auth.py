"""Authorization policy for the global reasoning-lines data set.

The reasoning-lines schema has no owner/user column. Its database policy grants
authenticated users read access while reserving writes for the service role.
The HTTP API mirrors that model: authenticated users may read and run the two
read-only POST computations, while every global mutation requires an admin.
"""

from fastapi import Depends, HTTPException, Request, status

from app.core.auth_jwt import AuthenticatedUser, get_current_user

_READ_ONLY_POST_PATHS = frozenset(
    {
        "/reasoning-lines/discover",
        "/reasoning-lines/search",
    }
)


async def authorize_reasoning_lines_request(
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user),
) -> AuthenticatedUser:
    """Require authentication for reads and admin privileges for mutations."""
    path = request.url.path.rstrip("/") or "/"
    is_read = request.method in {"GET", "HEAD"}
    is_read_only_post = request.method == "POST" and path in _READ_ONLY_POST_PATHS

    if is_read or is_read_only_post:
        return user

    if not user.is_admin():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )

    return user
