import { NextRequest, NextResponse } from "next/server";
import { runFlow, TEMPLATE_FLOWS, type ChatSession } from "@/lib/bot-engine";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { flowId, userInput, session } = body;

    const flow = TEMPLATE_FLOWS.find((f) => f.id === flowId);
    if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 });

    const chatSession: ChatSession = session || {
      flowId,
      currentNodeId: flow.startNodeId,
      variables: { ...flow.variables },
      history: [],
    };

    const result = runFlow(flow, chatSession, userInput);

    const updatedSession: ChatSession = {
      flowId,
      currentNodeId: result.currentNode,
      variables: result.variables,
      history: [
        ...chatSession.history,
        ...(userInput ? [{ role: "user" as const, content: userInput, timestamp: Date.now() }] : []),
        ...result.messages.map((m) => ({ role: "bot" as const, content: m, timestamp: Date.now() })),
      ],
    };

    return NextResponse.json({ ...result, session: updatedSession });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Chat failed" }, { status: 500 });
  }
}
