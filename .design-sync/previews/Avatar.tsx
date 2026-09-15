import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@juddges/design-system";

export const Default = () => (
  <Avatar>
    <AvatarImage src="/nonexistent/judge.png" alt="Anna Kowalska" />
    <AvatarFallback>AK</AvatarFallback>
  </Avatar>
);

export const Sizes = () => (
  <div className="flex items-center gap-3">
    <Avatar className="size-6 text-[10px]">
      <AvatarFallback>AK</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback className="text-xs">AK</AvatarFallback>
    </Avatar>
    <Avatar className="size-10">
      <AvatarFallback className="text-sm">AK</AvatarFallback>
    </Avatar>
    <Avatar className="size-12">
      <AvatarFallback className="text-lg">AK</AvatarFallback>
    </Avatar>
  </div>
);

export const Group = () => (
  <div className="inline-flex -space-x-2 rounded-md bg-parchment p-3">
    <Avatar className="ring-2 ring-parchment">
      <AvatarFallback className="bg-oxblood text-xs text-parchment">TS</AvatarFallback>
    </Avatar>
    <Avatar className="ring-2 ring-parchment">
      <AvatarFallback className="bg-ink text-xs text-parchment">BN</AvatarFallback>
    </Avatar>
    <Avatar className="ring-2 ring-parchment">
      <AvatarFallback className="bg-rule-strong text-xs text-ink">MW</AvatarFallback>
    </Avatar>
    <Avatar className="ring-2 ring-parchment">
      <AvatarFallback className="text-xs text-ink-soft">+2</AvatarFallback>
    </Avatar>
  </div>
);

export const WithName = () => (
  <div className="flex items-center gap-3">
    <Avatar className="size-10">
      <AvatarFallback className="bg-[color:var(--oxblood)] text-sm text-[color:var(--parchment)]">JW</AvatarFallback>
    </Avatar>
    <div className="grid gap-0.5">
      <span className="text-sm font-medium text-[color:var(--ink)]">SSA Jerzy Wiśniewski</span>
      <span className="text-xs text-[color:var(--ink-soft)]">Sędzia sprawozdawca · Sąd Apelacyjny w Krakowie</span>
    </div>
  </div>
);
