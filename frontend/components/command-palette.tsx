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
 * - Recent searches
 * - Quick actions (New Chat, Search Documents, etc.)
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
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
  Home,
  MessageSquare,
  Search,
  FolderOpen,
  FileText,
  BookOpen,
  Settings,
  Database,
  Sparkles,
  BarChart,
  History,
  Users,
  PieChart,
  Beaker,
  FileInput,
  // FileCog,
  ListChecks,
  HelpCircle,
  GraduationCap,
  Mail,
  Shield,
  FileCheck,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  href?: string;
  action?: () => void;
  keywords?: string[];
  category: "navigation" | "actions" | "advanced" | "admin" | "help";
}

const navigationItems: CommandItem[] = [
  {
    id: "home",
    label: "Dashboard",
    description: "Overview and quick actions",
    icon: <Home className="h-4 w-4" />,
    href: "/",
    keywords: ["home", "dashboard", "overview"],
    category: "navigation",
  },
  {
    id: "chat",
    label: "AI Assistant",
    description: "Ask legal questions",
    icon: <MessageSquare className="h-4 w-4" />,
    href: "/chat",
    keywords: ["chat", "ai", "assistant", "ask", "question"],
    category: "navigation",
  },
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
    id: "use-cases",
    label: "Use Cases",
    description: "Examples and tutorials",
    icon: <BookOpen className="h-4 w-4" />,
    href: "/use-cases",
    keywords: ["use cases", "examples", "tutorials", "learn"],
    category: "navigation",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Account and preferences",
    icon: <Settings className="h-4 w-4" />,
    href: "/settings",
    keywords: ["settings", "preferences", "account", "profile"],
    category: "navigation",
  },
];

const advancedItems: CommandItem[] = [
  {
    id: "schemas",
    label: "Data Extraction",
    description: "Define extraction schemas",
    icon: <Database className="h-4 w-4" />,
    href: "/schemas",
    keywords: ["schemas", "extraction", "data", "structure"],
    category: "advanced",
  },
  {
    id: "schema-chat",
    label: "Schema Builder",
    description: "Build schemas with AI",
    icon: <Sparkles className="h-4 w-4" />,
    href: "/schema-chat",
    keywords: ["schema", "builder", "ai", "create"],
    category: "advanced",
  },
  {
    id: "extract",
    label: "Apply Schemas",
    description: "Extract data from documents",
    icon: <FileInput className="h-4 w-4" />,
    href: "/extract",
    keywords: ["apply", "extract", "schema", "data"],
    category: "advanced",
  },
  {
    id: "playground",
    label: "Test Extraction",
    description: "Test schemas on documents",
    icon: <Beaker className="h-4 w-4" />,
    href: "/playground",
    keywords: ["playground", "test", "experiment", "try"],
    category: "advanced",
  },
  {
    id: "document-vis",
    label: "Similar Documents",
    description: "Visualize document similarity",
    icon: <BarChart className="h-4 w-4" />,
    href: "/document-vis",
    keywords: ["visualization", "similar", "documents", "graph"],
    category: "advanced",
  },
];

const adminItems: CommandItem[] = [
  {
    id: "statistics",
    label: "Database Statistics",
    description: "View database metrics",
    icon: <PieChart className="h-4 w-4" />,
    href: "/statistics",
    keywords: ["statistics", "stats", "metrics", "database"],
    category: "admin",
  },
  {
    id: "search-queries",
    label: "Search History",
    description: "View past searches",
    icon: <History className="h-4 w-4" />,
    href: "/search-queries",
    keywords: ["history", "queries", "searches", "past"],
    category: "admin",
  },
  {
    id: "profiles",
    label: "User Profiles",
    description: "Manage user accounts",
    icon: <Users className="h-4 w-4" />,
    href: "/profiles",
    keywords: ["users", "profiles", "accounts", "manage"],
    category: "admin",
  },
];

const helpItems: CommandItem[] = [
  {
    id: "help",
    label: "Help Center",
    description: "Get help and support",
    icon: <HelpCircle className="h-4 w-4" />,
    href: "/help",
    keywords: ["help", "support", "documentation", "docs"],
    category: "help",
  },
  {
    id: "about",
    label: "About Us",
    description: "Learn about our research",
    icon: <GraduationCap className="h-4 w-4" />,
    href: "/about",
    keywords: ["about", "university", "research", "team"],
    category: "help",
  },
  {
    id: "contact",
    label: "Contact",
    description: "Get in touch with us",
    icon: <Mail className="h-4 w-4" />,
    href: "/contact",
    keywords: ["contact", "email", "support", "help"],
    category: "help",
  },
  {
    id: "privacy",
    label: "Privacy Policy",
    description: "Our privacy practices",
    icon: <Shield className="h-4 w-4" />,
    href: "/privacy",
    keywords: ["privacy", "policy", "data", "gdpr"],
    category: "help",
  },
  {
    id: "terms",
    label: "Terms of Service",
    description: "Terms and conditions",
    icon: <FileCheck className="h-4 w-4" />,
    href: "/terms",
    keywords: ["terms", "service", "conditions", "legal"],
    category: "help",
  },
];

export function CommandPalette() {
  const { isOpen, open, close, toggle } = useCommandPalette();
  const router = useRouter();
  const pathname = usePathname();

  // const allItems = [
  //   ...navigationItems,
  //   ...advancedItems,
  //   ...adminItems,
  //   ...helpItems,
  // ];

  // Keyboard shortcut to open command palette
  // Works across all browsers and operating systems:
  // - Mac: Cmd+K (metaKey)
  // - Windows/Linux: Ctrl+K (ctrlKey)
  // - Safari: Handles both Cmd and Ctrl properly
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
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

        <CommandSeparator />

        <CommandGroup heading="Advanced Tools">
          {advancedItems.map((item) => (
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

        <CommandSeparator />

        <CommandGroup heading="Help & Resources">
          {helpItems.map((item) => (
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
      </CommandList>
    </CommandDialog>
  );
}
