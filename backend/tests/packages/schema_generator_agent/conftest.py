"""
Pytest configuration for schema_generator_agent tests.
"""

import sys
from pathlib import Path

# Add the schema_generator_agent package to Python path
# This allows "from schema_generator_agent.agents import..." to work
schema_gen_pkg_dir = Path(__file__).parent.parent.parent.parent / "packages" / "schema_generator_agent"
sys.path.insert(0, str(schema_gen_pkg_dir))

# Add juddges_search package for dependencies
juddges_search_pkg_dir = Path(__file__).parent.parent.parent.parent / "packages" / "juddges_search"
sys.path.insert(0, str(juddges_search_pkg_dir))

# Add backend directory for app imports
backend_dir = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(backend_dir))
