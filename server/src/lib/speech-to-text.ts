import { GoogleAuth } from 'google-auth-library';

let auth: GoogleAuth | null = null;
let projectId: string | null = null;

function getAuth(): GoogleAuth {
  if (auth) return auth;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set — cannot transcribe');

  const credentials = JSON.parse(raw);
  projectId = credentials.project_id;

  auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  return auth;
}

/**
 * Transcribe a webm/opus audio buffer using Google Cloud Speech-to-Text v2.
 * Returns the transcript text, or empty string on failure.
 */
export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  try {
    const authClient = getAuth();
    const client = await authClient.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;

    if (!accessToken || !projectId) {
      throw new Error('Failed to get access token or project ID');
    }

    const url = `https://speech.googleapis.com/v2/projects/${projectId}/locations/global/recognizers/_:recognize`;

    const body = {
      config: {
        autoDecodingConfig: {},
        languageCodes: ['en-US'],
        model: 'long',
      },
      content: audioBuffer.toString('base64'),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`  [STT] API error ${res.status}: ${errText.slice(0, 300)}`);
      return '';
    }

    const data = await res.json() as {
      results?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
    };

    const transcript = (data.results || [])
      .flatMap(r => r.alternatives || [])
      .map(a => a.transcript || '')
      .join(' ')
      .trim();

    console.log(`  [STT] Transcribed ${audioBuffer.length} bytes → "${transcript.slice(0, 100)}${transcript.length > 100 ? '...' : ''}"`);
    return transcript;
  } catch (err) {
    console.error('  [STT] Transcription failed:', (err as Error).message);
    return '';
  }
}
