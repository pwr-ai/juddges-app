import * as React from "react";
import {
  SidebarProvider, Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuSkeleton,
} from "@juddges/design-system";

const Frame = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <SidebarProvider className="min-h-0 h-[300px] w-64 overflow-hidden rounded-md border border-[color:var(--rule)]">
    <Sidebar collapsible="none">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>{children}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  </SidebarProvider>
);

export const LoadingConversations = () => (
  <Frame label="Recent conversations">
    {Array.from({ length: 5 }).map((_, i) => (
      <SidebarMenuItem key={i}><SidebarMenuSkeleton /></SidebarMenuItem>
    ))}
  </Frame>
);

export const WithIcon = () => (
  <Frame label="Collections">
    {Array.from({ length: 5 }).map((_, i) => (
      <SidebarMenuItem key={i}><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
    ))}
  </Frame>
);

export const SingleRow = () => (
  <Frame label="Loading one row">
    <SidebarMenuItem><SidebarMenuSkeleton showIcon /></SidebarMenuItem>
  </Frame>
);
