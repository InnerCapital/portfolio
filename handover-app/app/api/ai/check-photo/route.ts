import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const client = new Anthropic();

export async function POST(req: Request) {
  try {
    const { imageBase64, mediaType, slotLabel } = await req.json();

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
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
              text: `This photo should show: "${slotLabel}" for a commercial container kitchen inspection.

Check:
1. Is the subject clearly visible and identifiable?
2. Is the image in focus (not blurry)?
3. Is there adequate lighting to see detail?
4. Is the correct subject shown (not a finger, floor, sky, or unrelated object)?

Reply with exactly:
PASS
or
FAIL: [one sentence reason]

Nothing else.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : 'FAIL: Unable to check photo';
    const passed = text.startsWith('PASS');
    const reason = passed ? null : text.replace('FAIL: ', '');

    return NextResponse.json({ passed, reason });
  } catch (error) {
    console.error('check-photo error:', error);
    return NextResponse.json({ passed: true, reason: null, error: true });
  }
}
