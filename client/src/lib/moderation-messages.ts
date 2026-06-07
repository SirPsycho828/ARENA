export const MODERATION_MESSAGES: Record<string, string> = {
  inappropriate_language: 'Submission rejected: contains inappropriate language',
  hate_speech: 'Submission rejected: contains hate speech',
  harassment: 'Submission rejected: contains harassment',
  sexual_content: 'Submission rejected: contains sexual content',
  violence: 'Submission rejected: contains violent content',
  self_harm: 'Submission rejected: references self-harm',
  personal_information: 'Submission rejected: contains personal information',
  extremist_content: 'Submission rejected: contains extremist content',
};

export function getModerationMessage(reason: string): string | null {
  return MODERATION_MESSAGES[reason] || null;
}
