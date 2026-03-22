// Bot conversation engine — processes flows and generates responses
// This is the core runtime that powers bots across all platforms

export interface BotNode {
  id: string;
  type: "message" | "question" | "condition" | "api_call" | "assign" | "delay" | "end";
  data: Record<string, unknown>;
  next?: string;
  branches?: { condition: string; target: string }[];
}

export interface BotFlow {
  id: string;
  name: string;
  description: string;
  nodes: BotNode[];
  variables: Record<string, string>;
  platforms: Platform[];
  startNodeId: string;
}

export type Platform = "whatsapp" | "telegram" | "slack" | "web";

export interface ChatSession {
  flowId: string;
  currentNodeId: string;
  variables: Record<string, string>;
  history: Array<{ role: "bot" | "user"; content: string; timestamp: number }>;
}

export interface BotResponse {
  messages: string[];
  quickReplies?: string[];
  waitingForInput: boolean;
  sessionEnded: boolean;
  currentNode: string;
  variables: Record<string, string>;
}

function evaluateCondition(condition: string, variables: Record<string, string>): boolean {
  // Simple condition evaluator: supports {var} == "value", {var} != "value", {var} contains "value"
  const replaced = condition.replace(/\{(\w+)\}/g, (_, key) => variables[key] || "");

  if (replaced.includes(" == ")) {
    const [left, right] = replaced.split(" == ").map((s) => s.trim().replace(/"/g, ""));
    return left === right;
  }
  if (replaced.includes(" != ")) {
    const [left, right] = replaced.split(" != ").map((s) => s.trim().replace(/"/g, ""));
    return left !== right;
  }
  if (replaced.includes(" contains ")) {
    const [left, right] = replaced.split(" contains ").map((s) => s.trim().replace(/"/g, ""));
    return left.toLowerCase().includes(right.toLowerCase());
  }
  if (replaced.includes(" > ")) {
    const [left, right] = replaced.split(" > ").map((s) => s.trim().replace(/"/g, ""));
    return parseFloat(left) > parseFloat(right);
  }
  return !!replaced;
}

function interpolate(text: string, variables: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) => variables[key] || `{${key}}`);
}

export function processNode(node: BotNode, session: ChatSession, userInput?: string): BotResponse {
  const vars = { ...session.variables };
  const messages: string[] = [];
  let quickReplies: string[] | undefined;
  let waitingForInput = false;
  let sessionEnded = false;
  let nextNodeId = node.next || "";

  switch (node.type) {
    case "message":
      messages.push(interpolate(String(node.data.text || ""), vars));
      break;

    case "question":
      if (userInput !== undefined) {
        // User answered — store the answer
        const varName = String(node.data.variable || "answer");
        vars[varName] = userInput;
        // Move to next node
      } else {
        // Ask the question
        messages.push(interpolate(String(node.data.text || ""), vars));
        quickReplies = (node.data.options as string[]) || undefined;
        waitingForInput = true;
        nextNodeId = node.id; // Stay on this node
      }
      break;

    case "condition":
      if (node.branches) {
        for (const branch of node.branches) {
          if (evaluateCondition(branch.condition, vars)) {
            nextNodeId = branch.target;
            break;
          }
        }
        // If no branch matched, use default next
        if (nextNodeId === node.next) {
          const defaultBranch = node.branches.find((b) => b.condition === "default");
          if (defaultBranch) nextNodeId = defaultBranch.target;
        }
      }
      break;

    case "assign":
      const key = String(node.data.variable || "");
      const value = interpolate(String(node.data.value || ""), vars);
      if (key) vars[key] = value;
      break;

    case "api_call":
      // In a real implementation, this would make an HTTP request
      messages.push(`[API Call: ${node.data.method || "GET"} ${node.data.url || ""}]`);
      vars["api_response"] = JSON.stringify({ status: "ok", data: "simulated" });
      break;

    case "delay":
      messages.push(`[Wait ${node.data.seconds || 1}s]`);
      break;

    case "end":
      messages.push(interpolate(String(node.data.text || "Goodbye!"), vars));
      sessionEnded = true;
      break;
  }

  return { messages, quickReplies, waitingForInput, sessionEnded, currentNode: nextNodeId, variables: vars };
}

export function runFlow(flow: BotFlow, session: ChatSession, userInput?: string): BotResponse {
  const allMessages: string[] = [];
  let currentVars = { ...session.variables };
  let currentNodeId = session.currentNodeId;
  let finalQuickReplies: string[] | undefined;
  let waitingForInput = false;
  let sessionEnded = false;
  let iterations = 0;
  const MAX_ITERATIONS = 20; // prevent infinite loops

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const node = flow.nodes.find((n) => n.id === currentNodeId);
    if (!node) { sessionEnded = true; break; }

    const result = processNode(node, { ...session, variables: currentVars, currentNodeId }, userInput);
    allMessages.push(...result.messages);
    currentVars = result.variables;

    if (result.waitingForInput) {
      finalQuickReplies = result.quickReplies;
      waitingForInput = true;
      currentNodeId = node.id;
      break;
    }

    if (result.sessionEnded) {
      sessionEnded = true;
      break;
    }

    // After processing a question with user input, clear it for subsequent nodes
    userInput = undefined;
    currentNodeId = result.currentNode;

    if (!currentNodeId) { sessionEnded = true; break; }
  }

  return {
    messages: allMessages,
    quickReplies: finalQuickReplies,
    waitingForInput,
    sessionEnded,
    currentNode: currentNodeId,
    variables: currentVars,
  };
}

export function generatePlatformConfig(flow: BotFlow, platform: Platform): string {
  if (platform === "whatsapp") {
    return JSON.stringify({
      platform: "whatsapp",
      webhook_url: "/api/webhooks/whatsapp",
      verify_token: "${WHATSAPP_VERIFY_TOKEN}",
      phone_number_id: "${WHATSAPP_PHONE_ID}",
      access_token: "${WHATSAPP_ACCESS_TOKEN}",
      flow_id: flow.id,
    }, null, 2);
  }
  if (platform === "telegram") {
    return JSON.stringify({
      platform: "telegram",
      webhook_url: "/api/webhooks/telegram",
      bot_token: "${TELEGRAM_BOT_TOKEN}",
      flow_id: flow.id,
    }, null, 2);
  }
  if (platform === "slack") {
    return JSON.stringify({
      platform: "slack",
      webhook_url: "/api/webhooks/slack",
      signing_secret: "${SLACK_SIGNING_SECRET}",
      bot_token: "${SLACK_BOT_TOKEN}",
      app_token: "${SLACK_APP_TOKEN}",
      flow_id: flow.id,
    }, null, 2);
  }
  return JSON.stringify({
    platform: "web",
    widget_url: "/chat",
    flow_id: flow.id,
    theme: { primaryColor: "#000", position: "bottom-right" },
  }, null, 2);
}

export const TEMPLATE_FLOWS: BotFlow[] = [
  {
    id: "customer-support",
    name: "Customer Support Bot",
    description: "Greets user, collects issue type, routes to appropriate response",
    platforms: ["web", "whatsapp", "telegram"],
    variables: { name: "", issue_type: "" },
    startNodeId: "greet",
    nodes: [
      { id: "greet", type: "message", data: { text: "Hello! Welcome to support. How can I help you today?" }, next: "ask_name" },
      { id: "ask_name", type: "question", data: { text: "What's your name?", variable: "name" }, next: "ask_issue" },
      { id: "ask_issue", type: "question", data: { text: "Hi {name}! What type of issue are you experiencing?", variable: "issue_type", options: ["Billing", "Technical", "General"] }, next: "route" },
      { id: "route", type: "condition", data: {}, branches: [
        { condition: '{issue_type} == "Billing"', target: "billing" },
        { condition: '{issue_type} == "Technical"', target: "technical" },
        { condition: "default", target: "general" },
      ] },
      { id: "billing", type: "message", data: { text: "I'll connect you with our billing team. They'll review your account, {name}." }, next: "end" },
      { id: "technical", type: "message", data: { text: "Let me check our knowledge base for your technical issue, {name}." }, next: "end" },
      { id: "general", type: "message", data: { text: "I'd be happy to help with your general inquiry, {name}." }, next: "end" },
      { id: "end", type: "end", data: { text: "Thank you for contacting support, {name}! Is there anything else?" } },
    ],
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification Bot",
    description: "Qualifies leads by collecting company info, budget, and timeline",
    platforms: ["web", "slack"],
    variables: { company: "", budget: "", timeline: "", score: "0" },
    startNodeId: "intro",
    nodes: [
      { id: "intro", type: "message", data: { text: "Hi there! I'd love to learn more about your needs." }, next: "ask_company" },
      { id: "ask_company", type: "question", data: { text: "What company are you from?", variable: "company" }, next: "ask_budget" },
      { id: "ask_budget", type: "question", data: { text: "What's your approximate budget range?", variable: "budget", options: ["Under $5k", "$5k-$25k", "$25k-$100k", "Over $100k"] }, next: "ask_timeline" },
      { id: "ask_timeline", type: "question", data: { text: "When do you need this delivered?", variable: "timeline", options: ["ASAP", "1-3 months", "3-6 months", "Just exploring"] }, next: "qualify" },
      { id: "qualify", type: "condition", data: {}, branches: [
        { condition: '{budget} == "Over $100k"', target: "hot" },
        { condition: '{budget} == "$25k-$100k"', target: "warm" },
        { condition: "default", target: "cool" },
      ] },
      { id: "hot", type: "message", data: { text: "Excellent! {company} sounds like a great fit. Our enterprise team will reach out within 24 hours." }, next: "end" },
      { id: "warm", type: "message", data: { text: "Great, {company}! I'll schedule a call with our solutions team." }, next: "end" },
      { id: "cool", type: "message", data: { text: "Thanks for your interest, {company}! I'll send you some resources to get started." }, next: "end" },
      { id: "end", type: "end", data: { text: "Thanks for chatting! We'll be in touch soon." } },
    ],
  },
  {
    id: "order-tracker",
    name: "Order Tracking Bot",
    description: "Looks up order status by order number",
    platforms: ["web", "whatsapp"],
    variables: { order_id: "" },
    startNodeId: "start",
    nodes: [
      { id: "start", type: "message", data: { text: "Welcome to order tracking!" }, next: "ask_order" },
      { id: "ask_order", type: "question", data: { text: "Please enter your order number:", variable: "order_id" }, next: "lookup" },
      { id: "lookup", type: "api_call", data: { method: "GET", url: "/api/orders/{order_id}" }, next: "result" },
      { id: "result", type: "message", data: { text: "Order {order_id}: Your order is being processed and will ship within 2 business days." }, next: "end" },
      { id: "end", type: "end", data: { text: "Need anything else? Start a new conversation anytime!" } },
    ],
  },
];
