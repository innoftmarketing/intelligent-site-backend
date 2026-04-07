import { generateImage } from "../../providers/image-generation.js";
import type { ToolDefinition } from "./index.js";

export const generateImageTool: ToolDefinition = {
  spec: {
    name: "generate_image",
    description: "Generate a new image using AI from a text description. After generating, send a preview via send_whatsapp and wait for approval.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed image description including style, colors, text, and mood" },
        width: { type: "number", description: "Width in pixels (default 1920)" },
        height: { type: "number", description: "Height in pixels (default 1080)" },
      },
      required: ["prompt"],
    },
  },
  execute: async (input, _ctx) => {
    const url = await generateImage({ prompt: input.prompt as string, width: (input.width as number) ?? 1920, height: (input.height as number) ?? 1080 });
    return JSON.stringify({ image_url: url });
  },
};
