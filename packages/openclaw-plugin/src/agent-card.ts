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

export function buildAgentCard(config: PluginConfig): Record<string, unknown> {
  // Collect skills from all agent identities (multi-agent) or fall back to top-level skills
  const allSkills = config.agents && Object.keys(config.agents).length > 0
    ? Object.values(config.agents).flatMap((a) => a.skills)
    : config.skills;

  const card: Record<string, unknown> = {
    name: config.agentName,
    description: config.agentDescription,
    url: `${config.publicBaseUrl}/a2a`,
    version: "0.2.0",
    protocol_version: "0.3.0",
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: allSkills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags ?? [],
    })),
    defaultInputModes: ["text", "file", "data"],
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
