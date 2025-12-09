
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConnectionBar } from './components/ConnectionBar';
import { Sidebar } from './components/Sidebar';
import { RequestPanel } from './components/RequestPanel';
import { LogViewer } from './components/LogViewer';
import { McpClient, ProxyConfig } from './services/mcpClient';
import { ConnectionStatus, LogEntry, McpTool, JsonRpcMessage, Language, Theme } from './types';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

const App: React.FC = () => {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [selectedTool, setSelectedTool] = useState<McpTool | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [loadingTools, setLoadingTools] = useState(false);
  const [lastResult, setLastResult] = useState<{ status: 'success' | 'error', data: any } | null>(null);
  
  // Settings
  const [lang, setLang] = useState<Language>('zh');
  const [theme, setTheme] = useState<Theme>('light');

  const mcpClient = useRef<McpClient>(new McpClient());

  // Apply Theme
  useEffect(() => {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
  }, [theme]);

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
      setStatus(ConnectionStatus.ERROR);
      addLog({ type: 'error', direction: 'local', summary: 'Connection Failed', details: e.message });
    }
  };

  const handleDisconnect = () => {
    mcpClient.current.disconnect();
    setStatus(ConnectionStatus.DISCONNECTED);
    setTools([]);
    setSelectedTool(null);
    setLastResult(null);
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
      setLastResult(null);
  };

  const handleExecuteTool = async (args: any) => {
    if (!selectedTool) return;
    setIsExecuting(true);
    setLastResult(null);
    
    try {
        const result = await mcpClient.current.sendRequest('tools/call', {
            name: selectedTool.name,
            arguments: args
        });
        addLog({ type: 'response', direction: 'in', summary: `Tool Executed: ${selectedTool.name}`, details: result });
        setLastResult({ status: 'success', data: result });
    } catch (e: any) {
        addLog({ type: 'error', direction: 'in', summary: `Tool Execution Failed`, details: e });
        setLastResult({ status: 'error', data: e instanceof Error ? { message: e.message, stack: e.stack } : e });
    } finally {
        setIsExecuting(false);
    }
  };

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
                            response={lastResult}
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
    </div>
  );
};

export default App;