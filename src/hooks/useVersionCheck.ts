import { useEffect, useState } from "react";
import { VERSION } from "../version.js";

type VersionCheckResult = {
  updateAvailable: boolean;
  latestVersion: string | null;
  currentVersion: string;
};

export function useVersionCheck(): VersionCheckResult {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    if (
      process.env.LOCAL_CHAT_NO_UPDATE_CHECK === "1" ||
      process.argv.includes("--no-update-check")
    ) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch("https://registry.npmjs.org/local-chat/latest", {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.version) {
          setLatestVersion(data.version);
        }
      })
      .catch(() => {
        // 네트워크 오류 시 조용히 무시
      })
      .finally(() => {
        clearTimeout(timeout);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return {
    updateAvailable: latestVersion !== null && latestVersion !== VERSION,
    latestVersion,
    currentVersion: VERSION,
  };
}
