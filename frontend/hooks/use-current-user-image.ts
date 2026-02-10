"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function useCurrentUserImage() {
  const { user } = useAuth();
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !user.email) {
      setImageSrc(null);
      return;
    }

    // Use the user's email to generate a random avatar
    const hash = encodeURIComponent(user.email);
    setImageSrc(`https://api.dicebear.com/7.x/identicon/svg?seed=${hash}`);
  }, [user]);

  return imageSrc;
}
