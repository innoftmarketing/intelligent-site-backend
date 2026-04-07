interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
}

export async function generateImage(options: GenerateImageOptions): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Generate an image: ${options.prompt}. Dimensions: ${options.width ?? 1920}x${options.height ?? 1080}px.`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini image generation failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as any;
  const candidates = data.candidates ?? [];
  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData) {
        const mimeType = part.inlineData.mimeType ?? "image/png";
        return `data:${mimeType};base64,${part.inlineData.data}`;
      }
    }
  }

  throw new Error("Gemini did not return an image");
}
