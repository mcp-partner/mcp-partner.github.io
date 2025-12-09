import React, { useState, useRef, useEffect } from 'react';
import { ConnectionStatus, Language, Theme, McpPartnerConfig, McpServerConfig, McpExtensionConfig } from '../types';
import { Plug, Unplug, Loader2, Moon, Sun, Settings, Globe, List, Plus, Trash2, History, Save, MoreVertical, Monitor, Languages, Shield, ShieldCheck, ArrowRightLeft, Copy, Check, X, FileJson, Pencil, HardDrive } from 'lucide-react';
import { translations } from '../utils/i18n';

interface ConnectionBarProps {
  status: ConnectionStatus;
  onConnect: (url: string, proxyConfig: { enabled: boolean; prefix: string }, headers: Record<string, string>) => void;
  onDisconnect: () => void;
  lang: Language;
  setLang: (l: Language) => void;
  theme: Theme;
  toggleTheme: () => void;
}

interface HeaderItem {
    id: string;
    key: string;
    value: string;
}

// Internal representation for the UI list derived from the separated configs
interface ServerListItem {
    id: string; // This will be the key in the record
    name: string; // Display name (same as key)
    url: string;
    useProxy: boolean;
    proxyPrefix: string;
    headers: HeaderItem[];
}

const DEFAULT_PROXY_URL = '/cors?url=';

