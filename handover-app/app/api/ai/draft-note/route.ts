import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const client = new Anthropic();

export async function POST(req: Request) {
  try {
    const { imageBase64, mediaType, itemLabel } = await req.json();

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: `This is an inspection photo for a commercial kitchen container rental.
The checklist item flagged as having an issue is: "${itemLabel}".
Write one short factual sentence describing any visible issue, damage, or abnormality relevant to this item.
If nothing is clearly visible, write: "Issue noted by staff — see photo for reference."
Reply with only the sentence. No preamble.`,
            },
          ],
        },
      ],
    });

    const draft = response.content[0].type === 'text' ? response.content[0].text.trim() : 'Issue noted by staff — see photo for reference.';
    return NextResponse.json({ draft });
  } catch (error) {
    console.error('draft-note error:', error);
    return NextResponse.json({ draft: 'Issue noted by staff — see photo for reference.' });
  }
}
