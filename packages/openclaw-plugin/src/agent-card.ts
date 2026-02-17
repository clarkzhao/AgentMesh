import type { IncomingMessage, ServerResponse } from "node:http";
import type { PluginConfig } from "./types.js";

export function createAgentCardHandler(config: PluginConfig) {
  const card = buildAgentCard(config);
  const body = JSON.stringify(card, null, 2);

  return (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  };
}

function buildAgentCard(config: PluginConfig): Record<string, unknown> {
  const card: Record<string, unknown> = {
    name: config.agentName,
    description: config.agentDescription,
    url: `${config.publicBaseUrl}/a2a`,
    version: "0.1.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: config.skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
    })),
    defaultInputModes: ["text"],
    defaultOutputModes: ["text"],
  };

  if (!config.auth.allowUnauthenticated) {
    card.securitySchemes = {
      bearer: { type: "http", scheme: "bearer" },
    };
    card.security = [{ bearer: [] }];
  }

  return card;
}
