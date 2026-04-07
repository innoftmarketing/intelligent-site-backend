import { generateImage } from "../../providers/image-generation.js";
import type { ToolDefinition } from "./index.js";

export const generateImageTool: ToolDefinition = {
  spec: {
    name: "generate_image",
    description:
      "Generate a new image using AI from a text description. The image will be uploaded to WordPress and a preview will be sent to the owner via WhatsApp automatically. After calling this tool, ask the owner for approval using send_whatsapp (text only, no image_url needed — the preview was already sent).",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed image description including style, colors, text, and mood",
        },
        width: { type: "number", description: "Width in pixels (default 1920)" },
        height: { type: "number", description: "Height in pixels (default 1080)" },
      },
      required: ["prompt"],
    },
  },
  execute: async (input, ctx) => {
    // Generate image via Gemini — returns base64 data URL
    const dataUrl = await generateImage({
      prompt: input.prompt as string,
      width: (input.width as number) ?? 1920,
      height: (input.height as number) ?? 1080,
    });

    // Upload to WordPress to get a permanent URL
    const timestamp = Date.now();
    const filename = `generated-${timestamp}.jpg`;
    const uploaded = await ctx.wp.uploadMedia(dataUrl, filename);

    // Send the image preview directly to the owner via WhatsApp
    await ctx.whatsapp.sendImage(
      ctx.clientPhone,
      uploaded.url,
      "Here's the generated image preview:"
    );

    return JSON.stringify({
      image_url: uploaded.url,
      media_id: uploaded.mediaId,
      preview_sent: true,
    });
  },
};
