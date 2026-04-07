import type { ToolDefinition } from "./index.js";

export const sendWhatsappTool: ToolDefinition = {
  spec: {
    name: "send_whatsapp",
    description: "Send a message to the business owner via WhatsApp. Can send text or image with caption.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text message or image caption" },
        image_url: { type: "string", description: "Optional image URL to send" },
      },
      required: ["text"],
    },
  },
  execute: async (input, ctx) => {
    if (input.image_url) {
      await ctx.whatsapp.sendImage(ctx.clientPhone, input.image_url as string, input.text as string);
    } else {
      await ctx.whatsapp.sendText(ctx.clientPhone, input.text as string);
    }
    return JSON.stringify({ sent: true });
  },
};
