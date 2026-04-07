export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  formData.append("file", new Blob([new Uint8Array(audioBuffer)], { type: "audio/ogg" }), "voice.ogg");
  formData.append("model_id", "scribe_v2");

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
    body: formData,
  });

  if (!res.ok) throw new Error(`ElevenLabs transcription failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { text: string };
  return data.text;
}
