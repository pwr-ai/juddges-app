import * as React from "react";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@juddges/design-system";

export const SearchResults = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
      <PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#" isActive>2</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#">3</PaginationLink></PaginationItem>
      <PaginationItem><PaginationEllipsis /></PaginationItem>
      <PaginationItem><PaginationLink href="#">412</PaginationLink></PaginationItem>
      <PaginationItem><PaginationNext href="#" /></PaginationItem>
    </PaginationContent>
  </Pagination>
);

export const FirstPage = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem><PaginationPrevious href="#" aria-disabled className="pointer-events-none opacity-50" /></PaginationItem>
      <PaginationItem><PaginationLink href="#" isActive>1</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#">2</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#">3</PaginationLink></PaginationItem>
      <PaginationItem><PaginationNext href="#" /></PaginationItem>
    </PaginationContent>
  </Pagination>
);

export const FewPages = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
      <PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#" isActive>2</PaginationLink></PaginationItem>
      <PaginationItem><PaginationNext href="#" aria-disabled className="pointer-events-none opacity-50" /></PaginationItem>
    </PaginationContent>
  </Pagination>
);

export const WithSummary = () => (
  <div className="flex flex-col items-center gap-3">
    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink-soft)]">
      Showing 21–40 of 8,236 judgments
    </p>
    <Pagination>
      <PaginationContent>
        <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
        <PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem>
        <PaginationItem><PaginationLink href="#" isActive>2</PaginationLink></PaginationItem>
        <PaginationItem><PaginationLink href="#">3</PaginationLink></PaginationItem>
        <PaginationItem><PaginationEllipsis /></PaginationItem>
        <PaginationItem><PaginationNext href="#" /></PaginationItem>
      </PaginationContent>
    </Pagination>
  </div>
);
