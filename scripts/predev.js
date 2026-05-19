/**
 * Clears port 3001 before `npm run dev` so stale Node processes
 * from a previous session never block startup.
 */
const { execSync } = require("child_process");

const PORT = 3001;

try {
  const out = execSync(`netstat -ano | findstr :${PORT}`, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });

  const pids = [
    ...new Set(
      out
        .trim()
        .split("\n")
        .map((l) => l.trim().split(/\s+/).pop())
        .filter((p) => p && p !== "0")
    ),
  ];

  if (pids.length === 0) {
    console.log(`[predev] Port ${PORT} is free — starting normally.`);
    process.exit(0);
  }

  pids.forEach((pid) => {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      console.log(`[predev] Killed stale process PID ${pid} on port ${PORT}.`);
    } catch {}
  });
} catch {
  // netstat found nothing — port is free
  console.log(`[predev] Port ${PORT} is free — starting normally.`);
}
