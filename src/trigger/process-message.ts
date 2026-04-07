import { task } from "@trigger.dev/sdk";
import { logger } from "@trigger.dev/sdk";
import { EvolutionProvider } from "../providers/whatsapp/evolution.js";
import { transcribeAudio } from "../providers/transcription.js";
import { lookupClient, hasActiveSession, verifyPin } from "../services/auth.js";
import { getActiveConversation, createConversation } from "../services/conversation.js";
import { runAgent } from "../agent/run-agent.js";
import { WordPressClient } from "../wordpress/client.js";
import type { IncomingMessage } from "../providers/whatsapp/types.js";

export const processMessage = task({
  id: "process-whatsapp-message",
  retry: { maxAttempts: 1 },
  run: async (payload: { message: IncomingMessage }) => {
    const { message } = payload;
    const whatsapp = new EvolutionProvider();

    logger.info("Message received", { from: message.from, type: message.type, text: message.text });

    const client = await lookupClient(message.from);
    if (!client) {
      await whatsapp.sendText(message.from, "Sorry, this number is not registered. Contact your agency to set up your Intelligent Website.");
      return { status: "unregistered" };
    }

    const sessionActive = await hasActiveSession(client);
    if (!sessionActive) {
      if (message.type === "text" && /^\d{4,6}$/.test(message.text?.trim() ?? "")) {
        const result = await verifyPin(client, message.text!.trim());
        if (result.error === "locked") {
          await whatsapp.sendText(message.from, "Your account has been locked due to too many failed attempts. Please contact your agency.");
          return { status: "locked" };
        }
        if (result.error === "wrong_pin") {
          await whatsapp.sendText(message.from, `Incorrect PIN. Please try again. (${3 - (client.failed_pin_attempts + 1)} attempts remaining)`);
          return { status: "wrong_pin" };
        }
        await whatsapp.sendText(message.from, `✅ Verified! You are connected to ${client.name} (${client.wordpress_url}). Session active for 24 hours.\n\nWhat would you like to change?`);
        return { status: "authenticated" };
      }
      await whatsapp.sendText(message.from, "Welcome! Please enter your security PIN to get started.");
      return { status: "needs_auth" };
    }

    let userText = message.text ?? "";
    if (message.type === "audio") {
      const audioBuffer = await whatsapp.downloadMedia(message);
      userText = await transcribeAudio(audioBuffer);
    }
    if (!userText.trim()) {
      await whatsapp.sendText(message.from, "I didn't catch that. Could you try again?");
      return { status: "empty_message" };
    }

    // Load existing conversation or create new one
    // This will find conversations that are 'active' or 'waiting_for_approval'
    let conversation = await getActiveConversation(client.id);

    if (conversation) {
      logger.info("Continuing existing conversation", {
        id: conversation.id,
        status: conversation.status,
        messageCount: (conversation.claude_messages as any[])?.length ?? 0,
      });
    } else {
      conversation = await createConversation(client.id);
      logger.info("Created new conversation", { id: conversation.id });
    }

    const wp = new WordPressClient(client.wordpress_url, client.wp_api_key_encrypted, client.wp_api_secret_encrypted);

    const result = await runAgent({
      userMessage: userText,
      conversationId: conversation.id,
      priorMessages: (conversation.claude_messages ?? []) as any[],
      // Pass pending image URL so agent knows about previously generated image
      pendingImageUrl: conversation.pending_image_url ?? undefined,
      toolContext: { wp, whatsapp, clientPhone: message.from, clientId: client.id, conversationId: conversation.id },
      clientConfig: { name: client.name, siteUrl: client.wordpress_url, ...(client.system_prompt_config as Record<string, string>) },
    });

    return { status: result.status };
  },
});
