import { NextResponse, type NextRequest } from 'next/server';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

/**
 * POST /api/copilot
 *
 * Streaming backend for the terminal shell's Right Pane (`RightSidebar`).
 * Requires an authenticated session — the Co-Pilot never answers for an
 * anonymous request even though this route sits outside `middleware.ts`'s
 * app-segment matcher.
 *
 * The client (`DefaultChatTransport` + `prepareSendMessagesRequest`) posts
 * `{ messages, context }`, where `messages` is the AI SDK's UI-message
 * shape (`{ role, parts }`) and `context` is whatever `useTerminalStore`
 * currently holds. `messages` is converted to model messages before being
 * handed to `streamText` — `streamText` only accepts `ModelMessage[]`, not
 * the UI-message shape the client sends.
 *
 * NOTE: `result.toDataStreamResponse()` doesn't exist on the installed
 * `ai@7` — it was renamed `toUIMessageStreamResponse()`. That's also the
 * protocol `DefaultChatTransport` expects on the client, so this is the
 * correct call, not just a rename shim.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { messages, context } = (await request.json()) as {
    messages: UIMessage[];
    context?: string;
  };

  const systemPrompt = `You are an enterprise financial co-pilot for Shtiya Builder. The user is currently viewing: ${context || 'the dashboard'}. Help them understand their data and take action.`;

  const result = streamText({
    model: google('gemini-3.6-flash'),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
