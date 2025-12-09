
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionBar, ConnectionBarRef } from './components/ConnectionBar';
import { Sidebar } from './components/Sidebar';
import { RequestPanel } from './components/RequestPanel';
import { LogViewer } from './components/LogViewer';
import { IMcpClient, ProxyConfig } from './services/mcpClient';
import { SseMcpClient } from './services/sseMcpClient';
import { StreamableHttpMcpClient } from './services/streamableHttpMcpClient';
import { ConnectionStatus, LogEntry, McpTool, McpResource, McpPrompt, JsonRpcMessage, Language, Theme, TransportType, McpServerConfig, McpExtensionConfig } from './types';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Github } from 'lucide-react';
import { APP_VERSION, REPO_URL } from './constants';
import { translations } from './utils/i18n';

interface ItemState {
    argsJson: string; // Used for Tools and Prompts inputs
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

// Helper for normalization
const normalizeTransport = (t: string | undefined | null): TransportType => {
    if (!t) return 'sse';
    const val = String(t).trim().toLowerCase();
    if (val === 'http' || val === 'streamable_http' || val === 'streamable http') {
        return 'streamable_http';
    }
    return 'sse';
};

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  
  // Collections
  const [tools, setTools] = useState<McpTool[]>([]);
  const [resources, setResources] = useState<McpResource[]>([]);
  const [prompts, setPrompts] = useState<McpPrompt[]>([]);
  
  // Selection
  const [activeTab, setActiveTab] = useState<'tools' | 'resources' | 'prompts'>('tools');
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
  const [selectedResource, setSelectedResource] = useState<McpResource | null>(null);
  const [selectedPrompt, setSelectedPrompt] = useState<McpPrompt | null>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  
  // Store state (args + results) per item name (prefixed by type to avoid collision)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  
  // Settings - Initialize from localStorage
  const [lang, setLang] = useState<Language>(() => {
      const saved = localStorage.getItem('mcp_language');
      return (saved === 'en' || saved === 'zh') ? saved : 'zh';
  });
  const [theme, setTheme] = useState<Theme>(() => {
      const saved = localStorage.getItem('mcp_theme');
      return (saved === 'dark' || saved === 'light') ? saved : 'light';
  });

  // --- Lifted State from ConnectionBar ---
  // Config Registries - Initialize lazily from localStorage to prevent overwriting on mount
  const [serverRegistry, setServerRegistry] = useState<Record<string, McpServerConfig>>(() => {
      try {
          const saved = localStorage.getItem('mcp_servers_registry');
          return saved ? JSON.parse(saved) : {};
      } catch (e) {
          console.error("Failed to load server registry", e);
          return {};
      }
  });

  const [extensionRegistry, setExtensionRegistry] = useState<Record<string, McpExtensionConfig>>(() => {
      try {
          const saved = localStorage.getItem('mcp_extensions_registry');
          return saved ? JSON.parse(saved) : {};
      } catch (e) {
          console.error("Failed to load extension registry", e);
          return {};
      }
  });

  // Client ref, initialized with default SSE but can be swapped
  const mcpClient = useRef<IMcpClient>(new SseMcpClient());
  const activeTransport = useRef<TransportType>('sse');
  const connectionBarRef = useRef<ConnectionBarRef>(null);
  
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
    setResources([]);
    setPrompts([]);
    setItemStates({});
    
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

