
import React, { useState, useRef, useEffect } from 'react';
import { ConnectionStatus, Language, Theme } from '../types';
import { Plug, Unplug, Loader2, Moon, Sun, Settings, Globe, List, Plus, Trash2, History, Save, MoreVertical, Monitor, Languages, Shield, ShieldCheck, ArrowRightLeft, Copy, Check, X } from 'lucide-react';
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

interface SavedConfig {
    id: string;
    name: string;
    url: string;
    useProxy: boolean;
    proxyPrefix: string;
    headers: HeaderItem[];
    timestamp: number;
}

export const ConnectionBar: React.FC<ConnectionBarProps> = ({ 
  status, onConnect, onDisconnect, lang, setLang, theme, toggleTheme 
}) => {
  const [url, setUrl] = useState('http://localhost:3000/sse');
  const [useProxy, setUseProxy] = useState(false);
  const [proxyPrefix, setProxyPrefix] = useState('https://corsproxy.io/?url=');
  
  // Popover visibility states
  const [showSettings, setShowSettings] = useState(false); // Proxy Settings
  const [showHeaders, setShowHeaders] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showGlobalMenu, setShowGlobalMenu] = useState(false);
  
  // Headers state
  const [headers, setHeaders] = useState<HeaderItem[]>([]);

  // Saved Configs state
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);

  // Import/Export State
  const [showImportExport, setShowImportExport] = useState(false);
  const [importText, setImportText] = useState('');
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

  // Load settings from local storage
  useEffect(() => {
    const savedProxyEnabled = localStorage.getItem('mcp_use_proxy');
    const savedProxyPrefix = localStorage.getItem('mcp_proxy_prefix');
    const savedConfigsStr = localStorage.getItem('mcp_saved_configs');

    if (savedProxyEnabled !== null) setUseProxy(savedProxyEnabled === 'true');
    if (savedProxyPrefix !== null) setProxyPrefix(savedProxyPrefix);
    if (savedConfigsStr) {
        try {
            setSavedConfigs(JSON.parse(savedConfigsStr));
        } catch (e) {
            console.error("Failed to parse saved configs", e);
        }
    }
  }, []);

  // Save specific settings to local storage
  useEffect(() => { localStorage.setItem('mcp_use_proxy', String(useProxy)); }, [useProxy]);
  useEffect(() => { localStorage.setItem('mcp_proxy_prefix', proxyPrefix); }, [proxyPrefix]);
  useEffect(() => { localStorage.setItem('mcp_saved_configs', JSON.stringify(savedConfigs)); }, [savedConfigs]);

  // Unified Save Logic (Upsert)
  const saveConfigToHistory = () => {
      setSavedConfigs(prevConfigs => {
          const existingIndex = prevConfigs.findIndex(c => c.url === url);
          let newConfigs = [...prevConfigs];
          
          const name = url.replace(/^https?:\/\//, '').split('/')[0] || 'Server';
          // Use existing ID if updating, otherwise new ID
          const id = existingIndex >= 0 ? prevConfigs[existingIndex].id : Date.now().toString();
          // Preserve custom name if existing
          const configName = existingIndex >= 0 ? prevConfigs[existingIndex].name : name;

          const configToSave: SavedConfig = {
              id,
              name: configName,
              url,
              useProxy,
              proxyPrefix,
              headers,
              timestamp: Date.now()
          };

          if (existingIndex >= 0) {
              newConfigs.splice(existingIndex, 1);
          }
          newConfigs.unshift(configToSave);
          
          // Limit history size
          if (newConfigs.length > 50) newConfigs = newConfigs.slice(0, 50);
          return newConfigs;
      });
  };

  // Auto-save effect: Trigger save when successfully connected
  useEffect(() => {
    if (prevStatusRef.current !== ConnectionStatus.CONNECTED && status === ConnectionStatus.CONNECTED) {
        saveConfigToHistory();
    }
    prevStatusRef.current = status;
  }, [status, url, useProxy, proxyPrefix, headers]);

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
    if (isConnected) {
      onDisconnect();
    } else {
      const headerObj: Record<string, string> = {};
      headers.forEach(h => {
          if(h.key.trim()) headerObj[h.key.trim()] = h.value;
      });
      onConnect(url, { enabled: useProxy, prefix: proxyPrefix }, headerObj);
    }
  };

  // Header Management
  const addHeader = () => setHeaders([...headers, { id: Math.random().toString(36).substr(2, 9), key: '', value: '' }]);
  const updateHeader = (id: string, field: 'key' | 'value', val: string) => setHeaders(headers.map(h => h.id === id ? { ...h, [field]: val } : h));
  const removeHeader = (id: string) => setHeaders(headers.filter(h => h.id !== id));

  // History/Config Management
  const handleManualSave = () => {
      saveConfigToHistory();
      setShowHistory(false);
  };

  const loadConfig = (config: SavedConfig) => {
      setUrl(config.url);
      setUseProxy(config.useProxy);
      setProxyPrefix(config.proxyPrefix);
      setHeaders(config.headers || []);
      setShowHistory(false);
  };

  const deleteConfig = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setSavedConfigs(savedConfigs.filter(c => c.id !== id));
  };

  // Import / Export Logic
  const handleOpenImportExport = () => {
      setImportText(JSON.stringify(savedConfigs, null, 2));
      setShowImportExport(true);
      setShowGlobalMenu(false);
      setIsCopied(false);
  };

  const handleCopyConfig = () => {
      navigator.clipboard.writeText(importText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSaveAndReload = () => {
      try {
          const parsed = JSON.parse(importText);
          if (!Array.isArray(parsed)) throw new Error("Root element must be an array");
          
          localStorage.setItem('mcp_saved_configs', JSON.stringify(parsed));
          window.location.reload();
      } catch (e) {
          alert(t.invalidJson);
      }
  };

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
                    <div ref={historyRef} className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 p-2">
                        <div className="flex items-center justify-between px-2 py-1 mb-2 border-b border-gray-100 dark:border-gray-700">
                             <span className="text-xs font-semibold text-gray-500 uppercase">{t.history}</span>
                             <button type="button" onClick={handleManualSave} className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2 py-1 rounded">
                                 <Save className="w-3 h-3" /> {t.saveCurrent}
                             </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {savedConfigs.length === 0 && (
                                <div className="text-center py-4 text-xs text-gray-400">{t.noSaved}</div>
                            )}
                            {savedConfigs.map(config => (
                                <div 
                                    key={config.id} 
                                    onClick={() => loadConfig(config)}
                                    className="group flex items-center justify-between px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded cursor-pointer transition-colors"
                                >
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-200 truncate">{config.name}</span>
                                        <span className="text-[10px] text-gray-500 truncate">{config.url}</span>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={(e) => deleteConfig(e, config.id)} 
                                        className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
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
                                        className="flex-1 w-0 text-xs px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                    />
                                    <input 
                                        placeholder="Value" 
                                        value={h.value}
                                        onChange={e => updateHeader(h.id, 'value', e.target.value)}
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
                                />
                            </div>
                        </div>
                    </div>
                )}
           </div>
        </div>

        <button 
          type="submit" 
          disabled={isConnecting}
          className={`flex items-center gap-2 px-4 md:px-6 h-9 rounded-md font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-900 shrink-0 ${
            isConnected 
            ? 'bg-red-500 hover:bg-red-600 text-white focus:ring-red-500' 
            : 'bg-blue-600 text-white hover:bg-blue-500 focus:ring-blue-500'
          } ${isConnecting ? 'opacity-70 cursor-wait' : ''}`}
        >
          {isConnecting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isConnected ? (
            <Unplug className="w-4 h-4" />
          ) : (
            <Plug className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">
            {isConnecting ? t.connecting : isConnected ? t.disconnect : t.connect}
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
               <div ref={globalMenuRef} className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 py-1">
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

                    {/* Import/Export Toggle */}
                    <button 
                      type="button"
                      onClick={handleOpenImportExport}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between border-t border-gray-100 dark:border-gray-700"
                   >
                       <div className="flex items-center gap-2">
                           <ArrowRightLeft className="w-4 h-4" />
                           {t.importExport}
                       </div>
                   </button>
               </div>
           )}
        </div>
      </form>

      {/* Import/Export Modal */}
      {showImportExport && (
            <div 
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                onClick={() => setShowImportExport(false)}
            >
                <div 
                    className="bg-white dark:bg-gray-850 rounded-lg shadow-xl w-full max-w-lg flex flex-col max-h-[85vh] border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                            {t.importExportTitle}
                        </h3>
                        <button 
                            onClick={() => setShowImportExport(false)}
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
                             value={importText}
                             onChange={(e) => setImportText(e.target.value)}
                         />
                    </div>
                    <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 shrink-0 bg-gray-50 dark:bg-gray-850 rounded-b-lg">
                         <button 
                            onClick={handleCopyConfig}
                            className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            {isCopied ? t.copied : t.copy}
                        </button>
                         <button 
                            onClick={handleSaveAndReload}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-500 transition-colors"
                        >
                            <Save className="w-4 h-4" />
                            {t.saveAndReload}
                        </button>
                    </div>
                </div>
            </div>
      )}
    </div>
  );
};
