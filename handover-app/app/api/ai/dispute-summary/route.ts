import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

const client = new Anthropic();

export async function POST(req: Request) {
  try {
    const { checkout, checkin } = await req.json();

    const checkoutIssues = Object.entries(checkout.checklist || {})
      .filter(([, v]) => (v as { status: string }).status === 'issue')
      .map(([k, v]) => `${k}: ${(v as { notes?: string }).notes || 'No notes'}`)
      .join('\n') || 'None recorded';

    const checkinIssues = Object.entries(checkin.checklist || {})
      .filter(([, v]) => (v as { status: string }).status === 'issue')
      .map(([k, v]) => `${k}: ${(v as { notes?: string }).notes || 'No notes'}`)
      .join('\n') || 'None recorded';

    const aiChanges = ((checkin.ai_comparisons || []) as Array<{ has_change: boolean; label: string; description: string }>)
      .filter((c) => c.has_change)
      .map((c) => `${c.label}: ${c.description}`)
      .join('\n') || 'None detected';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: `You are writing a factual condition comparison report for a commercial kitchen container rental dispute.

DELIVERY RECORD:
Date: ${checkout.delivery_date}
Staff notes: ${checkout.general_notes || 'None'}
Issues noted at delivery:
${checkoutIssues}

COLLECTION RECORD:
Date: ${checkin.delivery_date}
Staff notes: ${checkin.general_notes || 'None'}
Issues noted at collection:
${checkinIssues}

AI-detected changes between delivery and collection photos:
${aiChanges}

Write a clear, factual summary covering:
1. Condition of the unit at delivery
2. Condition of the unit at collection
3. Any differences or new damage identified
4. A brief conclusion on whether damage occurred during the rental period

Use neutral, professional language suitable for an insurance claim or customer dispute.
Do not speculate. Only state what is recorded.`,
        },
      ],
    });

    const summary = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return NextResponse.json({ summary });
  } catch (error) {
    console.error('dispute-summary error:', error);
    return NextResponse.json({ summary: '', error: true });
  }
}
