import { CronJob } from "cron";
import http from "node:http";
import https from "node:https";
// every 14 minutes send a GET request to the backend's own health endpoint
const job = new CronJob("*/14 * * * *", function () {
    // /ping is a backend route, so ping the backend's public URL — pinging
    // the frontend SPA would just return index.html and never hit /ping.
    const base = process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL;
    if (!base) {
        console.warn("Keep-alive ping skipped: set BACKEND_URL (or RENDER_EXTERNAL_URL) to the backend's public URL.");
        return;
    }
    const url = new URL("/ping", base).href;
    const client = url.startsWith("https:") ? https : http;
    client
        .get(url, (res) => {
            if (res.statusCode === 200) console.log("GET request sent successfully");
            else console.log("GET request failed", res.statusCode);
        })
        .on("error", (e) => console.error("Error while sending request", e));
});
export default job;