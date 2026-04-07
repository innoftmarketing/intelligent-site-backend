import { env } from "../env.js";

interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  style?: string;
}

export async function generateImage(options: GenerateImageOptions): Promise<string> {
  const res = await fetch(`${env.NANOBANA_API_URL}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.NANOBANA_API_KEY}`,
    },
    body: JSON.stringify({
      prompt: options.prompt,
      width: options.width ?? 1920,
      height: options.height ?? 1080,
      style: options.style ?? "professional",
    }),
  });

  if (!res.ok) throw new Error(`Nano Banana Pro failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { image_url: string };
  return data.image_url;
}
