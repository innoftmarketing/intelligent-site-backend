import { generateImage } from "../../providers/image-generation.js";
import type { ToolDefinition } from "./index.js";

export const generateImageTool: ToolDefinition = {
  spec: {
    name: "generate_image",
    description:
      "Generate a new image using AI from a text description. The image will be uploaded to WordPress and you'll get a URL back. After generating, send a preview via send_whatsapp and wait for approval.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Detailed image description including style, colors, text, and mood",
        },
        width: {
          type: "number",
          description: "Width in pixels (default 1920)",
        },
        height: {
          type: "number",
          description: "Height in pixels (default 1080)",
        },
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

    // Upload the base64 image to WordPress to get a real URL
    // First convert data URL to a temporary file URL by uploading to WP media
    const timestamp = Date.now();
    const filename = `generated-${timestamp}.jpg`;

    // Upload via WordPress plugin — it accepts base64 data URLs
    const uploaded = await ctx.wp.uploadMedia(dataUrl, filename);

    return JSON.stringify({
      image_url: uploaded.url,
      media_id: uploaded.mediaId,
    });
  },
};
