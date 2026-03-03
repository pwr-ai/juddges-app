"use client";

/**
 * Command Palette Component
 *
 * Provides quick access to all application features via keyboard shortcut (Cmd/Ctrl+K)
 * Reduces cognitive load by making all features searchable without memorizing navigation
 *
 * Features:
 * - Fuzzy search across all routes and actions
 * - Keyboard navigation (arrow keys, enter, escape)
 * - Search-first navigation shortcuts
 * - Admin-only saved searches entry
 */

import { useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Search,
  FolderOpen,
  FileInput,
  Bookmark,
  FileSearch,
  FileJson,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
  keywords?: string[];
  category: "navigation" | "admin";
}

const navigationItems: CommandItem[] = [
  {
    id: "search",
    label: "Search Documents",
    description: "Find legal documents",
    icon: <Search className="h-4 w-4" />,
    href: "/search",
    keywords: ["search", "find", "documents", "query"],
    category: "navigation",
  },
  {
    id: "collections",
    label: "Collections",
    description: "Organize your research",
    icon: <FolderOpen className="h-4 w-4" />,
    href: "/collections",
    keywords: ["collections", "folders", "organize", "save"],
    category: "navigation",
  },
  {
    id: "extract",
    label: "Apply Schemas",
    description: "Extract data from documents",
    icon: <FileInput className="h-4 w-4" />,
    href: "/extract",
    keywords: ["apply", "extract", "schema", "data"],
    category: "navigation",
  },
  {
    id: "extractions",
    label: "Extractions",
    description: "View extraction runs and results",
    icon: <FileSearch className="h-4 w-4" />,
    href: "/extractions",
    keywords: ["extractions", "jobs", "results", "history"],
    category: "navigation",
  },
  {
    id: "base-schema",
    label: "Base Schema",
    description: "Open base extraction schema",
    icon: <FileJson className="h-4 w-4" />,
    href: "/schemas/base",
    keywords: ["base schema", "schema", "extraction", "json"],
    category: "navigation",
  },
];

const adminItems: CommandItem[] = [
  {
    id: "saved-searches",
    label: "Saved Searches",
    description: "Review and manage saved searches",
    icon: <Bookmark className="h-4 w-4" />,
    href: "/saved-searches",
    keywords: ["saved searches", "saved", "queries", "admin"],
    category: "admin",
  },
];

export function CommandPalette(): React.JSX.Element {
  const { isOpen, open, close, toggle } = useCommandPalette();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = user?.app_metadata?.is_admin === true;


  // Keyboard shortcut to open command palette
  // Works across all browsers and operating systems:
  // - Mac: Cmd+K (metaKey)
  // - Windows/Linux: Ctrl+K (ctrlKey)
  // - Safari: Handles both Cmd and Ctrl properly
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      // Check for 'k' key with either Cmd (Mac) or Ctrl (Windows/Linux)
      // Using lowercase 'k' to handle both cases
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [toggle]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      close();
      if (item.action) {
        item.action();
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [router, close]
  );

  return (
    <CommandDialog open={isOpen} onOpenChange={(isOpenValue) => isOpenValue ? open() : close()}>
      <CommandInput placeholder="Search for features, pages, or actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {navigationItems.map((item) => (
            <CommandItem
              key={item.id}
              value={`${item.label} ${item.description} ${item.keywords?.join(" ")}`}
              onSelect={() => handleSelect(item)}
            >
              {item.icon}
              <div className="ml-2 flex-1">
                <div className="font-medium">{item.label}</div>
                {item.description && (
                  <div className="text-xs text-muted-foreground">
                    {item.description}
                  </div>
                )}
              </div>
              {item.href === pathname && (
                <div className="ml-2 text-xs text-muted-foreground">
                  Current page
                </div>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        {isAdmin && (
          <>
            <CommandSeparator />

            <CommandGroup heading="Administration">
              {adminItems.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.description} ${item.keywords?.join(" ")}`}
                  onSelect={() => handleSelect(item)}
                >
                  {item.icon}
                  <div className="ml-2 flex-1">
                    <div className="font-medium">{item.label}</div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground">
                        {item.description}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
