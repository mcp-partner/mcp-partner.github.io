import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionBar } from './components/ConnectionBar';
import { Sidebar } from './components/Sidebar';
import { RequestPanel } from './components/RequestPanel';
import { LogViewer } from './components/LogViewer';
import { IMcpClient, ProxyConfig } from './services/mcpClient';
import { SseMcpClient } from './services/sseMcpClient';
import { StreamableHttpMcpClient } from './services/streamableHttpMcpClient';
import { ConnectionStatus, LogEntry, McpTool, JsonRpcMessage, Language, Theme, TransportType } from './types';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Github } from 'lucide-react';

interface ToolState {
    argsJson: string;
    result: { status: 'success' | 'error', data: any } | null;
}

interface ConnectionContext {
    url: string;
    proxyConfig: ProxyConfig;
    headers: Record<string, string>;
    transport: TransportType;
}

// Helper to ensure Error objects are logged with their message and stack
const serializeError = (err: any) => {
    if (err instanceof Error) {
        return {
            message: err.message,
            name: err.name,
            stack: err.stack,
            cause: (err as any).cause
        };
    }
    return err;
};

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);
  
  // Store state (args + results) per tool name
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({});
  
  // Settings - Initialize from localStorage
  const [lang, setLang] = useState<Language>(() => {
      const saved = localStorage.getItem('mcp_language');
      return (saved === 'en' || saved === 'zh') ? saved : 'zh';
  });
  const [theme, setTheme] = useState<Theme>(() => {
      const saved = localStorage.getItem('mcp_theme');
      return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  // Client ref, initialized with default SSE but can be swapped
  const mcpClient = useRef<IMcpClient>(new SseMcpClient());
  const activeTransport = useRef<TransportType>('sse');
  
  // Store connection context to attach to logs
  const connectionContext = useRef<ConnectionContext | null>(null);

  // Apply Theme & Persist
  useEffect(() => {
    localStorage.setItem('mcp_theme', theme);
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Persist Language
  useEffect(() => {
    localStorage.setItem('mcp_language', lang);
  }, [lang]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const addLog = (entry: Omit<LogEntry, 'timestamp'>) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { ...entry, timestamp }]);
  };

  // Generic message handler for logging
  const messageHandler = useCallback((msg: JsonRpcMessage, meta?: any) => {
        let summary = 'Unknown Message';
        let direction: 'in' | 'out' = 'in';
        let type: 'request' | 'response' | 'notification' | 'info' = 'info';

        if ('method' in msg && !('id' in msg)) {
            type = 'notification';
            summary = `Notification: ${msg.method}`;
        } else if ('method' in msg && 'id' in msg) {
            type = 'request';
            direction = 'out';
            summary = `Request (${msg.id}): ${msg.method}`;
        } else if ('result' in msg || 'error' in msg) {
            type = 'response';
            const id = (msg as any).id;
            summary = `Response (${id}): ${'error' in msg ? 'Failed' : 'Success'}`;
        }

        addLog({
            type,
            direction,
            summary,
            details: msg,
            // Attach both specific message metadata (like response headers) AND global connection config
            meta: {
                ...connectionContext.current,
                ...meta
            }
        });
  }, []);

  const errorHandler = useCallback((err: string) => {
        addLog({ 
            type: 'error', 
            direction: 'local', 
            summary: err, 
            meta: connectionContext.current 
        });
        setStatus(ConnectionStatus.ERROR);
  }, []);

  // Set up listeners for the initial client
  useEffect(() => {
    const unsubMsg = mcpClient.current.onMessage(messageHandler);
    const unsubErr = mcpClient.current.onError(errorHandler);
    return () => { 
        unsubMsg();
        unsubErr();
        mcpClient.current.disconnect(); 
    };
  }, [messageHandler, errorHandler]);


  const handleConnect = async (url: string, proxyConfig: ProxyConfig, headers: Record<string, string>, transport: TransportType) => {
    // Save connection context for logging
    connectionContext.current = { url, proxyConfig, headers, transport };

    // 1. Check if we need to swap the client implementation
    if (activeTransport.current !== transport) {
        mcpClient.current.disconnect();
        if (transport === 'streamable_http') {
            mcpClient.current = new StreamableHttpMcpClient();
        } else {
            mcpClient.current = new SseMcpClient();
        }
        
        mcpClient.current.onMessage(messageHandler);
        mcpClient.current.onError(errorHandler);
        activeTransport.current = transport;
    }

    setStatus(ConnectionStatus.CONNECTING);
    addLog({ 
        type: 'info', 
        direction: 'local', 
        summary: `Connecting to ${url} via ${transport === 'streamable_http' ? 'Streamable HTTP' : 'SSE'}...`,
        details: { 
          ...(proxyConfig.enabled ? { proxy: proxyConfig.prefix } : {}),
          ...(Object.keys(headers).length > 0 ? { headers } : {})
        },
        meta: connectionContext.current
    });
    setTools([]);
    setToolStates({});
    
    try {
      await mcpClient.current.connect(url, proxyConfig, headers);
      setStatus(ConnectionStatus.CONNECTED);
      addLog({ 
          type: 'info', 
          direction: 'local', 
          summary: 'Connected.',
          meta: connectionContext.current
      });
      
      // SSE Client needs manual initialization flow, HTTP Client (SDK) handles it internally
      if (transport === 'sse') {
          addLog({ type: 'info', direction: 'local', summary: 'Sending initialize...', meta: connectionContext.current });
          const initResult = await mcpClient.current.sendRequest('initialize', {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: {
                  name: 'mcp-partner-web',
                  version: '1.0.0'
              }
          });
          addLog({ type: 'info', direction: 'in', summary: 'Initialized', details: initResult, meta: connectionContext.current });

          // Send initialized notification
          addLog({ type: 'info', direction: 'local', summary: 'Sending initialized notification...', meta: connectionContext.current });
          await mcpClient.current.sendNotification('notifications/initialized');
      }

      // Fetch Tools
      fetchTools();

    } catch (e: any) {
      if (e.message === 'Connection aborted') {
          addLog({ type: 'info', direction: 'local', summary: 'Connection cancelled', meta: connectionContext.current });
          return;
      }
      setStatus(ConnectionStatus.ERROR);
      addLog({ 
          type: 'error', 
          direction: 'local', 
          summary: 'Connection Failed', 
          details: serializeError(e), 
          meta: connectionContext.current 
      });
    }
  };

  const handleDisconnect = () => {
    mcpClient.current.disconnect();
    setStatus(ConnectionStatus.DISCONNECTED);
    setTools([]);
    setSelectedTool(null);
    setToolStates({});
    addLog({ type: 'info', direction: 'local', summary: 'Disconnected' });
    connectionContext.current = null;
  };

  const fetchTools = async () => {
    setLoadingTools(true);
    try {
        const res = await mcpClient.current.sendRequest('tools/list');
        const toolsList = res.tools || [];
        setTools(toolsList);
        addLog({ type: 'info', direction: 'in', summary: `Loaded ${toolsList.length} tools`, meta: connectionContext.current });
        
    } catch (e: any) {
        addLog({ 
            type: 'error', 
            direction: 'in', 
            summary: 'Failed to list tools', 
            details: serializeError(e), 
            meta: connectionContext.current 
        });
    } finally {
        setLoadingTools(false);
    }
  };

  const handleSelectTool = (tool: McpTool) => {
      setSelectedTool(tool);
  };

  const handleArgsChange = (argsJson: string) => {
      if (!selectedTool) return;
      setToolStates(prev => ({
          ...prev,
          [selectedTool.name]: {
              ...(prev[selectedTool.name] || { result: null }),
              argsJson
          }
      }));
  };

  const handleExecuteTool = async (args: any) => {
    if (!selectedTool) return;
    setIsExecuting(true);
    
    try {
        const result = await mcpClient.current.sendRequest('tools/call', {
            name: selectedTool.name,
            arguments: args
        });
        addLog({ type: 'response', direction: 'in', summary: `Tool Executed: ${selectedTool.name}`, details: result, meta: connectionContext.current });
        
        setToolStates(prev => ({
            ...prev,
            [selectedTool.name]: {
                argsJson: prev[selectedTool.name]?.argsJson || JSON.stringify(args, null, 2),
                result: { status: 'success', data: result }
            }
        }));
    } catch (e: any) {
        const serialized = serializeError(e);
        addLog({ 
            type: 'error', 
            direction: 'in', 
            summary: `Tool Execution Failed`, 
            details: serialized, 
            meta: connectionContext.current 
        });
        
        setToolStates(prev => ({
            ...prev,
            [selectedTool.name]: {
                 argsJson: prev[selectedTool.name]?.argsJson || JSON.stringify(args, null, 2),
                 result: { status: 'error', data: serialized }
            }
        }));
    } finally {
        setIsExecuting(false);
    }
  };

  const currentToolState = selectedTool ? toolStates[selectedTool.name] : null;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-200 font-sans transition-colors duration-200">
      <ConnectionBar 
        status={status} 
        onConnect={handleConnect} 
        onDisconnect={handleDisconnect}
        lang={lang}
        setLang={setLang}
        theme={theme}
        toggleTheme={toggleTheme}
      />
      
      <div className="flex-1 flex overflow-hidden">
        {/* We use PanelGroup for resizable split views */}
        <PanelGroup direction="horizontal">
            <Panel defaultSize={20} minSize={15} maxSize={30} className="flex flex-col">
                <Sidebar 
                    tools={tools} 
                    selectedTool={selectedTool} 
                    onSelectTool={handleSelectTool}
                    loading={loadingTools}
                    lang={lang}
                />
            </Panel>
            
            <PanelResizeHandle className="w-1 bg-gray-200 dark:bg-gray-800 hover:bg-blue-500 transition-colors" />
            
            <Panel>
                <PanelGroup direction="vertical">
                    <Panel defaultSize={60} minSize={30} className="flex flex-col">
                         <RequestPanel 
                            tool={selectedTool} 
                            onExecute={handleExecuteTool}
                            isExecuting={isExecuting}
                            lang={lang}
                            response={currentToolState?.result || null}
                            savedArgs={currentToolState?.argsJson || '{}'}
                            onArgsChange={handleArgsChange}
                         />
                    </Panel>
                    
                    <PanelResizeHandle className="h-1 bg-gray-200 dark:bg-gray-800 hover:bg-blue-500 transition-colors" />
                    
                    <Panel defaultSize={40} minSize={10} className="flex flex-col">
                        <LogViewer logs={logs} onClear={() => setLogs([])} lang={lang} />
                    </Panel>
                </PanelGroup>
            </Panel>
        </PanelGroup>
      </div>

      {/* Footer */}
      <footer className="h-7 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 text-[11px] text-gray-500 dark:text-gray-500 shrink-0 select-none shadow-[0_-1px_3px_rgba(0,0,0,0.02)] z-50">
          <div className="flex items-center gap-4">
            <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px] tracking-wide text-gray-600 dark:text-gray-400">
            v0.2.1-Online MCP Client
            </span>
            <span>
              Author: <a href="https://github.com/Ericwyn" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors">@Ericwyn</a>
            </span>
          </div>
          <a href="https://github.com/Ericwyn/mcp-partner" target="_blank" rel="noopener noreferrer" className="hover:text-gray-800 dark:hover:text-gray-300 transition-colors flex items-center gap-1.5 group">
             <Github className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
             <span>github.com/Ericwyn/mcp-partner</span>
          </a>
      </footer>
    </div>
  );
};

export default App;