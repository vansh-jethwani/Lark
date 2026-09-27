import { CronJob } from "cron";
import http from "node:http";
import https from "node:https";
import { deleteExpiredMessages } from "../controllers/message.controller.js";
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

// every 5 minutes: physically delete expired disappearing messages
// (documents + their ImageKit files) and push live removals to clients.
// Message reads filter expired documents independently, so a missed run
// only delays deletion — it never leaks content.
const expiryJob = new CronJob("*/5 * * * *", async function () {
    try {
        const deleted = await deleteExpiredMessages();
        if (deleted > 0) console.log(`Expired-message cleanup deleted ${deleted} message(s).`);
    } catch (error) {
        console.error("Expired-message cleanup failed:", error.message);
    }
});
expiryJob.start();
export default job;