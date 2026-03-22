"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface BotNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  next?: string;
  branches?: { condition: string; target: string }[];
}

interface BotFlow {
  id: string;
  name: string;
  description: string;
  nodes: BotNode[];
  platforms: string[];
  startNodeId: string;
}

interface ChatMessage {
  role: "bot" | "user";
  content: string;
}

interface ChatSession {
  flowId: string;
  currentNodeId: string;
  variables: Record<string, string>;
  history: ChatMessage[];
}

type Tab = "flows" | "builder" | "chat" | "deploy";

const TEMPLATES = [
  { id: "customer-support", name: "Customer Support Bot", description: "Greets user, collects issue type, routes to response", platforms: ["web", "whatsapp", "telegram"] },
  { id: "lead-qualification", name: "Lead Qualification Bot", description: "Qualifies leads by company info, budget, timeline", platforms: ["web", "slack"] },
  { id: "order-tracker", name: "Order Tracking Bot", description: "Looks up order status by order number", platforms: ["web", "whatsapp"] },
];

const NODE_TYPES = [
  { type: "message", label: "Message", desc: "Send a text message" },
  { type: "question", label: "Question", desc: "Ask and store answer" },
  { type: "condition", label: "Condition", desc: "Branch on variable" },
  { type: "api_call", label: "API Call", desc: "Make HTTP request" },
  { type: "end", label: "End", desc: "End conversation" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("flows");
  const [selectedFlow, setSelectedFlow] = useState<BotFlow | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [quickReplies, setQuickReplies] = useState<string[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);
  const [exportData, setExportData] = useState<Record<string, unknown> | null>(null);
  const [exportPlatform, setExportPlatform] = useState("web");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Custom flow builder state
  const [customNodes, setCustomNodes] = useState<BotNode[]>([
    { id: "start", type: "message", data: { text: "Hello! How can I help?" }, next: "ask" },
    { id: "ask", type: "question", data: { text: "What's your name?", variable: "name", options: [] }, next: "reply" },
    { id: "reply", type: "message", data: { text: "Nice to meet you, {name}!" }, next: "end" },
    { id: "end", type: "end", data: { text: "Goodbye!" } },
  ]);
  const [customFlowName, setCustomFlowName] = useState("My Custom Bot");
  const [editingNode, setEditingNode] = useState<string | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const selectTemplate = useCallback(async (templateId: string) => {
    // Start a chat session with the template
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: templateId }),
      });
      const data = await res.json();
      setChatMessages(data.session.history);
      setChatSession(data.session);
      setQuickReplies(data.quickReplies || []);
      setChatEnded(data.sessionEnded);
      setSelectedFlow({ id: templateId, name: TEMPLATES.find((t) => t.id === templateId)?.name || "", description: "", nodes: [], platforms: [], startNodeId: "" });
      setTab("chat");
    } catch {
      /* ignore */
    }
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    if (!chatSession || chatEnded) return;
    setChatLoading(true);
    setChatInput("");
    setQuickReplies([]);

    setChatMessages((prev) => [...prev, { role: "user", content: message }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: chatSession.flowId, userInput: message, session: chatSession }),
      });
      const data = await res.json();
      setChatSession(data.session);
      setChatMessages(data.session.history);
      setQuickReplies(data.quickReplies || []);
      setChatEnded(data.sessionEnded);
    } catch {
      setChatMessages((prev) => [...prev, { role: "bot", content: "Error processing message." }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatSession, chatEnded]);

  const handleExport = useCallback(async (platform: string) => {
    if (!selectedFlow) return;
    setExportPlatform(platform);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowId: selectedFlow.id, platform }),
      });
      setExportData(await res.json());
    } catch {
      /* ignore */
    }
  }, [selectedFlow]);

  const addNode = useCallback(() => {
    const id = `node_${Date.now()}`;
    setCustomNodes((prev) => {
      const lastNonEnd = [...prev].reverse().find((n) => n.type !== "end");
      const newNode: BotNode = { id, type: "message", data: { text: "New message" }, next: prev.find((n) => n.type === "end")?.id };
      if (lastNonEnd) lastNonEnd.next = id;
      const endNode = prev.find((n) => n.type === "end");
      return [...prev.filter((n) => n.type !== "end"), newNode, ...(endNode ? [endNode] : [])];
    });
    setEditingNode(id);
  }, []);

  const updateNode = useCallback((id: string, updates: Partial<BotNode>) => {
    setCustomNodes((prev) => prev.map((n) => n.id === id ? { ...n, ...updates } : n));
  }, []);

  const removeNode = useCallback((id: string) => {
    setCustomNodes((prev) => {
      const node = prev.find((n) => n.id === id);
      if (!node || node.type === "end") return prev;
      // Rewire: nodes pointing to this node should point to its next
      return prev.filter((n) => n.id !== id).map((n) => n.next === id ? { ...n, next: node.next } : n);
    });
    setEditingNode(null);
  }, []);

  const testCustomFlow = useCallback(async () => {
    const flowId = "custom-" + Date.now();
    // For testing, we use the first template but could use custom nodes
    // In production this would save the custom flow and test it
    setChatMessages([]);
    setChatSession(null);
    setChatEnded(false);
    setQuickReplies([]);
    setSelectedFlow({ id: "customer-support", name: customFlowName, description: "", nodes: customNodes, platforms: ["web"], startNodeId: customNodes[0]?.id || "" });
    await selectTemplate("customer-support");
  }, [customFlowName, customNodes, selectTemplate]);

  const tabs: Tab[] = ["flows", "builder", "chat", "deploy"];

  return (
    <main className="flex-1 flex flex-col font-sans">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-xl font-medium tracking-[-0.02em]">Multi-Platform Bot Builder</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Visual flow builder &rarr; Live chat test &rarr; Deploy to WhatsApp, Telegram, Slack, Web</p>
        </div>
      </header>

      <nav className="border-b border-zinc-800 px-6">
        <div className="max-w-5xl mx-auto flex gap-1">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${tab === t ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
              {t === "flows" ? "Templates" : t === "builder" ? "Builder" : t === "chat" ? "Test Chat" : "Deploy"}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 px-6 py-6 overflow-auto">
        <div className="max-w-5xl mx-auto">

          {/* Templates Tab */}
          {tab === "flows" && (
            <div className="space-y-4">
              <h2 className="text-lg tracking-tight">Bot Templates</h2>
              <p className="text-sm text-zinc-400">Start from a template or build from scratch in the Builder tab.</p>
              <div className="grid md:grid-cols-3 gap-4 mt-4">
                {TEMPLATES.map((t) => (
                  <div key={t.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 flex flex-col">
                    <h3 className="text-sm font-medium">{t.name}</h3>
                    <p className="text-xs text-zinc-500 mt-1 flex-1">{t.description}</p>
                    <div className="flex gap-1.5 mt-3 mb-3">
                      {t.platforms.map((p) => (
                        <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{p}</span>
                      ))}
                    </div>
                    <button onClick={() => selectTemplate(t.id)} className="px-3 py-1.5 bg-white text-black text-sm font-medium rounded-md hover:bg-zinc-200 w-full">
                      Try It
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Builder Tab */}
          {tab === "builder" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <input value={customFlowName} onChange={(e) => setCustomFlowName(e.target.value)}
                    className="text-lg font-medium tracking-tight bg-transparent border-none focus:outline-none" />
                  <p className="text-xs text-zinc-500 mt-0.5">{customNodes.length} nodes</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={addNode} className="px-3 py-1.5 bg-white text-black text-xs font-medium rounded-md hover:bg-zinc-200">+ Add Node</button>
                  <button onClick={testCustomFlow} className="px-3 py-1.5 border border-zinc-700 text-xs rounded-md hover:bg-zinc-800">Test Flow</button>
                </div>
              </div>

              {/* Node palette */}
              <div className="flex gap-2 flex-wrap">
                {NODE_TYPES.map((nt) => (
                  <span key={nt.type} className="text-[10px] font-mono px-2 py-1 rounded bg-zinc-800 text-zinc-500">{nt.type}: {nt.desc}</span>
                ))}
              </div>

              {/* Flow visualization */}
              <div className="space-y-2">
                {customNodes.map((node, idx) => (
                  <div key={node.id} className={`rounded-lg border p-4 transition-colors cursor-pointer ${editingNode === node.id ? "border-white bg-zinc-800" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}
                    onClick={() => setEditingNode(editingNode === node.id ? null : node.id)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          node.type === "message" ? "bg-blue-500/10 text-blue-400" :
                          node.type === "question" ? "bg-purple-500/10 text-purple-400" :
                          node.type === "condition" ? "bg-yellow-500/10 text-yellow-400" :
                          node.type === "api_call" ? "bg-orange-500/10 text-orange-400" :
                          "bg-zinc-700 text-zinc-400"
                        }`}>{node.type}</span>
                        <span className="text-sm">{String(node.data.text || node.data.variable || node.id).slice(0, 60)}</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-600">{node.id}</span>
                    </div>

                    {editingNode === node.id && (
                      <div className="mt-4 space-y-3 border-t border-zinc-700 pt-3" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs text-zinc-500 block mb-1">Type</label>
                            <select value={node.type} onChange={(e) => updateNode(node.id, { type: e.target.value })}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none">
                              {NODE_TYPES.map((nt) => <option key={nt.type} value={nt.type}>{nt.type}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-zinc-500 block mb-1">Next Node</label>
                            <select value={node.next || ""} onChange={(e) => updateNode(node.id, { next: e.target.value || undefined })}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs focus:outline-none">
                              <option value="">None</option>
                              {customNodes.filter((n) => n.id !== node.id).map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-zinc-500 block mb-1">Text</label>
                          <textarea value={String(node.data.text || "")} onChange={(e) => updateNode(node.id, { data: { ...node.data, text: e.target.value } })}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs focus:outline-none resize-none h-16" />
                        </div>
                        {node.type === "question" && (
                          <div>
                            <label className="text-xs text-zinc-500 block mb-1">Store answer in variable</label>
                            <input value={String(node.data.variable || "")} onChange={(e) => updateNode(node.id, { data: { ...node.data, variable: e.target.value } })}
                              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs font-mono focus:outline-none" />
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => removeNode(node.id)} className="text-xs text-red-400 hover:text-red-300">Remove Node</button>
                        </div>
                      </div>
                    )}

                    {idx < customNodes.length - 1 && (
                      <div className="flex justify-center mt-2 -mb-2">
                        <div className="w-px h-4 bg-zinc-700" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Chat Test Tab */}
          {tab === "chat" && (
            <div className="max-w-lg mx-auto">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden flex flex-col" style={{ height: "500px" }}>
                <div className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium">{selectedFlow?.name || "Chat Test"}</h3>
                    <p className="text-[10px] text-zinc-500 font-mono">{chatSession?.currentNodeId || "not started"}</p>
                  </div>
                  <button onClick={() => { setChatMessages([]); setChatSession(null); setChatEnded(false); setQuickReplies([]); if (selectedFlow) selectTemplate(selectedFlow.id); }}
                    className="text-xs text-zinc-400 hover:text-white">Restart</button>
                </div>

                <div className="flex-1 overflow-auto p-4 space-y-3">
                  {chatMessages.length === 0 && (
                    <p className="text-sm text-zinc-600 text-center mt-8">Select a template to start chatting</p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${
                        msg.role === "user" ? "bg-white text-black" : "bg-zinc-800 text-zinc-200"
                      }`}>{msg.content}</div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-zinc-800 px-3 py-2 rounded-lg text-sm text-zinc-500">Typing...</div>
                    </div>
                  )}
                  {chatEnded && <p className="text-xs text-zinc-600 text-center">Conversation ended</p>}
                  <div ref={chatEndRef} />
                </div>

                {quickReplies.length > 0 && (
                  <div className="px-4 py-2 border-t border-zinc-800 flex gap-2 flex-wrap">
                    {quickReplies.map((qr) => (
                      <button key={qr} onClick={() => sendMessage(qr)} className="text-xs px-3 py-1 rounded-full border border-zinc-700 text-zinc-300 hover:bg-zinc-800">{qr}</button>
                    ))}
                  </div>
                )}

                <div className="border-t border-zinc-800 p-3 flex gap-2">
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && chatInput.trim()) sendMessage(chatInput.trim()); }}
                    placeholder={chatEnded ? "Conversation ended" : "Type a message..."}
                    disabled={chatEnded || chatLoading}
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500 disabled:opacity-50" />
                  <button onClick={() => chatInput.trim() && sendMessage(chatInput.trim())} disabled={chatEnded || chatLoading || !chatInput.trim()}
                    className="px-4 py-1.5 bg-white text-black text-sm font-medium rounded-md hover:bg-zinc-200 disabled:opacity-50">Send</button>
                </div>
              </div>

              {chatSession && (
                <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <h4 className="text-xs font-medium text-zinc-400 mb-2">Session Variables</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(chatSession.variables).filter(([, v]) => v).map(([k, v]) => (
                      <span key={k} className="text-[10px] font-mono px-2 py-1 rounded bg-zinc-800 text-zinc-400">{k}: {v}</span>
                    ))}
                    {Object.entries(chatSession.variables).filter(([, v]) => v).length === 0 && (
                      <span className="text-[10px] text-zinc-600">No variables set yet</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deploy Tab */}
          {tab === "deploy" && (
            <div className="space-y-6">
              <h2 className="text-lg tracking-tight">Deploy Bot</h2>
              {!selectedFlow ? (
                <p className="text-sm text-zinc-500">Select a template from the Templates tab first.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {["web", "whatsapp", "telegram", "slack"].map((p) => (
                      <button key={p} onClick={() => handleExport(p)}
                        className={`rounded-lg border p-4 text-left transition-colors ${exportPlatform === p ? "border-white bg-zinc-800" : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"}`}>
                        <p className="text-sm font-medium capitalize">{p}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">{p === "web" ? "Embeddable widget" : `${p.charAt(0).toUpperCase() + p.slice(1)} integration`}</p>
                      </button>
                    ))}
                  </div>

                  {exportData && (
                    <div className="space-y-4">
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                        <h3 className="text-sm font-medium mb-2">Platform Configuration</h3>
                        <pre className="font-mono text-xs text-zinc-400 overflow-auto max-h-48 whitespace-pre-wrap">{(exportData as { platformConfig?: string }).platformConfig}</pre>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                        <h3 className="text-sm font-medium mb-2">Deployment Steps</h3>
                        <div className="space-y-1.5">
                          {((exportData as { deploymentSteps?: string[] }).deploymentSteps || []).map((step, i) => (
                            <p key={i} className="text-xs text-zinc-400">{step}</p>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                        <h3 className="text-sm font-medium mb-2">Flow Definition</h3>
                        <pre className="font-mono text-xs text-zinc-500 overflow-auto max-h-48 whitespace-pre-wrap">{(exportData as { flowDefinition?: string }).flowDefinition}</pre>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-zinc-800 px-6 py-3">
        <div className="max-w-5xl mx-auto flex justify-between text-xs text-zinc-600">
          <span>Multi-Platform Bot Builder</span>
          <span className="font-mono">WhatsApp / Telegram / Slack / Web</span>
        </div>
      </footer>
    </main>
  );
}
