
import React, { useEffect, useState, useMemo } from 'react';
import { McpTool, Language } from '../types';
import { Play, Code2, Info, Copy, Check, FileText, Braces, Loader2, Terminal } from 'lucide-react';
import { translations } from '../utils/i18n';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

interface RequestPanelProps {
  tool: McpTool | null;
  onExecute: (args: any) => void;
  isExecuting: boolean;
  lang: Language;
  response: { status: 'success' | 'error', data: any } | null;
}

export const RequestPanel: React.FC<RequestPanelProps> = ({ tool, onExecute, isExecuting, lang, response }) => {
  const [argsJson, setArgsJson] = useState('{}');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [mode, setMode] = useState<'form' | 'json'>('form');
  const [copied, setCopied] = useState(false);
  const [responseCopied, setResponseCopied] = useState(false);

  const t = translations[lang];

  // Reset when tool changes
  useEffect(() => {
    if (tool) {
        setArgsJson(JSON.stringify({}, null, 2));
        setJsonError(null);
        setMode('form');
    }
  }, [tool]);

  const handleJsonChange = (val: string) => {
    setArgsJson(val);
    try {
      JSON.parse(val);
      setJsonError(null);
    } catch (e: any) {
      setJsonError(e.message);
    }
  };

  const handleFormChange = (key: string, value: any) => {
    try {
        const currentArgs = JSON.parse(argsJson);
        const newArgs = { ...currentArgs, [key]: value };
        setArgsJson(JSON.stringify(newArgs, null, 2));
        setJsonError(null);
    } catch (e) {
        console.error("Cannot update form: JSON is invalid");
    }
  };

  const handleRun = () => {
    try {
      const parsed = JSON.parse(argsJson);
      onExecute(parsed);
    } catch (e) {
      // should be caught by validation
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(argsJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
    setResponseCopied(true);
    setTimeout(() => setResponseCopied(false), 2000);
  };

  // Memoize schema properties
  const schemaProps = useMemo(() => {
    if (!tool?.inputSchema?.properties) return [];
    return Object.entries(tool.inputSchema.properties).map(([key, val]: [string, any]) => ({
        key,
        ...val,
        required: tool.inputSchema.required?.includes(key) || false
    }));
  }, [tool]);

  // Parse current args safely for form
  const currentArgsObj = useMemo(() => {
    try {
        return JSON.parse(argsJson);
    } catch {
        return null;
    }
  }, [argsJson]);

  if (!tool) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-400 dark:text-gray-500 select-none transition-colors duration-200">
        <Code2 className="w-16 h-16 mb-4 opacity-20" />
        <p className="text-lg">{t.selectTool}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 h-full overflow-hidden transition-colors duration-200">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-850 flex items-start justify-between shadow-sm z-10 shrink-0">
            <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="text-blue-600 dark:text-blue-400 font-mono text-base px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-100 dark:border-blue-800">{t.toolCall}</span>
                    {tool.name}
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 max-w-2xl leading-relaxed">{tool.description}</p>
            </div>
            <button
                onClick={handleRun}
                disabled={!!jsonError || isExecuting}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-md font-bold text-white shadow-lg transition-all transform active:scale-95 ${
                    !!jsonError || isExecuting 
                    ? 'bg-gray-400 dark:bg-gray-700 cursor-not-allowed text-gray-200 dark:text-gray-400' 
                    : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 hover:shadow-blue-500/25'
                }`}
            >
                <Play className={`w-4 h-4 ${isExecuting ? 'hidden' : 'fill-current'}`} />
                {isExecuting ? t.running : t.send}
            </button>
        </div>

        {/* Content - Split View */}
        <div className="flex-1 flex overflow-hidden">
            <PanelGroup direction="horizontal">
                {/* LEFT: INPUT CONFIG */}
                <Panel defaultSize={50} minSize={30} className="flex flex-col bg-white dark:bg-gray-900">
                     {/* Tabs & Toolbar */}
                     <div className="flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-850/80 backdrop-blur-sm shrink-0">
                        <div className="flex space-x-1">
                            <button
                                onClick={() => setMode('form')}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    mode === 'form' 
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400' 
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                }`}
                            >
                                <FileText className="w-4 h-4" />
                                {t.modeForm}
                            </button>
                            <button
                                onClick={() => setMode('json')}
                                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    mode === 'json' 
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400' 
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                }`}
                            >
                                <Braces className="w-4 h-4" />
                                {t.modeJson}
                            </button>
                        </div>

                        <button
                            onClick={copyToClipboard}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            title="Copy JSON to clipboard"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? t.copied : t.copy}
                        </button>
                     </div>

                     <div className="flex-1 relative overflow-hidden">
                        {/* FORM MODE */}
                        {mode === 'form' && (
                            <div className="absolute inset-0 overflow-y-auto p-6">
                                {currentArgsObj === null ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                        <Info className="w-8 h-8 mb-2 text-red-400" />
                                        <p className="text-sm text-center max-w-md">{t.formInvalid}</p>
                                        <button 
                                            onClick={() => setMode('json')}
                                            className="mt-4 text-blue-600 hover:underline text-sm"
                                        >
                                            Switch to JSON View
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-6 max-w-3xl">
                                        {schemaProps.length === 0 && (
                                            <div className="text-gray-400 italic text-sm border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-8 text-center">
                                                This tool takes no arguments.
                                            </div>
                                        )}

                                        {schemaProps.map((prop) => (
                                            <div key={prop.key} className="group">
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-2">
                                                    {prop.key}
                                                    {prop.required && <span className="text-red-500 font-bold" title="Required">*</span>}
                                                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500 ml-auto">{prop.type}</span>
                                                </label>
                                                
                                                {prop.type === 'boolean' ? (
                                                    <div className="flex items-center h-10">
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input 
                                                                type="checkbox" 
                                                                className="sr-only peer"
                                                                checked={currentArgsObj[prop.key] === true}
                                                                onChange={(e) => handleFormChange(prop.key, e.target.checked)}
                                                            />
                                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                                            <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                                                                {currentArgsObj[prop.key] ? 'True' : 'False'}
                                                            </span>
                                                        </label>
                                                    </div>
                                                ) : (
                                                    <input
                                                        type={prop.type === 'integer' || prop.type === 'number' ? 'number' : 'text'}
                                                        value={currentArgsObj[prop.key] !== undefined ? currentArgsObj[prop.key] : ''}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            let finalVal: string | number = val;
                                                            if (prop.type === 'integer') finalVal = parseInt(val) || 0;
                                                            if (prop.type === 'number') finalVal = parseFloat(val) || 0;
                                                            if (val === '' && prop.type === 'string') finalVal = '';
                                                            if (val === '' && (prop.type === 'integer' || prop.type === 'number')) {
                                                                finalVal = val as any; 
                                                            }
                                                            handleFormChange(prop.key, finalVal);
                                                        }}
                                                        placeholder={prop.description}
                                                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-200 text-sm rounded-md focus:ring-blue-500 focus:border-blue-500 block p-2.5 placeholder-gray-400 transition-colors"
                                                    />
                                                )}
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-500 leading-relaxed">{prop.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* JSON MODE */}
                        {mode === 'json' && (
                             <div className="absolute inset-0 p-0">
                                 <textarea 
                                     value={argsJson}
                                     onChange={(e) => handleJsonChange(e.target.value)}
                                     className={`w-full h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-200 font-mono text-sm p-4 resize-none focus:outline-none focus:ring-0 transition-colors ${
                                         jsonError ? 'bg-red-50/50 dark:bg-red-900/10' : ''
                                     }`}
                                     spellCheck={false}
                                 />
                                 {jsonError && (
                                     <div className="absolute bottom-4 left-4 right-4 bg-red-100 dark:bg-red-900/90 text-red-800 dark:text-red-200 px-3 py-2 rounded text-xs border border-red-200 dark:border-red-700 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2">
                                         <strong>{t.jsonError}:</strong> {jsonError}
                                     </div>
                                 )}
                             </div>
                        )}
                     </div>
                </Panel>

                <PanelResizeHandle className="w-1 bg-gray-200 dark:bg-gray-800 hover:bg-blue-500 transition-colors" />

                {/* RIGHT: RESPONSE VIEWER */}
                <Panel defaultSize={50} minSize={20} className="flex flex-col bg-gray-50 dark:bg-gray-950 border-l border-gray-200 dark:border-gray-700">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-100/50 dark:bg-gray-900/50 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-gray-500" />
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">{t.responseOutput}</h3>
                        </div>
                        <button
                            onClick={copyResponse}
                            disabled={!response}
                            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
                            title={t.copyResponse}
                        >
                            {responseCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                            {responseCopied ? t.copied : t.copy}
                        </button>
                    </div>

                    <div className="flex-1 relative overflow-auto p-0">
                        {isExecuting && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 bg-white/50 dark:bg-black/50 backdrop-blur-sm z-20">
                                <Loader2 className="w-8 h-8 mb-2 animate-spin text-blue-500" />
                                <p className="text-sm font-medium">{t.executing}</p>
                            </div>
                        )}

                        {!response && !isExecuting && (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 p-8 text-center">
                                <Terminal className="w-12 h-12 mb-3 opacity-20" />
                                <p className="text-sm">{t.noResponse}</p>
                            </div>
                        )}

                        {response && !isExecuting && (
                            <div className="min-h-full p-4">
                                <div className={`text-xs font-bold uppercase mb-2 tracking-wider ${
                                    response.status === 'success' ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
                                }`}>
                                    {response.status === 'success' ? t.success : t.failed}
                                </div>
                                <pre className={`font-mono text-xs leading-relaxed whitespace-pre-wrap break-words rounded-md p-4 border ${
                                    response.status === 'success' 
                                    ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-300' 
                                    : 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30 text-red-800 dark:text-red-300'
                                }`}>
                                    {JSON.stringify(response.data, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </Panel>
            </PanelGroup>
        </div>
    </div>
  );
};
