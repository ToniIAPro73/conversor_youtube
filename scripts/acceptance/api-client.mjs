import fs from "node:fs";
import path from "node:path";

export async function getJson(baseUrl, route) {
  const response = await fetch(new URL(route, baseUrl));
  return parseResponse(response);
}

export async function postJson(baseUrl, route, body) {
  const response = await fetch(new URL(route, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

export async function uploadFile(baseUrl, filePath) {
  const form = new FormData();
  const bytes = fs.readFileSync(filePath);
  form.append("file", new Blob([bytes]), path.basename(filePath));
  const response = await fetch(new URL("/api/inputs/analyze", baseUrl), {
    method: "POST",
    body: form,
  });
  return parseResponse(response);
}

export async function pollJob(baseUrl, jobId, timeoutMs = 120_000) {
  const startedAt = Date.now();
  let last;
  while (Date.now() - startedAt < timeoutMs) {
    last = await getJson(baseUrl, `/api/jobs/${jobId}`);
    if (last.status === "completed") return last;
    if (["failed", "cancelled"].includes(last.status)) {
      throw new Error(`Job ${jobId} ended as ${last.status}: ${last.error ?? "no error"}`);
    }
    await sleep(1000);
  }
  throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms; last=${JSON.stringify(last)}`);
}

export async function downloadJob(baseUrl, jobId, destinationDir) {
  const token = await getJson(baseUrl, `/api/jobs/${jobId}/token`);
  const response = await fetch(new URL(token.downloadUrl, baseUrl));
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}: ${await response.text()}`);
  }
  fs.mkdirSync(destinationDir, { recursive: true });
  const disposition = response.headers.get("content-disposition") ?? "";
  const name = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `${jobId}.bin`;
  const destination = path.join(destinationDir, sanitizeDownloadName(name));
  fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
  return destination;
}

async function parseResponse(response) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const message = typeof body === "object" && body ? JSON.stringify(body) : String(body);
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }
  return body;
}

function sanitizeDownloadName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
