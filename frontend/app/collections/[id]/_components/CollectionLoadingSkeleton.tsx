import { FC } from "react";

/** Full-page loading skeleton shown while the collection is being fetched. */
const CollectionLoadingSkeleton: FC = () => {
  return (
    <div className="container mx-auto px-6 py-8 md:px-8 lg:px-12 max-w-[1600px]">
      {/* Header skeleton */}
      <div className="mb-10">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1">
            <div className="flex items-baseline gap-3 flex-wrap mb-3">
              <div className="h-8 w-48 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-pulse"></div>
              <div className="h-7 w-28 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-full animate-pulse"></div>
              <div className="h-8 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-pulse"></div>
            </div>
            <div className="h-1 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-full animate-pulse"></div>
          </div>
          <div className="h-8 w-32 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-md animate-pulse"></div>
        </div>
      </div>

      {/* Extraction banner skeleton */}
      <div className="mt-8 p-6 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0 w-9 h-9 animate-pulse"></div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-6 w-3/4 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-pulse"></div>
            <div className="h-4 w-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-pulse"></div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-4 border-t border-primary/10">
          <div className="h-4 w-64 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-pulse"></div>
          <div className="flex gap-2">
            <div className="h-9 w-32 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-pulse"></div>
            <div className="h-9 w-36 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Document cards skeleton */}
      <div className="mt-8">
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mb-6"></div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="border rounded-xl shadow-sm bg-card animate-pulse overflow-hidden"
              style={{ minHeight: '360px' }}
            >
              <div className="px-4 pt-3 pb-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-32 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
                  <div className="h-6 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
                </div>
              </div>
              <div className="px-4 py-3 space-y-3">
                <div className="h-4 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
                <div className="h-20 w-full bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-lg"></div>
                <div className="flex flex-wrap gap-1.5">
                  <div className="h-6 w-20 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-full"></div>
                  <div className="h-6 w-24 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-full"></div>
                  <div className="h-6 w-16 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-full"></div>
                </div>
              </div>
              <div className="px-4 pt-2 pb-2 border-t mt-auto flex items-center gap-2">
                <div className="h-8 flex-1 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
                <div className="h-8 w-20 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CollectionLoadingSkeleton;
