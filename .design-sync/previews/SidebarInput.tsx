import * as React from "react";
import {
  SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarGroupContent,
  SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInput,
} from "@juddges/design-system";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <SidebarProvider className="min-h-0 h-[360px] w-64 overflow-hidden rounded-md border border-[color:var(--rule)]">
    <Sidebar collapsible="none">{children}</Sidebar>
  </SidebarProvider>
);

export const FilterConversations = () => (
  <Frame>
    <SidebarHeader>
      <SidebarInput placeholder="Filter conversations…" />
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Recent</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton isActive><span>Limitation periods in contract claims</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton><span>Sentencing for aggravated theft</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton><span>Custody after parental relocation</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Frame>
);

export const WithValue = () => (
  <Frame>
    <SidebarHeader>
      <SidebarInput defaultValue="aggravated theft" />
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>1 match</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem><SidebarMenuButton><span>Sentencing for aggravated theft</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Frame>
);

export const Disabled = () => (
  <Frame>
    <SidebarHeader>
      <SidebarInput placeholder="Filter unavailable offline" disabled />
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Collections</SidebarGroupLabel>
      </SidebarGroup>
    </SidebarContent>
  </Frame>
);
