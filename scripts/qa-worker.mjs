// Advances QA runs while `npm run dev` is running, so runs continue without an
// open browser page. Start it in a second terminal with `npm run qa:worker`.

const baseUrl = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET?.trim();
const IDLE_DELAY_MS = 15_000;
const BUSY_DELAY_MS = 1_000;

if (!secret || secret.startsWith("replace_with")) {
  throw new Error("CRON_SECRET is not configured in .env.local.");
}

console.log(`QA worker: calling ${baseUrl}/api/qa/driver (Ctrl+C to stop).`);

for (;;) {
  let delay = IDLE_DELAY_MS;

  try {
    const response = await fetch(`${baseUrl}/api/qa/driver`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
    });

    if (response.ok) {
      const { processed } = await response.json();

      if (processed > 0) {
        console.log(`${new Date().toLocaleTimeString()} advanced ${processed} run(s).`);
        delay = BUSY_DELAY_MS;
      }
    } else {
      console.warn(`QA driver returned HTTP ${response.status}.`);
    }
  } catch (error) {
    console.warn(`QA driver unreachable: ${error instanceof Error ? error.message : error}`);
  }

  await new Promise((resolve) => setTimeout(resolve, delay));
}
