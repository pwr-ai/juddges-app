import * as React from "react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, Button, Badge } from "@juddges/design-system";

export const Default = () => (
  <TooltipProvider>
    <div className="flex h-48 items-center justify-center">
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="outline">Cite this judgment</Button>
        </TooltipTrigger>
        <TooltipContent>Copies “II AKa 47/23, SA Wrocław, 14.03.2023” to the clipboard</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);

export const Sides = () => (
  <TooltipProvider>
    <div className="flex flex-col items-center gap-12 py-12">
      <div className="flex items-center gap-12">
        <Tooltip open>
          <TooltipTrigger asChild><Button variant="outline" size="sm">Top</Button></TooltipTrigger>
          <TooltipContent side="top">Reasoning extracted</TooltipContent>
        </Tooltip>
        <Tooltip open>
          <TooltipTrigger asChild><Button variant="outline" size="sm">Bottom</Button></TooltipTrigger>
          <TooltipContent side="bottom">Full text available</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex w-80 items-center justify-between">
        <Tooltip open>
          <TooltipTrigger asChild><Button variant="outline" size="sm">Left</Button></TooltipTrigger>
          <TooltipContent side="left">Court of Appeal</TooltipContent>
        </Tooltip>
        <Tooltip open>
          <TooltipTrigger asChild><Button variant="outline" size="sm">Right</Button></TooltipTrigger>
          <TooltipContent side="right">Supreme Court</TooltipContent>
        </Tooltip>
      </div>
    </div>
  </TooltipProvider>
);

export const OnBadge = () => (
  <TooltipProvider>
    <div className="flex h-32 items-center justify-center">
      <Tooltip open>
        <TooltipTrigger asChild>
          <Badge variant="outline">0.88</Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">Extraction confidence — below the 0.9 review threshold</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
);
