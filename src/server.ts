import { config } from "./config";
import { capture } from "./capture";
import { getScenario, listScenarios } from "./scenarios";
import { closeRedis } from "./redis-client";

const SCENARIO_ID = /^[a-z][a-z0-9-]{0,31}$/;
const PUBLIC_DIR = new URL("../public/", import.meta.url);

const html = Bun.file(new URL("index.html", PUBLIC_DIR));
const css = Bun.file(new URL("style.css", PUBLIC_DIR));
const appJs = Bun.file(new URL("app.js", PUBLIC_DIR));

const runScenario = async (id: string): Promise<Response> => {
  if (!SCENARIO_ID.test(id)) return Response.json({ error: "Invalid scenario id" }, { status: 400 });

  const scenario = getScenario(id);
  if (!scenario) return Response.json({ error: "Unknown scenario" }, { status: 404 });

  try {
    const events = await capture(scenario.run);
    return Response.json({ id: scenario.id, title: scenario.title, narrative: scenario.narrative, events });
  } catch (err) {
    console.error(`Scenario ${id} failed:`, err);
    return Response.json({ error: "Scenario execution failed" }, { status: 500 });
  }
};

const server = Bun.serve({
  port: config.httpPort,
  hostname: "0.0.0.0",
  routes: {
    "/": html,
    "/style.css": css,
    "/app.js": appJs,
    "/api/info": () => Response.json({ redisPort: config.redisPort, scenarioCount: listScenarios().length }),
    "/api/scenarios": () => Response.json(listScenarios()),
    "/api/scenarios/:id": {
      POST: (req) => runScenario(req.params.id),
    },
  },
  fetch: () => new Response("Not Found", { status: 404 }),
});

console.log(`Materia KV demo running at http://${server.hostname}:${server.port}`);

const shutdown = async (): Promise<void> => {
  closeRedis();
  await server.stop(true);
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
