import { generateImage } from "../../providers/image-generation.js";
import type { ToolDefinition } from "./index.js";

export const generateImageTool: ToolDefinition = {
  spec: {
    name: "generate_image",
    description:
      "Generate a new image using AI. The image will be uploaded to WordPress and a preview sent to the owner via WhatsApp automatically. IMPORTANT: Always use the recommended_width and recommended_height from get_page_content to match the target element's dimensions. For hero banners use 1920x1080, for thumbnails use 400x400.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Detailed image description including style, colors, text, and mood. IMPORTANT: Always specify the exact aspect ratio and orientation in the prompt (e.g. 'wide landscape banner 16:9 ratio' or 'square product photo').",
        },
        width: {
          type: "number",
          description:
            "Width in pixels. MUST match the target element's recommended_width. Hero banners: 1920, product images: 800.",
        },
        height: {
          type: "number",
          description:
            "Height in pixels. MUST match the target element's recommended_height. Hero banners: 1080, product images: 600.",
        },
      },
      required: ["prompt", "width", "height"],
    },
  },
  execute: async (input, ctx) => {
    const width = input.width as number;
    const height = input.height as number;
    const aspectRatio = width > height ? "landscape" : width < height ? "portrait" : "square";
    const ratio = `${Math.round((width / height) * 100) / 100}:1`;

    // Enhance prompt with explicit dimension and aspect ratio instructions
    const enhancedPrompt = `${input.prompt as string}. CRITICAL: The image MUST be in ${aspectRatio} orientation with exact aspect ratio ${ratio} (${width}x${height} pixels). Do NOT generate a square image if landscape is requested.`;

    const dataUrl = await generateImage({
      prompt: enhancedPrompt,
      width,
      height,
    });

    const timestamp = Date.now();
    const filename = `generated-${timestamp}.jpg`;
    const uploaded = await ctx.wp.uploadMedia(dataUrl, filename);

    await ctx.whatsapp.sendImage(
      ctx.clientPhone,
      uploaded.url,
      `Here's the generated image preview (${width}x${height}px):`
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