      // Fetch capabilities
      fetchAllCapabilities();

    } catch (e: any) {
      if (e.message === 'Connection aborted') {
          addLog({ type: 'info', direction: 'local', summary: 'Connection cancelled', meta: connectionContext.current });
          return;
      }
      setStatus(ConnectionStatus.ERROR);

      const t = translations[lang];

      // Heuristic for CORS/Network error
      const isNetworkError = e instanceof TypeError && (
          e.message.match(/Failed to fetch|NetworkError|Load failed|Network request failed/i)
      );
      
      const isCorsLikely = isNetworkError && !proxyConfig.enabled;

      const serializedErr = serializeError(e);
      let summary = t.connectionFailed;
      
      if (isCorsLikely) {
          summary = t.possibleCors;
          if (typeof serializedErr === 'object') {
              serializedErr.hint = t.corsHint;
          }
      }
      
      addLog({ 
          type: 'error', 
          direction: 'local', 
          summary: summary, 
          details: serializedErr, 
          meta: connectionContext.current 
      });
    }
  };

  const handleDisconnect = () => {
    mcpClient.current.disconnect();
    setStatus(ConnectionStatus.DISCONNECTED);
    setTools([]);
    setResources([]);
    setPrompts([]);
    setSelectedTool(null);
    setSelectedResource(null);
    setSelectedPrompt(null);
    setItemStates({});
    addLog({ type: 'info', direction: 'local', summary: 'Disconnected' });
    connectionContext.current = null;
  };

  const fetchAllCapabilities = async () => {
    setLoadingItems(true);
    await Promise.allSettled([
        fetchTools(),
        fetchResources(),
        fetchPrompts()
    ]);
    setLoadingItems(false);
  };

  const fetchTools = async () => {
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
    }
  };

  const fetchResources = async () => {
    try {
        const res = await mcpClient.current.sendRequest('resources/list');
        const list = res.resources || [];
        setResources(list);
        addLog({ type: 'info', direction: 'in', summary: `Loaded ${list.length} resources`, meta: connectionContext.current });
    } catch (e: any) {
        // Resources might not be supported by all servers
        console.log("Failed to list resources (optional)", e);
    }
  };

  const fetchPrompts = async () => {
    try {
        const res = await mcpClient.current.sendRequest('prompts/list');
        const list = res.prompts || [];
        setPrompts(list);
        addLog({ type: 'info', direction: 'in', summary: `Loaded ${list.length} prompts`, meta: connectionContext.current });
    } catch (e: any) {
        // Prompts might not be supported by all servers
        console.log("Failed to list prompts (optional)", e);
    }
  };

  const handleSelectItem = (item: McpTool | McpResource | McpPrompt) => {
      if (activeTab === 'tools') setSelectedTool(item as McpTool);
      else if (activeTab === 'resources') setSelectedResource(item as McpResource);
      else if (activeTab === 'prompts') setSelectedPrompt(item as McpPrompt);
  };

  const getUniqueKey = (type: string, name: string) => `${type}:${name}`;

  const handleArgsChange = (argsJson: string) => {
      let key = '';
      if (activeTab === 'tools' && selectedTool) key = getUniqueKey('tool', selectedTool.name);
      else if (activeTab === 'prompts' && selectedPrompt) key = getUniqueKey('prompt', selectedPrompt.name);
      else return;

      setItemStates(prev => ({
          ...prev,
          [key]: {
              ...(prev[key] || { result: null }),
              argsJson
          }
      }));
  };

  const handleExecute = async (args: any) => {
    let method = '';
    let params: any = {};
    let key = '';
    let name = '';

    if (activeTab === 'tools' && selectedTool) {
        method = 'tools/call';
        params = { name: selectedTool.name, arguments: args };
        key = getUniqueKey('tool', selectedTool.name);
        name = selectedTool.name;
    } else if (activeTab === 'prompts' && selectedPrompt) {
        method = 'prompts/get';
        params = { name: selectedPrompt.name, arguments: args };
        key = getUniqueKey('prompt', selectedPrompt.name);
        name = selectedPrompt.name;
    } else {
        return;
    }

    setIsExecuting(true);
    
    try {
        const result = await mcpClient.current.sendRequest(method, params);
        addLog({ type: 'response', direction: 'in', summary: `${activeTab === 'tools' ? 'Tool' : 'Prompt'} Executed: ${name}`, details: result, meta: connectionContext.current });
        
        setItemStates(prev => ({
            ...prev,
            [key]: {
                argsJson: prev[key]?.argsJson || JSON.stringify(args, null, 2),
                result: { status: 'success', data: result }
            }
        }));
    } catch (e: any) {
        const serialized = serializeError(e);
        addLog({ 
            type: 'error', 
            direction: 'in', 
            summary: `Execution Failed: ${name}`, 
            details: serialized, 
            meta: connectionContext.current 
        });
        
        setItemStates(prev => ({
            ...prev,
            [key]: {
                 argsJson: prev[key]?.argsJson || JSON.stringify(args, null, 2),
                 result: { status: 'error', data: serialized }
            }
        }));
    } finally {
        setIsExecuting(false);
    }
  };

  const handleReadResource = async (uri: string) => {
      if (!selectedResource) return;
      const key = getUniqueKey('resource', selectedResource.name);
      
      setIsExecuting(true);
      try {
        const result = await mcpClient.current.sendRequest('resources/read', { uri });
        addLog({ type: 'response', direction: 'in', summary: `Resource Read: ${selectedResource.name}`, details: result, meta: connectionContext.current });

        setItemStates(prev => ({
            ...prev,
            [key]: {
                argsJson: '{}', // Resources typically don't have user-args
                result: { status: 'success', data: result }
            }
        }));
      } catch (e: any) {
        const serialized = serializeError(e);
        addLog({ 
            type: 'error', 
            direction: 'in', 
            summary: `Read Failed: ${selectedResource.name}`, 
            details: serialized, 
            meta: connectionContext.current 
        });
        
        setItemStates(prev => ({
            ...prev,
            [key]: {
                 argsJson: '{}',
                 result: { status: 'error', data: serialized }
            }
        }));
      } finally {
        setIsExecuting(false);
    }
  }

  // --- New Handlers for Empty State Actions ---
  
  const handleImportConfig = () => {
      connectionBarRef.current?.openServerConfigModal('single');
  };

  const handleLoadRecent = () => {
      const keys = Object.keys(serverRegistry);
      if (keys.length === 0) return;
      
      // Find the entry with the max lastConnected
      let recentKey = keys[0];
      let maxTime = serverRegistry[recentKey].lastConnected || 0;

      for (const key of keys) {
          const time = serverRegistry[key].lastConnected || 0;
          if (time > maxTime) {
              maxTime = time;
              recentKey = key;
          }
      }

      if (recentKey) {
          connectionBarRef.current?.loadConfig(recentKey);
      }
  };

  const handleViewAllConfigs = () => {
      connectionBarRef.current?.openServerConfigModal('all');
  };

  // Determine current active item and state
  let currentItem: McpTool | McpResource | McpPrompt | null = null;
  if (activeTab === 'tools') currentItem = selectedTool;
  else if (activeTab === 'resources') currentItem = selectedResource;
  else if (activeTab === 'prompts') currentItem = selectedPrompt;

  const currentStateKey = currentItem ? getUniqueKey(activeTab === 'tools' ? 'tool' : activeTab === 'resources' ? 'resource' : 'prompt', currentItem.name) : null;
  const currentItemState = currentStateKey ? itemStates[currentStateKey] : null;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-200 font-sans transition-colors duration-200">
      <ConnectionBar 
        ref={connectionBarRef}
        status={status} 
        onConnect={handleConnect} 
        onDisconnect={handleDisconnect}
        lang={lang}
        setLang={setLang}
        theme={theme}
        toggleTheme={toggleTheme}
        serverRegistry={serverRegistry}
        setServerRegistry={setServerRegistry}
        extensionRegistry={extensionRegistry}
        setExtensionRegistry={setExtensionRegistry}
      />
      
      <div className="flex-1 flex overflow-hidden">
        {/* We use PanelGroup for resizable split views */}
        <PanelGroup direction="horizontal">
            <Panel defaultSize={20} minSize={15} maxSize={30} className="flex flex-col">
                <Sidebar 
                    tools={tools} 
                    resources={resources}
                    prompts={prompts}
                    selectedItem={currentItem} 
                    onSelectItem={handleSelectItem}
                    loading={loadingItems}
                    lang={lang}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                />
            </Panel>
            
            <PanelResizeHandle className="w-1 bg-gray-200 dark:bg-gray-800 hover:bg-blue-500 transition-colors" />
            
            <Panel>
                <PanelGroup direction="vertical">
                    <Panel defaultSize={60} minSize={30} className="flex flex-col">
                         <RequestPanel 
                            item={currentItem}
                            type={activeTab}
                            status={status}
                            onExecute={handleExecute}
                            onReadResource={handleReadResource}
                            isExecuting={isExecuting}
                            lang={lang}
                            response={currentItemState?.result || null}
                            savedArgs={currentItemState?.argsJson || '{}'}
                            onArgsChange={handleArgsChange}
                            onImportConfig={handleImportConfig}
                            onLoadRecent={handleLoadRecent}
                            onViewAllConfigs={handleViewAllConfigs}
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
            v{APP_VERSION}
            </span>
            <span>
              Author: <a href="https://github.com/Ericwyn" target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors">@Ericwyn</a>
            </span>
          </div>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-gray-800 dark:hover:text-gray-300 transition-colors flex items-center gap-1.5 group">
             <Github className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
             <span>github.com/Ericwyn/mcp-partner</span>
          </a>
      </footer>
    </div>
  );
};

export default App;
