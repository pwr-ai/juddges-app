import * as React from "react";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis,
} from "@juddges/design-system";

export const MiddleOfRange = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
      <PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem>
      <PaginationItem><PaginationEllipsis /></PaginationItem>
      <PaginationItem><PaginationLink href="#">57</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#" isActive>58</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#">59</PaginationLink></PaginationItem>
      <PaginationItem><PaginationEllipsis /></PaginationItem>
      <PaginationItem><PaginationLink href="#">412</PaginationLink></PaginationItem>
      <PaginationItem><PaginationNext href="#" /></PaginationItem>
    </PaginationContent>
  </Pagination>
);

export const TrailingOnly = () => (
  <Pagination>
    <PaginationContent>
      <PaginationItem><PaginationLink href="#" isActive>1</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#">2</PaginationLink></PaginationItem>
      <PaginationItem><PaginationLink href="#">3</PaginationLink></PaginationItem>
      <PaginationItem><PaginationEllipsis /></PaginationItem>
      <PaginationItem><PaginationNext href="#" /></PaginationItem>
    </PaginationContent>
  </Pagination>
);

export const Standalone = () => (
  <div className="flex items-center gap-4">
    <PaginationEllipsis />
    <span className="text-sm text-[color:var(--ink-soft)]">— 36 × 36 px slot, three-dot glyph, sr-only “More pages”</span>
  </div>
);
