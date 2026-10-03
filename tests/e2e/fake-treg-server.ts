// A stand-in for Treg on a fixed loopback port, started by Playwright as a webServer. It serves
// the synthetic answers in tests/helpers/fake-treg-answers.ts and is steered by the specs:
// POST /__mode {"mode": "balance"} changes how the next calls are answered. Never the real service.
import { createServer } from "node:http";
import { E2E_TREG_PORT } from "../../playwright.config";
import type { Mode } from "../helpers/fake-treg";
import { respond } from "../helpers/fake-treg";

let mode: Mode = "ok";
const calls: { endpoint: string }[] = [];
const ANSWERS = {
  rank: 4,
  // Four linking sites: the list call is made, and its four rows are all outside sites.
  referringDomains: 4,
  domain: "fernandfield.example.com",
  text: "Fern & Field and Lighthouse Café are both good options.",
  sources: ["https://news.example.org/plants", "https://reviews.example.net/shops"],
};

const server = createServer((req, res) => {
  const url = req.url ?? "";
  if (url === "/health") return void res.writeHead(200).end("ok");
  if (url === "/__calls") return void res.writeHead(200).end(JSON.stringify(calls));
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    if (url === "/__mode") {
      mode = (JSON.parse(body) as { mode: Mode }).mode;
      return void res.writeHead(200).end("ok");
    }
    const endpoint = url.replace(/^\/call\//, "");
    calls.push({ endpoint });
    // One search is "not in the top 30" for Fern & Field, so the page shows both kinds of answer.
    const missing = body.includes("plant shop brisbane");
    respond(res, mode, endpoint, { ...ANSWERS, rank: missing ? null : 4 }, undefined);
  });
});
server.listen(E2E_TREG_PORT, "127.0.0.1", () =>
  console.log(`fake treg ready on http://127.0.0.1:${E2E_TREG_PORT}`),
);
