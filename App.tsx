import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionBar } from './components/ConnectionBar';
import { Sidebar } from './components/Sidebar';
import { RequestPanel } from './components/RequestPanel';
import { LogViewer } from './components/LogViewer';
import { McpClient, ProxyConfig } from './services/mcpClient';
import { ConnectionStatus, LogEntry, McpTool, JsonRpcMessage, Language, Theme } from './types';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { Github } from 'lucide-react';

interface ToolState {
    argsJson: string;
    result: { status: 'success' | 'error', data: any } | null;
}

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

  const mcpClient = useRef<McpClient>(new McpClient());

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

  useEffect(() => {
    // Setup generic listeners
    const client = mcpClient.current;
    
    const messageHandler = (msg: JsonRpcMessage) => {
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
            details: msg
        });
    };

    const errorHandler = (err: string) => {
        addLog({ type: 'error', direction: 'local', summary: err });
        setStatus(ConnectionStatus.ERROR);
    };

    client.onMessage(messageHandler);
    client.onError(errorHandler);

    return () => {
        client.disconnect();
    };
  }, []);

  const handleConnect = async (url: string, proxyConfig: ProxyConfig, headers: Record<string, string>) => {
    setStatus(ConnectionStatus.CONNECTING);
    addLog({ 
        type: 'info', 
        direction: 'local', 
        summary: `Connecting to ${url}...`,
        details: { 
          ...(proxyConfig.enabled ? { proxy: proxyConfig.prefix } : {}),
          ...(Object.keys(headers).length > 0 ? { headers } : {})
        }
    });
    setTools([]);
    setToolStates({});
    
    try {
      await mcpClient.current.connect(url, proxyConfig, headers);
      setStatus(ConnectionStatus.CONNECTED);
      addLog({ type: 'info', direction: 'local', summary: 'SSE Connected. Endpoint received.' });
      
      // Initialize Flow
      addLog({ type: 'info', direction: 'local', summary: 'Sending initialize...' });
      const initResult = await mcpClient.current.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
              name: 'mcp-postman-web',
              version: '1.0.0'
          }
      });
      addLog({ type: 'info', direction: 'in', summary: 'Initialized', details: initResult });

      // Send initialized notification
      addLog({ type: 'info', direction: 'local', summary: 'Sending initialized notification...' });
      await mcpClient.current.sendNotification('notifications/initialized');

      // Fetch Tools
      fetchTools();

    } catch (e: any) {
      if (e.message === 'Connection aborted') {
          addLog({ type: 'info', direction: 'local', summary: 'Connection cancelled' });
          return;
      }
      setStatus(ConnectionStatus.ERROR);
      addLog({ type: 'error', direction: 'local', summary: 'Connection Failed', details: e.message });
    }
  };

  const handleDisconnect = () => {
    mcpClient.current.disconnect();
    setStatus(ConnectionStatus.DISCONNECTED);
    setTools([]);
    setSelectedTool(null);
    setToolStates({});
    addLog({ type: 'info', direction: 'local', summary: 'Disconnected' });
  };

  const fetchTools = async () => {
    setLoadingTools(true);
    try {
        const res = await mcpClient.current.sendRequest('tools/list');
        if (res && res.tools) {
            setTools(res.tools);
            addLog({ type: 'info', direction: 'in', summary: `Loaded ${res.tools.length} tools` });
        }
    } catch (e: any) {
        addLog({ type: 'error', direction: 'in', summary: 'Failed to list tools', details: e });
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
        addLog({ type: 'response', direction: 'in', summary: `Tool Executed: ${selectedTool.name}`, details: result });
        
        setToolStates(prev => ({
            ...prev,
            [selectedTool.name]: {
                argsJson: prev[selectedTool.name]?.argsJson || JSON.stringify(args, null, 2),
                result: { status: 'success', data: result }
            }
        }));
    } catch (e: any) {
        addLog({ type: 'error', direction: 'in', summary: `Tool Execution Failed`, details: e });
        
        setToolStates(prev => ({
            ...prev,
            [selectedTool.name]: {
                 argsJson: prev[selectedTool.name]?.argsJson || JSON.stringify(args, null, 2),
                 result: { status: 'error', data: e instanceof Error ? { message: e.message, stack: e.stack } : e }
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
            v0.1.1
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
