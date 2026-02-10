export type MarketplaceListingStatus = 'draft' | 'published' | 'under_review' | 'archived' | 'rejected';

export interface MarketplaceListingItem {
  id: string;
  schema_id: string;
  publisher_id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  download_count: number;
  avg_rating: number;
  rating_count: number;
  status: MarketplaceListingStatus;
  is_featured: boolean;
  license: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceListingDetail extends MarketplaceListingItem {
  long_description: string | null;
  changelog: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema_data: Record<string, any> | null;
}

export interface BrowseListingsResponse {
  listings: MarketplaceListingItem[];
  total_count: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface PublishListingRequest {
  schema_id: string;
  title: string;
  description: string;
  long_description?: string;
  category?: string;
  tags?: string[];
  version?: string;
  changelog?: string;
  license?: string;
}

export interface UpdateListingRequest {
  title?: string;
  description?: string;
  long_description?: string;
  category?: string;
  tags?: string[];
  license?: string;
}

export interface SubmitReviewRequest {
  rating: number;
  review_text?: string;
}

export interface ReviewItem {
  id: string;
  listing_id: string;
  reviewer_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewsResponse {
  reviews: ReviewItem[];
  total_count: number;
  avg_rating: number;
}

export interface DownloadResponse {
  listing_id: string;
  schema_id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema_data: Record<string, any>;
  version: string;
  title: string;
}

export interface MarketplaceStatsResponse {
  total_listings: number;
  total_downloads: number;
  total_reviews: number;
  categories: Array<{ name: string; count: number }>;
  top_rated: MarketplaceListingItem[];
  most_downloaded: MarketplaceListingItem[];
}

export interface MarketplaceVersionItem {
  id: string;
  listing_id: string;
  version: string;
  changelog: string | null;
  created_at: string;
}

export interface VersionHistoryResponse {
  listing_id: string;
  versions: MarketplaceVersionItem[];
  total_count: number;
}

export type MarketplaceSortBy = 'newest' | 'popular' | 'top_rated' | 'most_downloaded';
