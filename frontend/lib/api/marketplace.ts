import { apiLogger } from './client';
import type {
  BrowseListingsResponse,
  MarketplaceListingDetail,
  MarketplaceListingItem,
  MarketplaceStatsResponse,
  DownloadResponse as MarketplaceDownloadResponse,
  ReviewsResponse as MarketplaceReviewsResponse,
  PublishListingRequest,
  SubmitReviewRequest,
  MarketplaceSortBy,
} from "@/types/marketplace";

export type {
  BrowseListingsResponse,
  MarketplaceListingDetail,
  MarketplaceListingItem,
  MarketplaceStatsResponse,
  MarketplaceDownloadResponse,
  MarketplaceReviewsResponse,
};

export async function browseMarketplaceListings(params?: {
  search?: string;
  category?: string;
  tags?: string;
  sort_by?: MarketplaceSortBy;
  page?: number;
  page_size?: number;
}): Promise<BrowseListingsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("endpoint", "browse");
  if (params?.search) searchParams.set("search", params.search);
  if (params?.category) searchParams.set("category", params.category);
  if (params?.tags) searchParams.set("tags", params.tags);
  if (params?.sort_by) searchParams.set("sort_by", params.sort_by);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));

  const url = `/api/marketplace?${searchParams.toString()}`;
  apiLogger.info("browseMarketplaceListings called", params);

  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to browse marketplace" }));
    apiLogger.error("Marketplace browse API error: ", response.status, errorData);
    throw new Error(errorData.error || "Failed to browse marketplace.");
  }

  return response.json();
}

export async function getMarketplaceStats(): Promise<MarketplaceStatsResponse> {
  const response = await fetch("/api/marketplace?endpoint=stats");

  if (!response.ok) {
    throw new Error("Failed to fetch marketplace statistics.");
  }

  return response.json();
}

export async function getMyMarketplaceListings(params?: {
  status_filter?: string;
  page?: number;
  page_size?: number;
}): Promise<BrowseListingsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("endpoint", "my-listings");
  if (params?.status_filter) searchParams.set("status_filter", params.status_filter);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size) searchParams.set("page_size", String(params.page_size));

  const response = await fetch(`/api/marketplace?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch your listings.");
  }

  return response.json();
}

export async function publishToMarketplace(
  input: PublishListingRequest
): Promise<MarketplaceListingItem> {
  apiLogger.info("publishToMarketplace called", { schemaId: input.schema_id, title: input.title });

  const response = await fetch("/api/marketplace?action=publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to publish schema" }));
    apiLogger.error("Marketplace publish API error: ", response.status, errorData);
    throw new Error(errorData.error || "Failed to publish schema to marketplace.");
  }

  return response.json();
}

export async function downloadMarketplaceSchema(
  listingId: string
): Promise<MarketplaceDownloadResponse> {
  apiLogger.info("downloadMarketplaceSchema called", { listingId });

  const response = await fetch(`/api/marketplace?action=download&listing_id=${listingId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to download schema" }));
    throw new Error(errorData.error || "Failed to download schema.");
  }

  return response.json();
}

export async function submitMarketplaceReview(
  listingId: string,
  input: SubmitReviewRequest
): Promise<void> {
  apiLogger.info("submitMarketplaceReview called", { listingId, rating: input.rating });

  const response = await fetch(`/api/marketplace?action=review&listing_id=${listingId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: "Failed to submit review" }));
    throw new Error(errorData.error || "Failed to submit review.");
  }
}
