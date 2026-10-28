# prod-v1.5.25

> Release Notes for Version prod-v1.5.25

_Generated on 2026-10-28 from `prod-v1.5.24..HEAD` (2 commits)._

## Summary
This release includes important updates to enhance deployment stability and security.

## Highlights
- Improved deployment process with enhanced post-deploy probes.
- Updated backend packages to address vulnerabilities.

## Deployment Improvements
- Post-deploy probes are now executed inside the containers to ensure better stability after deployment.

## Security Updates
- Vulnerable backend packages have been updated within existing version ranges to enhance security.

## Source Commits
- `e353daf7` fix(deploy): run post-deploy probes inside the containers
- `40974e84` fix(deps): bump vulnerable backend packages within existing ranges
