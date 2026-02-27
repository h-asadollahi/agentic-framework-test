import type { NotificationRequest, NotificationResult } from "../core/types.js";

/**
 * Channel Adapter Interface
 *
 * Every notification channel (Slack, Email, Webhook) implements this interface.
 * The notify task dispatches to the appropriate adapter based on the channel field.
 */
export interface ChannelAdapter {
  /** Channel identifier (must match NotificationChannel type) */
  readonly channel: string;

  /**
   * Send a notification through this channel.
   * Implementations should handle retries internally or rely on trigger.dev retries.
   */
  send(request: NotificationRequest): Promise<NotificationResult>;

  /**
   * Check if this channel is properly configured and ready to send.
   */
  isConfigured(): boolean;
}

/**
 * Channel Registry
 *
 * Holds all registered channel adapters. The notify task uses this
 * to look up the right adapter for each notification.
 */
class ChannelRegistryImpl {
  private adapters: Map<string, ChannelAdapter> = new Map();

  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  get(channel: string): ChannelAdapter | undefined {
    return this.adapters.get(channel);
  }

  getOrThrow(channel: string): ChannelAdapter {
    const adapter = this.adapters.get(channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${channel}`);
    }
    return adapter;
  }

  list(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }

  listConfigured(): ChannelAdapter[] {
    return this.list().filter((a) => a.isConfigured());
  }
}

export const channelRegistry = new ChannelRegistryImpl();
