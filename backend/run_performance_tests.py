#!/usr/bin/env python3
"""
Standalone runner for Weaviate performance benchmarks
"""

import sys
from pathlib import Path

# Add the ai_tax_search package to Python path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir / "packages" / "ai_tax_search"))

from juddges_search.performance.weaviate_benchmark import main

if __name__ == "__main__":
    main()
