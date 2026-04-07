import type { ToolDefinition } from "./index.js";

export const uploadMediaTool: ToolDefinition = {
  spec: {
    name: "upload_media",
    description: "Upload an image to the WordPress media library. Returns media ID and URL.",
    input_schema: {
      type: "object",
      properties: {
        image_url: { type: "string", description: "URL of the image to upload" },
        filename: { type: "string", description: "Filename for the image" },
      },
      required: ["image_url", "filename"],
    },
  },
  execute: async (input, ctx) => {
    const result = await ctx.wp.uploadMedia(input.image_url as string, input.filename as string);
    return JSON.stringify(result);
  },
};
