import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
if (process.platform === "darwin") {
  const app = fileURLToPath(
    new URL(
      "../src-tauri/target/release/bundle/macos/Ultron.app",
      import.meta.url,
    ),
  );
  execFileSync(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", app],
    { stdio: "inherit" },
  );
  console.log(
    "Bundle integrity verified. Developer ID / notarization are not configured.",
  );
}
