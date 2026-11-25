import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    const hash = window.location.hash;
    if (!hash.includes("access_token")) return;

    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = params.get("type");
    const expiresIn = params.get("expires_in");

    if (!accessToken || !refreshToken) return;

    supabase.auth
      .setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
        ...(expiresIn ? { expires_in: Number(expiresIn) } : {}),
      })
      .then(() => {
        if (!active) return;
        // Clear the hash so a reload does not re-trigger the flow.
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
        if (type === "invite") {
          navigate("/signup", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  return null;
}
