import { NextRequest, NextResponse } from "next/server";
import { generatePlatformConfig, TEMPLATE_FLOWS, type Platform } from "@/lib/bot-engine";

export async function POST(request: NextRequest) {
  try {
    const { flowId, platform } = await request.json();
    const flow = TEMPLATE_FLOWS.find((f) => f.id === flowId);
    if (!flow) return NextResponse.json({ error: "Flow not found" }, { status: 404 });

    const config = generatePlatformConfig(flow, platform as Platform);
    const flowExport = JSON.stringify(flow, null, 2);

    return NextResponse.json({
      platformConfig: config,
      flowDefinition: flowExport,
      deploymentSteps: getDeploymentSteps(platform as Platform),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed" }, { status: 500 });
  }
}

function getDeploymentSteps(platform: Platform): string[] {
  const steps: Record<Platform, string[]> = {
    whatsapp: [
      "1. Create a Meta Business account and WhatsApp Business app",
      "2. Get your Phone Number ID and Access Token from the Meta dashboard",
      "3. Set the webhook URL to your-domain.com/api/webhooks/whatsapp",
      "4. Set the verify token in your environment variables",
      "5. Deploy to Vercel and verify the webhook",
    ],
    telegram: [
      "1. Create a bot via @BotFather on Telegram",
      "2. Copy the bot token",
      "3. Set webhook: POST https://api.telegram.org/bot{TOKEN}/setWebhook?url=your-domain.com/api/webhooks/telegram",
      "4. Deploy to Vercel",
    ],
    slack: [
      "1. Create a Slack app at api.slack.com/apps",
      "2. Enable Socket Mode or set Event Subscriptions URL",
      "3. Add Bot Token Scopes: chat:write, app_mentions:read, im:history",
      "4. Install the app to your workspace",
      "5. Deploy to Vercel with signing secret and bot token",
    ],
    web: [
      "1. Deploy to Vercel",
      "2. Embed the chat widget: <script src='your-domain.com/widget.js'></script>",
      "3. Initialize: ChatWidget.init({ flowId: 'your-flow-id' })",
    ],
  };
  return steps[platform];
}
