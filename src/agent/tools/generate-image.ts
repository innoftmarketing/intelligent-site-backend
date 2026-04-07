import { generateImage } from "../../providers/image-generation.js";
import type { ToolDefinition } from "./index.js";

export const generateImageTool: ToolDefinition = {
  spec: {
    name: "generate_image",
    description:
      "Generate a new image using AI. The image is automatically resized to fit the target element, uploaded to WordPress, and a preview sent via WhatsApp. IMPORTANT: Always use the recommended_width and recommended_height from get_page_content.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed image description including style, colors, text, and mood.",
        },
        width: {
          type: "number",
          description: "Target width in pixels. Use recommended_width from the page element.",
        },
        height: {
          type: "number",
          description: "Target height in pixels. Use recommended_height from the page element.",
        },
      },
      required: ["prompt", "width", "height"],
    },
  },
  execute: async (input, ctx) => {
    const width = input.width as number;
    const height = input.height as number;
    const aspectRatio = width > height ? "wide landscape" : width < height ? "tall portrait" : "square";

    const enhancedPrompt = `${input.prompt as string}. The image should be in ${aspectRatio} orientation.`;

    // Generate image via Gemini
    const dataUrl = await generateImage({
      prompt: enhancedPrompt,
      width,
      height,
    });

    // Upload to WordPress WITH target dimensions — auto-resized to exact fit
    const timestamp = Date.now();
    const filename = `generated-${timestamp}.jpg`;
    const uploaded = await ctx.wp.uploadMedia(dataUrl, filename, width, height);

    // Send preview to owner
    await ctx.whatsapp.sendImage(
      ctx.clientPhone,
      uploaded.url,
      `Here's the generated image (${width}x${height}px):`
    );

    return JSON.stringify({
      image_url: uploaded.url,
      media_id: uploaded.mediaId,
      width,
      height,
      preview_sent: true,
    });
  },
};
