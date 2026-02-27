/**
 * Channel Index
 *
 * Importing this module registers all channel adapters with the channel registry.
 */
import { channelRegistry } from "./channel-interface.js";
import { slackChannel } from "./slack-channel.js";
import { emailChannel } from "./email-channel.js";
import { webhookChannel } from "./webhook-channel.js";

channelRegistry.register(slackChannel);
channelRegistry.register(emailChannel);
channelRegistry.register(webhookChannel);

export { channelRegistry } from "./channel-interface.js";
