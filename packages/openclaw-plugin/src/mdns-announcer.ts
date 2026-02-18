import Bonjour, { type Service } from "bonjour-service";

export interface MdnsAnnouncerOptions {
  port: number;
  agentName: string;
  publicBaseUrl: string;
}

export class MdnsAnnouncer {
  private bonjour: InstanceType<typeof Bonjour> | null = null;
  private service: Service | null = null;
  private options: MdnsAnnouncerOptions;

  constructor(options: MdnsAnnouncerOptions) {
    this.options = options;
  }

  start(): void {
    this.bonjour = new Bonjour();
    this.service = this.bonjour.publish({
      name: this.options.agentName,
      type: "a2a",
      protocol: "tcp",
      port: this.options.port,
      txt: {
        url: `${this.options.publicBaseUrl}/.well-known/agent-card.json`,
        name: this.options.agentName,
        v: "1",
      },
    });
    console.log(
      `agentmesh-a2a: mDNS announcing ${this.options.agentName} on _a2a._tcp port ${this.options.port}`,
    );
  }

  stop(): void {
    if (this.service) {
      this.service.stop?.();
      this.service = null;
    }
    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }
  }
}