export const ConnectionBar: React.FC<ConnectionBarProps> = ({ 
  status, onConnect, onDisconnect, lang, setLang, theme, toggleTheme 
}) => {
  const [url, setUrl] = useState('http://localhost:3000/sse');
  
  // Global Default Proxy State
  const [globalProxyPrefix, setGlobalProxyPrefix] = useState(() => {
      return localStorage.getItem('mcp_default_proxy_url') || DEFAULT_PROXY_URL;
  });

  const [useProxy, setUseProxy] = useState(false);
  const [proxyPrefix, setProxyPrefix] = useState(globalProxyPrefix);
  
  // Popover visibility states
  const [showSettings, setShowSettings] = useState(false); // Proxy Settings
  const [showHeaders, setShowHeaders] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showGlobalMenu, setShowGlobalMenu] = useState(false);
  
  // Headers state
  const [headers, setHeaders] = useState<HeaderItem[]>([]);

  // Config Registries
  const [serverRegistry, setServerRegistry] = useState<Record<string, McpServerConfig>>({});
  const [extensionRegistry, setExtensionRegistry] = useState<Record<string, McpExtensionConfig>>({});

  // Import/Export App Config State
  const [showAppConfig, setShowAppConfig] = useState(false);
  const [appConfigText, setAppConfigText] = useState('');
  
  // Import/Export Server Config State
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverConfigText, setServerConfigText] = useState('');
  const [configMode, setConfigMode] = useState<'single' | 'all'>('single');
  
  // State to hold a name from an import operation, waiting for a save/connect to persist it
  const [pendingImportConfig, setPendingImportConfig] = useState<{name: string, url: string} | null>(null);

  // Renaming State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const [isCopied, setIsCopied] = useState(false);

  const settingsRef = useRef<HTMLDivElement>(null);
  const headersRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const globalMenuRef = useRef<HTMLDivElement>(null);

  // Track previous status for auto-save trigger
  const prevStatusRef = useRef(status);

  const t = translations[lang];

  const isConnected = status === ConnectionStatus.CONNECTED;
  const isConnecting = status === ConnectionStatus.CONNECTING;

  // Load settings from local storage and migrate if necessary
  useEffect(() => {
    // 1. Load Registry format
    const savedServersStr = localStorage.getItem('mcp_servers_registry');
    const savedExtensionsStr = localStorage.getItem('mcp_extensions_registry');

    let loadedServers: Record<string, McpServerConfig> = {};
    let loadedExtensions: Record<string, McpExtensionConfig> = {};

    if (savedServersStr) {
        try { 
            const parsed = JSON.parse(savedServersStr); 
            // Robust check: Ensure it's a non-null object and not an array
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                loadedServers = parsed;
                // Backfill type: 'sse' if missing from older versions
                Object.values(loadedServers).forEach(s => {
                    if (!s.type) s.type = 'sse';
                    if (!s.headers) s.headers = {};
                });
            }
        } catch (e) { console.error("Failed to parse servers", e); }
    }
    if (savedExtensionsStr) {
        try { 
            const parsed = JSON.parse(savedExtensionsStr); 
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                loadedExtensions = parsed;
            }
        } catch (e) { console.error("Failed to parse extensions", e); }
    }

    // 2. Check for migration from old format
    const oldConfigsStr = localStorage.getItem('mcp_saved_configs');
    if (oldConfigsStr && Object.keys(loadedServers).length === 0) {
        console.log("Migrating old configurations...");
        try {
            const oldConfigs = JSON.parse(oldConfigsStr);
            if (Array.isArray(oldConfigs)) {
                oldConfigs.forEach((c: any) => {
                    // Generate a unique name
                    let name = c.name || 'Server';
                    let counter = 1;
                    let uniqueName = name;
                    while (loadedServers[uniqueName]) {
                        uniqueName = `${name} ${counter++}`;
                    }

                    // Convert headers array to record
                    const headerRecord: Record<string, string> = {};
                    if (Array.isArray(c.headers)) {
                        c.headers.forEach((h: any) => {
                            if (h.key) headerRecord[h.key] = h.value;
                        });
                    }

                    loadedServers[uniqueName] = {
                        url: (c as any).url,
                        headers: headerRecord,
                        type: 'sse'
                    };
                    
                    loadedExtensions[uniqueName] = {
                        useProxy: !!(c as any).useProxy,
                        proxyPrefix: (c as any).proxyPrefix || 'https://corsproxy.io/?url='
                    };
                });
                
                // Save immediately
                localStorage.setItem('mcp_servers_registry', JSON.stringify(loadedServers));
                localStorage.setItem('mcp_extensions_registry', JSON.stringify(loadedExtensions));
            }
        } catch (e) {
            console.error("Migration failed", e);
        }
    }

    setServerRegistry(loadedServers);
    setExtensionRegistry(loadedExtensions);

    // Load last used settings for current inputs
    const lastProxy = localStorage.getItem('mcp_last_use_proxy');
    const lastPrefix = localStorage.getItem('mcp_last_proxy_prefix');
    
    if (lastProxy !== null) setUseProxy(lastProxy === 'true');
    // If we have a last prefix, use it. Otherwise fall back to global default.
    if (lastPrefix !== null) {
        setProxyPrefix(lastPrefix);
    } else {
        setProxyPrefix(globalProxyPrefix);
    }

  }, []);

  // Persist registries whenever they change
  useEffect(() => {
      localStorage.setItem('mcp_servers_registry', JSON.stringify(serverRegistry));
  }, [serverRegistry]);

  useEffect(() => {
      localStorage.setItem('mcp_extensions_registry', JSON.stringify(extensionRegistry));
  }, [extensionRegistry]);

  // Persist current transient UI inputs
  useEffect(() => { localStorage.setItem('mcp_last_use_proxy', String(useProxy)); }, [useProxy]);
  useEffect(() => { localStorage.setItem('mcp_last_proxy_prefix', proxyPrefix); }, [proxyPrefix]);
  
  // Persist Global Proxy Setting
  useEffect(() => { localStorage.setItem('mcp_default_proxy_url', globalProxyPrefix); }, [globalProxyPrefix]);

  // Helper: Upsert configuration
  const upsertServerConfig = (customName?: string) => {
      // 1. Determine Name
      let name = customName;

      // If we have a pending imported name and the URL matches, use it
      if (!name && pendingImportConfig && pendingImportConfig.url === url) {
          name = pendingImportConfig.name;
      }

      if (!name) {
          // Try to find if this URL already exists to update it
          const existingEntry = Object.entries(serverRegistry).find(([_, cfg]) => (cfg as McpServerConfig).url === url);
          if (existingEntry) {
              name = existingEntry[0];
          } else {
              // Generate new name from URL
              try {
                  const urlObj = new URL(url);
                  name = urlObj.host;
              } catch {
                  name = 'Server';
              }
          }
      }

      // Ensure uniqueness if the determined name exists but points to a DIFFERENT URL
      if (name && serverRegistry[name] && serverRegistry[name].url !== url) {
           let counter = 1;
           const baseName = name;
           while (serverRegistry[`${baseName}-${counter}`]) counter++;
           name = `${baseName}-${counter}`;
      }

      // 2. Prepare Data
      const headerRecord: Record<string, string> = {};
      headers.forEach(h => { if(h.key.trim()) headerRecord[h.key.trim()] = h.value; });

      // 3. Update State
      setServerRegistry(prev => ({
          ...prev,
          [name!]: {
              url,
              headers: headerRecord,
              type: 'sse'
          }
      }));

      setExtensionRegistry(prev => ({
          ...prev,
          [name!]: {
              useProxy,
              proxyPrefix
          }
      }));

      // Clear pending config if it was used
      if (pendingImportConfig && pendingImportConfig.url === url) {
          setPendingImportConfig(null);
      }
  };

  // Auto-save effect: Trigger save when successfully connected
  useEffect(() => {
    if (prevStatusRef.current !== ConnectionStatus.CONNECTED && status === ConnectionStatus.CONNECTED) {
        upsertServerConfig();
    }
    prevStatusRef.current = status;
  }, [status]); 

  // Close popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) setShowSettings(false);
      if (headersRef.current && !headersRef.current.contains(event.target as Node)) setShowHeaders(false);
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) setShowHistory(false);
      if (globalMenuRef.current && !globalMenuRef.current.contains(event.target as Node)) setShowGlobalMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isConnected || isConnecting) {
      onDisconnect();
    } else {
      const headerObj: Record<string, string> = {};
      headers.forEach(h => {
          if(h.key.trim()) headerObj[h.key.trim()] = h.value;
      });

      const effectiveProxyPrefix = (useProxy && !proxyPrefix.trim()) 
          ? globalProxyPrefix 
          : proxyPrefix;

      onConnect(url, { enabled: useProxy, prefix: effectiveProxyPrefix }, headerObj);
    }
  };

  // Helper to prevent form submission on Enter for config inputs
  const handleEnterKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).blur();
    }
  };

  // Header Management
  const addHeader = () => setHeaders([...headers, { id: Math.random().toString(36).substr(2, 9), key: '', value: '' }]);
  const updateHeader = (id: string, field: 'key' | 'value', val: string) => setHeaders(headers.map(h => h.id === id ? { ...h, [field]: val } : h));
  const removeHeader = (id: string) => setHeaders(headers.filter(h => h.id !== id));

  // History/Config Management
  const handleManualSave = () => {
      upsertServerConfig();
      setShowHistory(false);
  };

  const loadConfig = (key: string) => {
      const server = serverRegistry[key];
      const extension = extensionRegistry[key];

      if (server) {
          setUrl(server.url);
          const headerArray = Object.entries(server.headers || {}).map(([k, v]) => ({
              id: Math.random().toString(36).substr(2, 9),
              key: k,
              value: String(v)
          }));
          setHeaders(headerArray);
      }

      if (extension) {
          setUseProxy(extension.useProxy);
          setProxyPrefix(extension.proxyPrefix);
      } else {
          setUseProxy(false);
          setProxyPrefix(globalProxyPrefix);
      }

      setShowHistory(false);
      setPendingImportConfig(null); // Clear any pending import when loading a saved config
  };

  const deleteConfig = (e: React.MouseEvent, key: string) => {
      e.stopPropagation();
      const newServers = { ...serverRegistry };
      const newExtensions = { ...extensionRegistry };
      delete newServers[key];
      delete newExtensions[key];
      setServerRegistry(newServers);
      setExtensionRegistry(newExtensions);
  };

  // Renaming Logic
  const startEditing = (e: React.MouseEvent, key: string) => {
      e.stopPropagation();
      setEditingId(key);
      setEditingName(key);
  };

  const cancelEditing = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditingId(null);
      setEditingName('');
  };

  const saveEditing = (e: React.MouseEvent, oldKey: string) => {
      e.stopPropagation();
      const newKey = editingName.trim();
      
      if (!newKey) return;
      if (newKey === oldKey) {
          setEditingId(null);
          return;
      }
      if (serverRegistry[newKey]) {
          alert(t.serverNameExists);
          return;
      }

      // Update Registries
      const newServers = { ...serverRegistry };
      const newExtensions = { ...extensionRegistry };

      newServers[newKey] = newServers[oldKey];
      delete newServers[oldKey];

      if (newExtensions[oldKey]) {
          newExtensions[newKey] = newExtensions[oldKey];
          delete newExtensions[oldKey];
      }

      setServerRegistry(newServers);
      setExtensionRegistry(newExtensions);
      setEditingId(null);
  };

  // --- App Config Import / Export ---
  const handleOpenAppConfig = () => {
      const exportData: McpPartnerConfig = {
          mcpServers: serverRegistry,
          mcpExtensions: extensionRegistry,
          appConfig: {
              theme,
              language: lang,
              defaultProxyUrl: globalProxyPrefix
          }
      };
      setAppConfigText(JSON.stringify(exportData, null, 2));
      setShowAppConfig(true);
      setShowGlobalMenu(false);
      setIsCopied(false);
  };

  const handleCopyAppConfig = () => {
      navigator.clipboard.writeText(appConfigText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSaveAppConfig = () => {
      try {
          const parsed: McpPartnerConfig = JSON.parse(appConfigText);
          
          if (!parsed.mcpServers && !parsed.appConfig) {
              throw new Error("Invalid config: missing mcpServers or appConfig");
          }

          // Full reload/replace logic (with safe merge for servers)
          let newServerRegistry = { ...serverRegistry };
          let newExtensionRegistry = { ...extensionRegistry };

          if (parsed.mcpServers) {
              Object.entries(parsed.mcpServers).forEach(([key, config]) => {
                  const rawConfig = config as any;
                  // Support baseUrl alias
                  const url = rawConfig.url || rawConfig.baseUrl;

                  if (!url) return;

                  // Support internal name as key preference
                  const name = rawConfig.name || key;

                  let finalKey = name;
                  let counter = 1;
                  // If key exists and URL is different, rename.
                  while (newServerRegistry[finalKey] && newServerRegistry[finalKey].url !== url) {
                      finalKey = `${name}-${counter++}`;
                  }
                  
                  newServerRegistry[finalKey] = {
                      url: url,
                      type: 'sse', // Force type sse
                      headers: rawConfig.headers ? { ...rawConfig.headers } : {} // Ensure headers exist and are copied
                  };
                  
                  if (parsed.mcpExtensions && parsed.mcpExtensions[key]) {
                      newExtensionRegistry[finalKey] = parsed.mcpExtensions[key];
                  }
              });
          }

          localStorage.setItem('mcp_servers_registry', JSON.stringify(newServerRegistry));
          localStorage.setItem('mcp_extensions_registry', JSON.stringify(newExtensionRegistry));

          if (parsed.appConfig) {
              if (parsed.appConfig.language) localStorage.setItem('mcp_language', parsed.appConfig.language);
              if (parsed.appConfig.theme) localStorage.setItem('mcp_theme', parsed.appConfig.theme);
              if (parsed.appConfig.defaultProxyUrl) localStorage.setItem('mcp_default_proxy_url', parsed.appConfig.defaultProxyUrl);
          }

          window.location.reload();
      } catch (e) {
          alert(t.invalidJson + ": " + (e as any).message);
      }
  };

  // --- Server Config Import / Export (Just the MCP Servers part) ---
  const handleOpenServerConfig = () => {
      // DEFAULT MODE: Single Config (Current Inputs)
      setConfigMode('single');

      // 1. Identify current config name if it matches a known URL
      const foundEntry = Object.entries(serverRegistry).find(([_, cfg]) => cfg.url === url);
      
      let keyName = foundEntry ? foundEntry[0] : 'new-mcp-server';
      // If we have a pending name for the current URL, use that as the display name
      if (pendingImportConfig && pendingImportConfig.url === url) {
          keyName = pendingImportConfig.name;
      } else if (!foundEntry) {
        try {
            const u = new URL(url);
            keyName = u.hostname.replace(/\./g, '-');
        } catch {}
      }

      // 2. Prepare current headers
      const currentHeaders: Record<string, string> = {};
      headers.forEach(h => {
        if (h.key.trim()) currentHeaders[h.key.trim()] = h.value;
      });

      // 3. Construct single server JSON
      const singleConfig = {
          mcpServers: {
              [keyName]: {
                  type: 'sse',
                  name: keyName, // Added for display completeness, though not strictly in type
                  url: url,
                  headers: currentHeaders
              }
          }
      };

      setServerConfigText(JSON.stringify(singleConfig, null, 2));
      setShowServerConfig(true);
      setIsCopied(false);
  };

  const handleSwitchToAllConfig = () => {
      setConfigMode('all');
      setServerConfigText(JSON.stringify({ mcpServers: serverRegistry }, null, 2));
      setIsCopied(false);
  };

  const handleCopyServerConfig = () => {
      navigator.clipboard.writeText(serverConfigText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSaveServerConfig = () => {
      try {
          const parsed = JSON.parse(serverConfigText);
          if (!parsed.mcpServers) throw new Error("Missing 'mcpServers' key");

          if (configMode === 'all') {
             // MODE: All (Bulk Import/Manage)
             const newServers = { ...serverRegistry };
             
             Object.entries(parsed.mcpServers).forEach(([key, value]) => {
                  const rawConfig = value as any;
                  // Support baseUrl alias
                  const url = rawConfig.url || rawConfig.baseUrl;
                  const name = rawConfig.name || key;

                  if (!url) return;
                  
                  let finalKey = name;
                  
                  // If conflict exists
                  if (newServers[finalKey]) {
                       let counter = 1;
                       while (newServers[finalKey]) {
                           finalKey = `${name}-${counter++}`;
                       }
                  }
                  
                  newServers[finalKey] = {
                      url: url,
                      type: 'sse',
                      headers: rawConfig.headers ? { ...rawConfig.headers } : {}
                  };
             });
             setServerRegistry(newServers);
             setPendingImportConfig(null);
          } else {
             // MODE: Single (Update Inputs Only)
             const keys = Object.keys(parsed.mcpServers);
             if (keys.length === 0) throw new Error("No server definition found in JSON");
             
             // Take the first server defined
             const firstKey = keys[0];
             const rawConfig = parsed.mcpServers[firstKey] as any;
             const url = rawConfig.url || rawConfig.baseUrl;
             const name = rawConfig.name || firstKey;
             
             // Update Inputs
             setUrl(url || '');
             
             const newHeaders: HeaderItem[] = [];
             if (rawConfig.headers) {
                 Object.entries(rawConfig.headers).forEach(([k, v]) => {
                     newHeaders.push({
                         id: Math.random().toString(36).substr(2, 9),
                         key: k,
                         value: String(v)
                     });
                 });
             }
             setHeaders(newHeaders);
             
             // Note: We DO NOT save to registry here. It just fills the inputs.
             // But we store the name in pending state so it is used when the user clicks Save or Connect.
             if (url && name) {
                 setPendingImportConfig({ name, url });
             }
          }

          setShowServerConfig(false);
      } catch(e) {
          alert(t.invalidJson + ": " + (e as any).message);
      }
  };

  const historyItems = Object.keys(serverRegistry).reverse().map(key => ({
      key,
      ...serverRegistry[key]
  }));

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 pb-4 flex items-center gap-4 shadow-sm transition-colors duration-200 relative z-50">
      {/* Title */}
      <div className="flex flex-col justify-center shrink-0 pt-4">
        <div className="font-black text-xl text-blue-600 dark:text-blue-400 leading-none tracking-tight">MCP Partner</div>
        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-px mt-0.5">{t.appTitle}</span>
      </div>
      
      {/* Address Bar Form */}
      <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2 min-w-0 mt-4">
        <div className="relative flex-1 group min-w-0 flex items-center gap-2">
           <div className="relative flex-1">
                {/* Left: History/Saved Button */}
                <div className="absolute inset-y-0 left-0 pl-1 flex items-center">
                    <button 
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold font-mono transition-colors ${
                            isConnected ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        title={t.savedConfigs}
                    >
                         <History className="w-3.5 h-3.5" />
                         <span className="hidden lg:inline">SSE</span>
                    </button>
                </div>

                {/* History Popover */}
                {showHistory && (
                    <div ref={historyRef} className="absolute left-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 p-2">
                        <div className="flex items-center justify-between px-2 py-1 mb-2 border-b border-gray-100 dark:border-gray-700">
                             <span className="text-xs font-semibold text-gray-500 uppercase">{t.history}</span>
                             <button type="button" onClick={handleManualSave} className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded">
                                 <Save className="w-3 h-3" /> {t.saveCurrent}
                             </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {historyItems.length === 0 && (
                                <div className="text-center py-4 text-xs text-gray-400">{t.noSaved}</div>
                            )}
                            {historyItems.map(item => (
                                <div 
                                    key={item.key} 
                                    onClick={() => editingId !== item.key && loadConfig(item.key)}
                                    className={`group flex items-center justify-between px-3 py-2 rounded transition-colors ${
                                        editingId === item.key ? 'bg-blue-50 dark:bg-blue-900/20 cursor-default' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer'
                                    }`}
                                >
                                    {editingId === item.key ? (
                                        <div className="flex items-center gap-1 w-full" onClick={e => e.stopPropagation()}>
                                            <input 
                                                autoFocus
                                                value={editingName}
                                                onChange={e => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        saveEditing(e as any, item.key);
                                                    } else if (e.key === 'Escape') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        cancelEditing(e as any);
                                                    }
                                                }}
                                                className="flex-1 min-w-0 text-xs px-2 py-1 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <button 
                                                type="button"
                                                onClick={(e) => saveEditing(e, item.key)}
                                                className="p-1 text-green-600 hover:text-green-700"
                                                title={t.save}
                                            >
                                                <Check className="w-3.5 h-3.5" />
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={(e) => cancelEditing(e)}
                                                className="p-1 text-gray-400 hover:text-gray-600"
                                                title={t.cancel}
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium text-gray-900 dark:text-gray-200 truncate">{item.key}</span>
                                                <span className="text-[10px] text-gray-500 truncate">{item.url}</span>
                                            </div>
                                            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    type="button"
                                                    onClick={(e) => startEditing(e, item.key)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-500 transition-colors"
                                                    title={t.rename}
                                                >
                                                    <Pencil className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={(e) => deleteConfig(e, item.key)} 
                                                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <input 
                    type="text" 
                    placeholder={t.ssePlaceholder}
                    className={`w-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200 text-sm rounded-md h-9 pl-16 pr-20 transition-all font-mono focus:outline-none ${
                        isConnected 
                        ? 'border border-green-500 dark:border-green-400 ring-1 ring-green-500/20 shadow-[0_0_8px_rgba(34,197,94,0.1)] disabled:opacity-100' 
                        : 'border border-gray-300 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50'
                    }`}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isConnected || isConnecting}
                />
                
                {/* Right Icons Container (Headers + Proxy) */}
                <div className="absolute inset-y-0 right-0 pr-1 flex items-center gap-0.5">
                    {/* Headers Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowHeaders(!showHeaders)}
                        disabled={isConnected || isConnecting}
                        className={`p-1.5 rounded-md transition-colors relative ${
                            showHeaders || headers.length > 0
                            ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' 
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                        }`}
                        title={t.headers}
                    >
                        <List className="w-4 h-4" />
                        {headers.length > 0 && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-blue-500 rounded-full border border-white dark:border-gray-900"></span>
                        )}
                    </button>

                    {/* Proxy Settings Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowSettings(!showSettings)}
                        disabled={isConnected || isConnecting}
                        className={`p-1.5 rounded-md transition-colors relative ${
                            showSettings 
                            ? 'text-gray-700 bg-gray-100 dark:text-gray-200 dark:bg-gray-700' 
                            : 'text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300'
                        } ${useProxy ? 'text-green-600 dark:text-green-400 !bg-green-50 dark:!bg-green-900/20' : ''}`}
                        title={t.proxySettings}
                    >
                        {useProxy ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        {useProxy && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-green-500 rounded-full"></div>}
                    </button>
                </div>

                {/* Headers Popover */}
                {showHeaders && (
                    <div ref={headersRef} className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-200 flex items-center gap-2">
                                <List className="w-4 h-4" />
                                {t.headers}
                            </h3>
                            <button type="button" onClick={addHeader} className="text-blue-600 hover:text-blue-500 text-xs font-medium flex items-center gap-1">
                                <Plus className="w-3 h-3" /> {t.add}
                            </button>
                        </div>
                        
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {headers.length === 0 && (
                                <p className="text-xs text-gray-500 text-center py-4">{t.noHeaders}</p>
                            )}
                            {headers.map(h => (
                                <div key={h.id} className="flex gap-2 items-center">
                                    <input 
                                        placeholder="Key" 
                                        value={h.key}
                                        onChange={e => updateHeader(h.id, 'key', e.target.value)}
                                        onKeyDown={handleEnterKey}
                                        className="flex-1 w-0 text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    />
                                    <input 
                                        placeholder="Value" 
                                        value={h.value}
                                        onChange={e => updateHeader(h.id, 'value', e.target.value)}
                                        onKeyDown={handleEnterKey}
                                        className="flex-1 w-0 text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    />
                                    <button type="button" onClick={() => removeHeader(h.id)} className="text-gray-400 hover:text-red-500">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {/* Proxy Settings Popover */}
                {showSettings && (
                    <div ref={settingsRef} className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 p-4">
                        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200 flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            {t.proxySettings}
                        </h3>
                        <div className="space-y-4">
                            <label className="flex items-center justify-between cursor-pointer">
                                <span className="text-sm text-gray-700 dark:text-gray-300">{t.useProxy}</span>
                                <div className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={useProxy} onChange={e => setUseProxy(e.target.checked)} />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-500"></div>
                                </div>
                            </label>
                            
                            <div className={useProxy ? 'opacity-100' : 'opacity-50 pointer-events-none'}>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{t.proxyPrefix}</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 text-sm rounded-md p-2 focus:ring-green-500 focus:border-green-500"
                                    value={proxyPrefix}
                                    onChange={e => setProxyPrefix(e.target.value)}
                                    onKeyDown={handleEnterKey}
                                    placeholder={`Default: ${globalProxyPrefix}`}
                                />
                                <a 
                                  href="https://github.com/Ericwyn/pancors" 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="block mt-1.5 text-[10px] text-blue-500 hover:text-blue-600 hover:underline text-right"
                                >
                                  {t.deployPancors}
                                </a>
                            </div>
                        </div>
                    </div>
                )}
           </div>
        </div>

        {/* MCP Server Config Button */}
        <button
            type="button"
            onClick={handleOpenServerConfig}
            className="flex items-center justify-center h-9 w-9 md:w-auto md:px-3 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 transition-colors shrink-0"
            title={t.serverConfig}
            disabled={isConnecting}
        >
            <FileJson className="w-4 h-4" />
        </button>

        {/* Connect Button */}
        <button 
          type="submit" 
          className={`flex items-center gap-2 px-4 md:px-6 h-9 rounded-md font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 shrink-0 ${
            isConnected 
            ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500' 
            : isConnecting
            ? 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500'
            : 'bg-blue-600 text-white hover:bg-blue-500 focus:ring-blue-500'
          }`}
        >
          {isConnecting ? (
            <X className="w-4 h-4" />
          ) : isConnected ? (
            <Unplug className="w-4 h-4" />
          ) : (
            <Plug className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">
            {isConnecting ? t.cancel : isConnected ? t.disconnect : t.connect}
          </span>
        </button>

        {/* Global Settings Menu */}
        <div className="relative shrink-0">
           <button
              type="button"
              onClick={() => setShowGlobalMenu(!showGlobalMenu)}
              className="h-9 w-9 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 transition-colors"
           >
              <Settings className="w-5 h-5" />
           </button>
           
           {showGlobalMenu && (
               <div ref={globalMenuRef} className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 py-1">
                   <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                       {t.globalSettings}
                   </div>
                   
                   {/* Language Toggle */}
                   <button 
                      type="button"
                      onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between"
                   >
                       <div className="flex items-center gap-2">
                           <Languages className="w-4 h-4" />
                           {t.language}
                       </div>
                       <span className="text-xs font-mono bg-gray-100 dark:bg-gray-900 px-1.5 py-0.5 rounded">{lang.toUpperCase()}</span>
                   </button>

                   {/* Theme Toggle */}
                   <button 
                      type="button"
                      onClick={toggleTheme}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between"
                   >
                       <div className="flex items-center gap-2">
                           <Monitor className="w-4 h-4" />
                           {t.theme}
                       </div>
                       {theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                   </button>

                   {/* Default Proxy Config */}
                   <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700">
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t.defaultProxy}</label>
                        <input 
                            type="text"
                            value={globalProxyPrefix}
                            onChange={(e) => setGlobalProxyPrefix(e.target.value)}
                            onKeyDown={handleEnterKey}
                            className="w-full text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-400"
                        />
                   </div>

                    {/* Import/Export Toggle (Now App Config) */}
                    <button 
                      type="button"
                      onClick={handleOpenAppConfig}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between border-t border-gray-100 dark:border-gray-700"
                   >
                       <div className="flex items-center gap-2">
                           <HardDrive className="w-4 h-4" />
                           {t.importExport}
                       </div>
                   </button>
               </div>
           )}
        </div>
      </form>

      {/* App Config Import/Export Modal */}
      {showAppConfig && (
            <div 
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                onClick={() => setShowAppConfig(false)}
            >
                <div 
                    className="bg-white dark:bg-gray-850 rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[85vh] border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <HardDrive className="w-4 h-4 text-blue-500" />
                            {t.importExportTitle}
                        </h3>
                        <button 
                            onClick={() => setShowAppConfig(false)}
                            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                            title={t.close}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                         <p className="text-sm text-gray-500 dark:text-gray-400">{t.importExportDesc}</p>
                         <textarea 
                             className="w-full h-64 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200 font-mono text-xs p-3 rounded border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                             value={appConfigText}
                             onChange={(e) => setAppConfigText(e.target.value)}
                         />
                    </div>
                    <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 shrink-0 bg-gray-50 dark:bg-gray-850 rounded-b-lg">
                         <button 
                            onClick={handleCopyAppConfig}
                            className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            {isCopied ? t.copied : t.copy}
                        </button>
                         <button 
                            onClick={handleSaveAppConfig}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-500 transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            {t.saveAndReload}
                        </button>
                    </div>
                </div>
            </div>
      )}

      {/* MCP Server Config Modal */}
      {showServerConfig && (
            <div 
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                onClick={() => setShowServerConfig(false)}
            >
                <div 
                    className="bg-white dark:bg-gray-850 rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[85vh] border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <FileJson className="w-4 h-4 text-purple-500" />
                            {configMode === 'single' ? t.currentServerConfig : t.allServerConfig}
                        </h3>
                        <button 
                            onClick={() => setShowServerConfig(false)}
                            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                            title={t.close}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-4 flex flex-col gap-2">
                         <div className="flex justify-between items-start gap-2">
                            <p className="text-sm text-gray-500 dark:text-gray-400 flex-1">
                                {configMode === 'single' ? t.singleConfigDesc : t.serverConfigDesc}
                            </p>
                            {configMode === 'single' && (
                                <button 
                                    onClick={handleSwitchToAllConfig}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0 whitespace-nowrap mt-0.5"
                                >
                                    {t.manageAllConfigs}
                                </button>
                            )}
                         </div>
                         <textarea 
                             className="w-full h-64 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200 font-mono text-xs p-3 rounded border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
                             value={serverConfigText}
                             onChange={(e) => setServerConfigText(e.target.value)}
                         />
                    </div>
                    <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 shrink-0 bg-gray-50 dark:bg-gray-850 rounded-b-lg">
                         <button 
                            onClick={handleCopyServerConfig}
                            className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            {isCopied ? t.copied : t.copy}
                        </button>
                         <button 
                            onClick={handleSaveServerConfig}
                            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-500 transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            {configMode === 'single' ? t.loadConfig : t.save}
                        </button>
                    </div>
                </div>
            </div>
      )}
    </div>
  );
};