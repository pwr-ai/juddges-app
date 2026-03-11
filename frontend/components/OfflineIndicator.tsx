"use client";

import { useEffect, useState } from "react";
import { WifiOff, Wifi, RefreshCw } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOfflineSync } from "@/hooks/useOfflineSync";

export function OfflineIndicator() {
 const isOnline = useOnlineStatus();
 const { pendingCount } = useOfflineSync();
 const [showReconnected, setShowReconnected] = useState(false);
 const [wasOffline, setWasOffline] = useState(false);

 useEffect(() => {
 if (!isOnline) {
 setWasOffline(true);
 } else if (wasOffline) {
 // Show"reconnected"briefly when coming back online
 setShowReconnected(true);
 const timer = setTimeout(() => {
 setShowReconnected(false);
 setWasOffline(false);
 }, 3000);
 return () => clearTimeout(timer);
 }
 }, [isOnline, wasOffline]);

 // Show syncing badge when there are pending items
 if (isOnline && pendingCount > 0) {
 return (
 <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
 <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 shadow-lg text-sm text-blue-700">
 <RefreshCw className="h-4 w-4 animate-spin"/>
 <span>Syncing {pendingCount} item{pendingCount > 1 ? "s": ""}...</span>
 </div>
 </div>
 );
 }

 // Show reconnected message
 if (showReconnected) {
 return (
 <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
 <div className="flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-4 py-2 shadow-lg text-sm text-green-700">
 <Wifi className="h-4 w-4"/>
 <span>Back online</span>
 </div>
 </div>
 );
 }

 // Show offline banner
 if (!isOnline) {
 return (
 <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
 <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 shadow-lg text-sm text-amber-700">
 <WifiOff className="h-4 w-4"/>
 <span>You are offline</span>
 </div>
 </div>
 );
 }

 return null;
}
