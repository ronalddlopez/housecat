import { useUser } from "@clerk/clerk-react";
import { useEffect, useRef } from "react";

export function useUserSync() {
  const { user, isLoaded } = useUser();
  const synced = useRef(false);

  useEffect(() => {
    if (!isLoaded || !user || synced.current) return;
    synced.current = true;

    fetch("/api/auth/sync-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        userId: user.id,
        email: user.primaryEmailAddress?.emailAddress,
        firstName: user.firstName,
        lastName: user.lastName,
      }),
    }).catch((err) => console.error("Failed to sync user:", err));
  }, [user, isLoaded]);
}
