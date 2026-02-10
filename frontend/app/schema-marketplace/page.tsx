"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Search,
  Download,
  Star,
  Package,
  Tag,
  Store,
  Loader2,
  StarIcon,
} from "lucide-react";
import {
  Header,
  BaseCard,
  PrimaryButton,
  SecondaryButton,
  LoadingIndicator,
  EmptyState,
  PageContainer,
  SectionHeader,
  Badge,
} from "@/lib/styles/components";
import { cn } from "@/lib/utils";
import type {
  MarketplaceListingItem,
  MarketplaceSortBy,
} from "@/types/marketplace";
import {
  browseMarketplaceListings,
  downloadMarketplaceSchema,
  getMarketplaceStats,
  submitMarketplaceReview,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ===== Category definitions =====
const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "general", label: "General" },
  { value: "tax", label: "Tax Law" },
  { value: "contracts", label: "Contracts" },
  { value: "litigation", label: "Litigation" },
  { value: "compliance", label: "Compliance" },
  { value: "corporate", label: "Corporate" },
  { value: "ip", label: "Intellectual Property" },
  { value: "labor", label: "Labor Law" },
];

const SORT_OPTIONS: { value: MarketplaceSortBy; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Most Popular" },
  { value: "top_rated", label: "Top Rated" },
  { value: "most_downloaded", label: "Most Downloaded" },
];

// ===== Star Rating Component =====
function StarRating({
  rating,
  onRate,
  size = "sm",
}: {
  rating: number;
  onRate?: (rating: number) => void;
  size?: "sm" | "md";
}) {
  const [hoverRating, setHoverRating] = useState(0);
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onRate}
          onClick={() => onRate?.(star)}
          onMouseEnter={() => onRate && setHoverRating(star)}
          onMouseLeave={() => onRate && setHoverRating(0)}
          className={cn(
            "transition-colors",
            onRate ? "cursor-pointer hover:scale-110" : "cursor-default"
          )}
        >
          <StarIcon
            className={cn(
              iconSize,
              (hoverRating || rating) >= star
                ? "fill-yellow-400 text-yellow-400"
                : "fill-none text-muted-foreground/40"
            )}
          />
        </button>
      ))}
    </div>
  );
}

