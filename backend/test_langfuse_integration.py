#!/usr/bin/env python3
"""
Test script to verify Langfuse integration with the chat chain.
Run this to test if Langfuse tracking is working properly.
"""

import os
import sys

# Add the packages directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "packages"))


def test_langfuse_setup():
    """Test Langfuse environment setup and callback configuration"""

    print("🧪 Testing Langfuse Integration")
    print("=" * 50)

    # Check environment variables
    langfuse_vars = {
        "LANGFUSE_PUBLIC_KEY": os.getenv("LANGFUSE_PUBLIC_KEY"),
        "LANGFUSE_SECRET_KEY": os.getenv("LANGFUSE_SECRET_KEY"),
        "LANGFUSE_HOST": os.getenv("LANGFUSE_HOST"),
    }

    print("📋 Environment Variables:")
    for key, value in langfuse_vars.items():
        if value:
            # Mask secrets for security
            display_value = (
                value
                if key == "LANGFUSE_HOST"
                else f"{value[:8]}..."
                if len(value) > 8
                else "***"
            )
            print(f"  ✅ {key}: {display_value}")
        else:
            print(f"  ❌ {key}: Not set")

    print("\n🔗 Testing Callback Handler Import:")
    try:
        from ai_tax_search.chains.callbacks import langfuse_handler

        print("  ✅ Callbacks imported successfully")

        if langfuse_handler:
            print("  ✅ Langfuse handler created successfully")
            print(f"  🏠 Langfuse host: {langfuse_vars['LANGFUSE_HOST']}")
        else:
            print("  ⚠️  Langfuse handler not initialized (credentials missing)")

    except ImportError as e:
        print(f"  ❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"  ❌ Error: {e}")
        return False

    print("\n🤖 Testing Chat Chain Import:")
    try:
        from ai_tax_search.chains.chat import chat_chain

        print("  ✅ Chat chain imported successfully")
        print(f"  🏷️  Chain name: {chat_chain.name}")

        # Check if chain has callbacks configured
        if hasattr(chat_chain, "config") and chat_chain.config.get("callbacks"):
            print("  ✅ Callbacks configured on chat chain")
        else:
            print("  ⚠️  No callbacks found on chat chain")

    except Exception as e:
        print(f"  ❌ Chat chain import error: {e}")
        return False

    print("\n" + "=" * 50)
    print("🎉 Langfuse integration test completed!")

    # Summary
    if all(langfuse_vars.values()) and langfuse_handler:
        print("✅ All checks passed - Langfuse tracking should work!")
        print(f"🌐 Access Langfuse UI at: {langfuse_vars['LANGFUSE_HOST']}")
    else:
        print("⚠️  Some configuration missing - check environment variables")

    return True


if __name__ == "__main__":
    test_langfuse_setup()
