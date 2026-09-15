import * as React from "react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, Button,
} from "@juddges/design-system";

export const JudgmentActions = () => (
  <div className="flex h-80 items-start justify-center pt-2">
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel>II AKa 47/23</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Open full text</DropdownMenuItem>
        <DropdownMenuItem>Save to collection</DropdownMenuItem>
        <DropdownMenuItem>Copy citation</DropdownMenuItem>
        <DropdownMenuItem>Extract structured data</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Remove from results</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

export const SortMenu = () => (
  <div className="flex h-64 items-start justify-center pt-2">
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">Sort: Relevance</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel>Sort results by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Relevance</DropdownMenuItem>
        <DropdownMenuItem>Judgment date — newest</DropdownMenuItem>
        <DropdownMenuItem>Judgment date — oldest</DropdownMenuItem>
        <DropdownMenuItem>Court hierarchy</DropdownMenuItem>
        <DropdownMenuItem disabled>Citation count (soon)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