// ===== Listing Card Component =====
function ListingCard({
  listing,
  onDownload,
  onReview,
}: {
  listing: MarketplaceListingItem;
  onDownload: (listing: MarketplaceListingItem) => void;
  onReview: (listing: MarketplaceListingItem) => void;
}) {
  return (
    <BaseCard className="flex flex-col h-full p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base text-foreground truncate">
            {listing.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            v{listing.version} &middot; {listing.license}
          </p>
        </div>
        {listing.is_featured && (
          <Badge variant="default" className="shrink-0 text-xs bg-amber-500 text-white">
            Featured
          </Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
        {listing.description}
      </p>

      {/* Tags */}
      {listing.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {listing.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
            >
              {tag}
            </span>
          ))}
          {listing.tags.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{listing.tags.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
        <div className="flex items-center gap-1">
          <StarRating rating={Math.round(listing.avg_rating)} />
          <span className="ml-1">
            {listing.avg_rating.toFixed(1)} ({listing.rating_count})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Download className="h-3 w-3" />
          <span>{listing.download_count}</span>
        </div>
      </div>

      {/* Category */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-4">
        <Tag className="h-3 w-3" />
        <span className="capitalize">{listing.category}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2 border-t border-border">
        <PrimaryButton
          size="sm"
          className="flex-1"
          onClick={() => onDownload(listing)}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Download
        </PrimaryButton>
        <SecondaryButton
          size="sm"
          onClick={() => onReview(listing)}
        >
          <Star className="h-3.5 w-3.5 mr-1" />
          Rate
        </SecondaryButton>
      </div>
    </BaseCard>
  );
}

// ===== Review Dialog =====
function ReviewDialog({
  listing,
  open,
  onOpenChange,
  onSubmit,
}: {
  listing: MarketplaceListingItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (listingId: string, rating: number, reviewText: string) => void;
}) {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!listing || rating === 0) return;
    setSubmitting(true);
    try {
      await onSubmit(listing.id, rating, reviewText);
      setRating(0);
      setReviewText("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Schema</DialogTitle>
          <DialogDescription>
            {listing ? `Share your experience with "${listing.title}"` : "Rate this schema"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-sm font-medium mb-2 block">Your Rating</Label>
            <StarRating rating={rating} onRate={setRating} size="md" />
          </div>
          <div>
            <Label htmlFor="review-text" className="text-sm font-medium mb-2 block">
              Review (optional)
            </Label>
            <Textarea
              id="review-text"
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Share what you liked or how this schema could be improved..."
              rows={4}
              maxLength={2000}
            />
          </div>
          <PrimaryButton
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Review"
            )}
          </PrimaryButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== Stats Cards =====
function StatsCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <BaseCard className="p-4 flex items-center gap-3">
      <div className="rounded-lg bg-primary/10 p-2">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </BaseCard>
  );
}

// ===== Main Page Component =====
export default function SchemaMarketplacePage() {
  const { user } = useAuth();
  const [listings, setListings] = useState<MarketplaceListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState<MarketplaceSortBy>("newest");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [stats, setStats] = useState<{
    total_listings: number;
    total_downloads: number;
    total_reviews: number;
  } | null>(null);
  const [reviewListing, setReviewListing] = useState<MarketplaceListingItem | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const result = await browseMarketplaceListings({
        search: searchQuery || undefined,
        category: category === "all" ? undefined : category,
        sort_by: sortBy,
        page,
        page_size: 20,
      });
      setListings(result.listings);
      setTotalCount(result.total_count);
      setHasMore(result.has_more);
    } catch (err) {
      toast.error("Failed to load marketplace listings");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, category, sortBy, page]);

  const fetchStats = useCallback(async () => {
    try {
      const result = await getMarketplaceStats();
      setStats({
        total_listings: result.total_listings,
        total_downloads: result.total_downloads,
        total_reviews: result.total_reviews,
      });
    } catch {
      // Non-critical, silently fail
    }
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleDownload = async (listing: MarketplaceListingItem) => {
    try {
      const result = await downloadMarketplaceSchema(listing.id);
      toast.success(`Downloaded "${result.title}" (v${result.version})`);
      // Refresh to update download count
      fetchListings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  const handleReview = (listing: MarketplaceListingItem) => {
    setReviewListing(listing);
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = async (
    listingId: string,
    rating: number,
    reviewText: string
  ) => {
    try {
      await submitMarketplaceReview(listingId, {
        rating,
        review_text: reviewText || undefined,
      });
      toast.success("Review submitted successfully!");
      fetchListings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit review");
      throw err; // Re-throw so dialog knows submission failed
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchListings();
  };

  return (
    <PageContainer width="wide">
      <Header
        title="Schema Marketplace"
        description="Discover, share, and download extraction schemas created by the community"
        icon={Store}
      />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatsCard
            icon={Package}
            label="Published Schemas"
            value={stats.total_listings}
          />
          <StatsCard
            icon={Download}
            label="Total Downloads"
            value={stats.total_downloads}
          />
          <StatsCard
            icon={Star}
            label="Community Reviews"
            value={stats.total_reviews}
          />
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search schemas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </form>

        <div className="flex gap-2">
          {/* Category filter */}
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as MarketplaceSortBy);
              setPage(1);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {totalCount} schema{totalCount !== 1 ? "s" : ""} found
        </p>
      </div>

      {/* Listings Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <LoadingIndicator size="lg" message="Loading marketplace..." />
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No schemas found"
          description={
            searchQuery || category !== "all"
              ? "Try adjusting your search or filters"
              : "Be the first to publish a schema to the marketplace!"
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onDownload={handleDownload}
                onReview={handleReview}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalCount > 20 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <SecondaryButton
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </SecondaryButton>
              <span className="text-sm text-muted-foreground px-3">
                Page {page} of {Math.ceil(totalCount / 20)}
              </span>
              <SecondaryButton
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </SecondaryButton>
            </div>
          )}
        </>
      )}

      {/* Review Dialog */}
      <ReviewDialog
        listing={reviewListing}
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        onSubmit={handleSubmitReview}
      />
    </PageContainer>
  );
}
