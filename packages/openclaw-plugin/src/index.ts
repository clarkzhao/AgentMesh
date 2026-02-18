import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { resolvePluginConfig } from "./config.js";
import { createAgentCardHandler } from "./agent-card.js";
import { createA2aHandler } from "./a2a-handler.js";
import { MdnsAnnouncer } from "./mdns-announcer.js";

const plugin: {
  id: string;
  name: string;
  description: string;
  configSchema: ReturnType<typeof emptyPluginConfigSchema>;
  register: (api: OpenClawPluginApi) => void;
} = {
  id: "agentmesh-a2a",
  name: "AgentMesh A2A Bridge",
  description: "Exposes any OpenClaw agent as a standard A2A agent via the A2A protocol",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const config = resolvePluginConfig(api.pluginConfig ?? {}, api);
    if (!config.enabled) return;

    const agentCardHandler = createAgentCardHandler(config);

    // Register /.well-known/agent-card.json (new spec path, primary)
    api.registerHttpRoute({
      path: "/.well-known/agent-card.json",
      handler: agentCardHandler,
    });

    // Register /a2a endpoint (token-gated)
    api.registerHttpRoute({
      path: "/a2a",
      handler: createA2aHandler({ api, config }),
    });

    // mDNS announcement via service lifecycle
    if (config.mdns) {
      let announcer: MdnsAnnouncer | null = null;

      api.on("gateway_start", (event) => {
        announcer = new MdnsAnnouncer({
          port: event.port,
          agentName: config.agentName,
          publicBaseUrl: config.publicBaseUrl,
        });
        announcer.start();
        api.logger.info(
          `mDNS announcing ${config.agentName} on _a2a._tcp port ${event.port}`,
        );
      });

      api.on("gateway_stop", () => {
        announcer?.stop();
        announcer = null;
      });
    }

    api.logger.info(
      `Plugin registered (agent: ${config.agentName}, ` +
        `url: ${config.publicBaseUrl}/a2a, ` +
        `auth: ${config.auth.allowUnauthenticated ? "disabled" : "enabled"}, ` +
        `mdns: ${config.mdns}, ` +
        `session: ${config.session.strategy})`,
    );
  },
};

export default plugin;
