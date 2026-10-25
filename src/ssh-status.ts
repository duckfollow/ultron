// Diagnose failed SSH exits only. Terminal output is never treated as proof of login.
export function sshFailure(output: string, code: number | null) {
  if (code !== 255) return null;
  const clean = output
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  // Keep diagnostics only, not shell history, banners, or interactive responses.
  const lines = clean
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      /^(ssh:|ssh_exchange_identification:|kex_exchange_identification:|Host key verification failed\.?$|REMOTE HOST IDENTIFICATION HAS CHANGED|WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED|Offending .* key in |Connection (?:closed|reset) by |Connection timed out during |Connection to .*(?:timed out|closed|reset|refused)|.*: Permission denied \([a-z,-]+\)\.?$)/i.test(
        line,
      ),
    );
  const details = lines.slice(-12).join("\n");
  let title = "SSH session failed";
  if (/permission denied/i.test(details)) title = "Authentication failed";
  else if (/connection refused/i.test(details)) title = "Connection refused";
  else if (/timed out|operation timeout/i.test(details))
    title = "Connection timed out";
  else if (/host key|identification has changed/i.test(details))
    title = "Host key verification failed";
  else if (
    /could not resolve hostname|name or service not known/i.test(details)
  )
    title = "Server not found";
  else if (/no route to host|network is unreachable/i.test(details))
    title = "Server unreachable";
  return {
    title,
    details:
      details ||
      "OpenSSH exited with code 255. See the terminal for more details.",
  };
}
