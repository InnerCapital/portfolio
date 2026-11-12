import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const client = new Anthropic();

export async function POST(req: Request) {
  try {
    const { checkoutImageBase64, checkinImageBase64, mediaType, slotLabel } = await req.json();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are comparing two inspection photos of the same surface on a commercial container kitchen: "${slotLabel}". The first image is from DELIVERY. The second is from COLLECTION.`,
            },
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: checkoutImageBase64 },
            },
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: checkinImageBase64 },
            },
            {
              type: 'text',
              text: `Is there any new damage, significant dirt, missing items, or condition change visible in the collection photo that was not present at delivery?

Reply with exactly one of:
NO_CHANGE
or
CHANGE: [one or two sentences describing what is different]

Nothing else.`,
            },
          ],
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : 'NO_CHANGE';
    const hasChange = text.startsWith('CHANGE:');
    const description = hasChange ? text.replace('CHANGE: ', '') : null;

    return NextResponse.json({ hasChange, description });
  } catch (error) {
    console.error('compare-photos error:', error);
    return NextResponse.json({ hasChange: false, description: null, error: true });
  }
}
