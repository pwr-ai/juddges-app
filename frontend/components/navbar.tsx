"use client";

import React from "react";
import { SidebarTrigger } from "./ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PrimaryButton, SecondaryButton, UserAvatar, UserCard, PlanBadge, IconButton, Badge } from "@/lib/styles/components";
import { AIBadge } from "@/lib/styles/components/ai-badge";

import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSearchStore } from "@/lib/store/searchStore";
import { X, Trash2, Pencil, Printer, FileText, BookmarkPlus, ExternalLink, ArrowLeft, MessageSquare, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/lib/styles/components/tooltip";
import { SaveToCollectionPopover } from "@/lib/styles/components/save-to-collection-popover";
import { logger } from "@/lib/logger";

export function Navbar(): React.ReactElement {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const [isUserCardOpen, setIsUserCardOpen] = React.useState(false);
  const [documentMetadata, setDocumentMetadata] = React.useState<{ document_number?: string | null; document_id?: string } | null>(null);
  const [collectionName, setCollectionName] = React.useState<string | null>(null);
  const [collectionData, setCollectionData] = React.useState<{ id: string; name: string; description?: string } | null>(null);
  const [isEditingTitle, setIsEditingTitle] = React.useState(false);
  const [editingTitle, setEditingTitle] = React.useState("");
  const [isDeletingCollection, setIsDeletingCollection] = React.useState(false);
  const [htmlUrl, setHtmlUrl] = React.useState<string>('');
  const [fullMetadata, setFullMetadata] = React.useState<any>(null);
  const [isCollectionPopoverOpen, setIsCollectionPopoverOpen] = React.useState(false);

  // Check if we're on the dashboard page, chat page, search page, collections page, extractions page, or schemas page
  const isDashboard = pathname === "/";
  const isChat = pathname === "/chat" || pathname.startsWith("/chat/");
  const isSearch = pathname === "/search";
  const isCollections = pathname === "/collections" || pathname.startsWith("/collections/");
  const isCollectionDetail = pathname?.startsWith("/collections/") && pathname !== "/collections" && params?.id;
  const isDocumentPage = pathname?.startsWith("/documents/") && params?.id;
  const isSchemaChat = pathname === "/schema-chat" || pathname.startsWith("/schema-chat");
  const isSchemas = pathname === "/schemas" || pathname.startsWith("/schemas/");
  const isPrecedents = pathname === "/precedents";
  const isExtract = pathname === "/extract";
  const isExtractions = pathname === "/extractions";
  const isExtractionResults = pathname?.startsWith("/extractions/") && params?.id;

  // Get search type from store to show AI badge when thinking mode is active
  const searchType = useSearchStore((state) => state.searchType);

  // Fetch document metadata when on document page
  React.useEffect(() => {
    if (isDocumentPage && params?.id && user) {
      const fetchMetadata = async () => {
        try {
          const res = await fetch(`/api/documents/${params.id}/metadata`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            setDocumentMetadata(data);
            setFullMetadata(data);
          }
        } catch (error) {
          logger.error('Failed to fetch document metadata for navbar:', error);
        }
      };
      fetchMetadata();
      setHtmlUrl(`/api/documents/${params.id}/html`);
    } else {
      setDocumentMetadata(null);
      setFullMetadata(null);
      setHtmlUrl('');
    }
  }, [isDocumentPage, params?.id, user]);

  // Fetch collection data when on collection detail page
  React.useEffect(() => {
    if (isCollectionDetail && params?.id && user) {
      const collectionId = Array.isArray(params.id) ? params.id[0] : params.id;
      const fetchCollectionData = async () => {
        try {
          const res = await fetch(`/api/collections/${collectionId}`, { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            setCollectionData(data);
            setCollectionName(data.name);
          }
        } catch (error) {
          logger.error('Failed to fetch collection data for navbar:', error);
        }
      };
      fetchCollectionData();
    } else {
      setCollectionData(null);
      setCollectionName(null);
    }
  }, [isCollectionDetail, params?.id, user]);

  const handleTitleClick = (): void => {
    if (collectionData) {
      setEditingTitle(collectionData.name);
      setIsEditingTitle(true);
    }
  };

  const handleTitleSave = async (): Promise<void> => {
    if (!editingTitle.trim() || !collectionData || !params?.id) {
      setIsEditingTitle(false);
      return;
    }

    if (editingTitle === collectionData.name) {
      setIsEditingTitle(false);
      return;
    }

    const collectionId = Array.isArray(params.id) ? params.id[0] : params.id;
    try {
      const res = await fetch(`/api/collections/${collectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingTitle }),
      });
      if (res.ok) {
        setCollectionData(prev => prev ? { ...prev, name: editingTitle } : null);
        setCollectionName(editingTitle);
        setIsEditingTitle(false);
        toast.success("Collection name updated");
        // Refresh the page to update the collection data
        router.refresh();
      } else {
        throw new Error('Failed to update collection');
      }
    } catch (error) {
      logger.error('Failed to update collection name', error);
      toast.error("Failed to update collection name");
      setEditingTitle(collectionData.name);
    }
  };

  const handleTitleCancel = (): void => {
    setEditingTitle("");
    setIsEditingTitle(false);
  };

  const handleDeleteCollection = async (): Promise<void> => {
    if (!collectionData || !params?.id || isDeletingCollection) {
      return;
    }

    if (!confirm(`Are you sure you want to delete "${collectionData.name}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeletingCollection(true);
    const collectionId = Array.isArray(params.id) ? params.id[0] : params.id;
    try {
      const res = await fetch(`/api/collections/${collectionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success("Collection deleted");
        router.push('/collections');
      } else {
        throw new Error('Failed to delete collection');
      }
    } catch (error) {
      logger.error('Failed to delete collection', error);
      toast.error("Failed to delete collection");
    } finally {
      setIsDeletingCollection(false);
    }
  };

  // Document action handlers
  const handlePrint = async (): Promise<void> => {
    if (!htmlUrl) return;

    try {
      const res = await fetch(htmlUrl, { cache: 'no-store' });
      const htmlString = await res.text();

      const printWindow = window.open('', '_blank');
      if (printWindow && htmlString) {
        printWindow.document.write(htmlString);
        printWindow.document.close();
        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
        };
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 500);
      }
    } catch (error) {
      logger.error('Failed to print document:', error);
      toast.error("Failed to print document");
    }
  };

  const handleOpenInNewTab = (): void => {
    if (htmlUrl) {
      window.open(htmlUrl, '_blank');
    }
  };

  return (
    <header className={cn(
      "flex items-center justify-between px-4 md:px-8 h-16 min-h-[4rem]",
      // Modern gradient background with blur
      "bg-gradient-to-r from-background via-background/95 to-background",
      "backdrop-blur-md",
      // Enhanced border with gradient
      "border-b border-border/50",
      // Subtle shadow for depth
      "shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
      "sticky top-0 z-30",
      "transition-all duration-300",
      isCollectionDetail && collectionData && user ? "relative" : ""
    )}>
      <div className="flex items-center gap-3 md:gap-5">
        {user && (
          <SidebarTrigger className={cn(
            "h-9 w-9 rounded-lg",
            // Background without hover color change
            "bg-muted/50",
            // Border and shadow
            "border border-border/30",
            "shadow-sm hover:shadow-md",
            // Smooth transitions and subtle scale
            "transition-all duration-200",
            "hover:scale-[1.02] active:scale-[0.98]"
          )} />
        )}
        {isDocumentPage && user && (() => {
          const from = searchParams.get('from');
          const chatId = searchParams.get('chatId');
          const collectionId = searchParams.get('collectionId');

          const getBackUrl = (): string | null => {
            if (from === 'chat' && chatId) {
              return `/chat/${chatId}`;
            } else if (from === 'collection' && collectionId) {
              return `/collections/${collectionId}`;
            } else if (from === 'search') {
              return '/search';
            } else if (from === 'collections') {
              return '/collections';
            }
            return null;
          };

          const backUrl = getBackUrl();
          const shouldShowBackButton = backUrl ? backUrl !== pathname : true;

          const getBackButtonInfo = (): { label: string; icon: React.ComponentType<{ className?: string }> } => {
            if (from === 'chat' && chatId) {
              return { label: 'Back to Chat', icon: MessageSquare };
            } else if (from === 'collection' && collectionId) {
              return { label: 'Back to Collection', icon: FolderOpen };
            } else if (from === 'search') {
              return { label: 'Back to Search', icon: FileText };
            } else if (from === 'collections') {
              return { label: 'Back to Collections', icon: FolderOpen };
            } else {
              return { label: 'Back', icon: ArrowLeft };
            }
          };

          const backButtonInfo = getBackButtonInfo();
          const BackIcon = backButtonInfo.icon;

          const handleBack = (): void => {
            if (backUrl) {
              router.push(backUrl);
            } else {
              const hasHistory = typeof window !== 'undefined' &&
                (window.history.length > 1 ||
                  (document.referrer &&
                    document.referrer.startsWith(window.location.origin)));

              if (hasHistory) {
                router.back();
              } else {
                router.push("/");
              }
            }
          };

          if (!shouldShowBackButton) return null;

          return (
            <IconButton
              icon={BackIcon}
              onClick={handleBack}
              aria-label={backButtonInfo.label}
              variant="muted"
              size="md"
              className="shrink-0"
            />
          );
        })()}
        {isDashboard && user && (
          <h1 className="text-xl font-bold text-foreground">
            Dashboard
          </h1>
        )}
        {isChat && user && (
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              Assistant
            </h1>
            <AIBadge text="AI" size="sm" className="scale-150" />
          </div>
        )}
        {isSearch && user && (
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              Search
            </h1>
            {searchType === 'thinking' && (
              <AIBadge text="AI-powered" size="sm" />
            )}
          </div>
        )}
        {isCollections && user && !isCollectionDetail && (
          <h1 className="text-xl font-bold text-foreground">
            Collections
          </h1>
        )}
        {isCollectionDetail && user && (
          <h1 className="text-xl font-bold text-foreground">
            Collection Viewer
          </h1>
        )}
        {isSchemas && user && (
          <h1 className="text-xl font-bold text-foreground">
            Schemas
          </h1>
        )}
        {isPrecedents && user && (
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              Precedent Finder
            </h1>
            <AIBadge text="AI" size="sm" />
          </div>
        )}
      </div>

      {isCollectionDetail && collectionData && user && (
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-2">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleTitleSave();
                  } else if (e.key === 'Escape') {
                    handleTitleCancel();
                  }
                }}
                onBlur={handleTitleSave}
                autoFocus
                style={{
                  width: `${Math.max(300, Math.min(editingTitle.length * 12 + 40, 600))}px`,
                  minWidth: '300px',
                  maxWidth: '600px'
                }}
                className="text-xl font-bold text-center border-primary/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
              <IconButton
                icon={X}
                onClick={handleTitleCancel}
                variant="muted"
                size="sm"
                aria-label="Cancel editing"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2 max-w-md min-w-0">
              <span className="text-sm text-muted-foreground shrink-0">
                Collection Name:
              </span>
              <h1
                className={cn(
                  "text-xl font-bold text-foreground",
                  "select-none",
                  "truncate",
                  "max-w-md",
                  "text-center"
                )}
                title={collectionName || collectionData.name}
              >
                {collectionName || collectionData.name}
              </h1>
              <div className="flex items-center shrink-0">
                <IconButton
                  icon={Pencil}
                  onClick={handleTitleClick}
                  variant="muted"
                  size="sm"
                  aria-label="Edit collection name"
                  className="shrink-0"
                />
                <IconButton
                  icon={Trash2}
                  onClick={handleDeleteCollection}
                  variant="muted"
                  size="sm"
                  aria-label="Delete collection"
                  disabled={isDeletingCollection}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 md:gap-3">
        {isSchemaChat && user && (
          <h1 className="text-xl font-bold text-foreground">
            Schema Studio
          </h1>
        )}
        {isExtract && user && (
          <h1 className="text-xl font-bold text-foreground">
            Configure extraction
          </h1>
        )}
        {isExtractions && user && (
          <h1 className="text-xl font-bold text-foreground">
            Extractions
          </h1>
        )}
        {isExtractionResults && user && (
          <h1 className="text-xl font-bold text-foreground">
            Extractions Results
          </h1>
        )}
        {isDocumentPage && user && (
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">
              Document Viewer
            </h1>
            {documentMetadata && (
              <div className="flex items-center gap-2 pl-3 border-l border-border/50">
                <span className="text-sm text-muted-foreground">Docket:</span>
                <span className="text-lg font-semibold text-foreground">
                  {documentMetadata.document_number || documentMetadata.document_id}
                </span>
              </div>
            )}
            {fullMetadata && (
              <div className="flex items-center gap-2 pl-3 border-l border-border/50">
                {fullMetadata.document_type && (
                  <Badge variant="secondary" className="text-xs whitespace-normal break-words">
                    {fullMetadata.document_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </Badge>
                )}
                {fullMetadata.language && (
                  <Badge variant="outline" className="text-xs whitespace-normal break-words">
                    {fullMetadata.language.toUpperCase()}
                  </Badge>
                )}
              </div>
            )}
            {fullMetadata && (
              <TooltipProvider>
                <div className="flex items-center gap-2 pl-3 border-l border-border/50">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        icon={Printer}
                        onClick={handlePrint}
                        aria-label="Print Document"
                        variant="muted"
                        size="md"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Print Document</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <IconButton
                        icon={ExternalLink}
                        onClick={handleOpenInNewTab}
                        aria-label="Open in New Tab"
                        variant="muted"
                        size="md"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Open in New Tab</TooltipContent>
                  </Tooltip>

                  <Popover open={isCollectionPopoverOpen} onOpenChange={setIsCollectionPopoverOpen}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <IconButton
                            icon={BookmarkPlus}
                            aria-label="Add to Collection"
                            variant="muted"
                            size="md"
                          />
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Add to Collection</TooltipContent>
                    </Tooltip>
                    <PopoverContent
                      align="end"
                      side="bottom"
                      sideOffset={8}
                      className="w-auto p-0 border-0 shadow-none bg-transparent z-[100]"
                      onInteractOutside={(e) => {
                        const target = e.target as HTMLElement;
                        if (
                          target.closest('[data-slot="save-to-collection-popover"]') ||
                          target.closest('[data-radix-select-viewport]') ||
                          target.closest('[role="listbox"]') ||
                          target.closest('[data-radix-popper-content-wrapper]')
                        ) {
                          e.preventDefault();
                        }
                      }}
                    >
                      <div data-slot="save-to-collection-popover">
                        <SaveToCollectionPopover
                          documents={fullMetadata ? [{
                            document_id: fullMetadata.document_id,
                            document_type: fullMetadata.document_type,
                            title: fullMetadata.title || null,
                            date_issued: fullMetadata.date_issued || null,
                            issuing_body: fullMetadata.issuing_body ? (typeof fullMetadata.issuing_body === 'object' ? fullMetadata.issuing_body as { name: string; jurisdiction?: string; type: string } : { name: String(fullMetadata.issuing_body), type: 'unknown' }) : null,
                            language: fullMetadata.language || null,
                            document_number: fullMetadata.document_number || null,
                            country: fullMetadata.country || null,
                            full_text: null,
                            summary: fullMetadata.summary || null,
                            thesis: fullMetadata.thesis || null,
                            legal_references: null,
                            legal_concepts: null,
                            keywords: fullMetadata.keywords || null,
                            score: null,
                            court_name: fullMetadata.court_name || null,
                            department_name: fullMetadata.department_name || null,
                            presiding_judge: fullMetadata.presiding_judge || null,
                            judges: fullMetadata.judges || null,
                            parties: fullMetadata.parties || null,
                            outcome: fullMetadata.outcome || null,
                            legal_bases: fullMetadata.legal_bases || null,
                            extracted_legal_bases: fullMetadata.extracted_legal_bases || null,
                            references: fullMetadata.references || null,
                            factual_state: null,
                            legal_state: null,
                          }] : []}
                          onClose={() => setIsCollectionPopoverOpen(false)}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>


      <div className="flex items-center gap-2 md:gap-3">
        {user ? (
          // Authenticated user controls
          <>
            <PlanBadge />
            <Popover open={isUserCardOpen} onOpenChange={setIsUserCardOpen}>
              <PopoverTrigger asChild>
                <button
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
                  aria-label="User menu"
                >
                  <UserAvatar clickable={true} />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="bottom"
                sideOffset={8}
                className="w-auto p-0 border-0 shadow-none bg-transparent"
              >
                <UserCard onClose={() => setIsUserCardOpen(false)} />
              </PopoverContent>
            </Popover>
          </>
        ) : (
          // Unauthenticated user controls
          <>
            <nav className="hidden sm:flex items-center gap-6 mr-2">
              <Link
                href="/about"
                className={cn(
                  "text-sm font-medium relative group",
                  "text-muted-foreground hover:text-foreground",
                  "transition-colors duration-200",
                  // Underline effect
                  "after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0",
                  "after:bg-gradient-to-r after:from-primary after:to-primary/50",
                  "after:transition-all after:duration-300",
                  "hover:after:w-full"
                )}
              >
                About
              </Link>
            </nav>

            <SecondaryButton
              size="sm"
              onClick={() => router.push("/auth/login")}
              className="h-9 px-4"
            >
              Login
            </SecondaryButton>

            <PrimaryButton
              size="sm"
              onClick={() => router.push("/auth/sign-up")}
              className="h-9 px-4"
            >
              Sign Up
            </PrimaryButton>
          </>
        )}
      </div>
    </header>
  );
}
