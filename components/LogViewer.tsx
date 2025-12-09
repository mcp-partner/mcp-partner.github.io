import React, { useRef, useEffect, useState } from 'react';
import { LogEntry, Language } from '../types';
import { ArrowDown, ArrowUp, Terminal, Trash2, Copy, Check, ChevronRight, ChevronDown } from 'lucide-react';
import { translations } from '../utils/i18n';

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  lang: Language;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, onClear, lang }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const t = translations[lang];
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs.length]); // Only scroll on new logs

  const toggleExpand = (index: number) => {
      const newExpanded = new Set(expanded);
      if (newExpanded.has(index)) {
          newExpanded.delete(index);
      } else {
          newExpanded.add(index);
      }
      setExpanded(newExpanded);
  };

  const handleCopy = (e: React.MouseEvent, log: LogEntry, index: number) => {
      e.stopPropagation();
      
      const payload = {
          timestamp: log.timestamp,
          type: log.type,
          direction: log.direction,
          summary: log.summary,
          message: log.details || null,
          context: log.meta || {}
      };

      navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-700 transition-colors duration-200">
      <div className="h-10 px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
         <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm font-medium">
            <Terminal className="w-4 h-4" />
            <span>{t.console}</span>
            <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-500 px-1.5 rounded text-xs">{logs.length}</span>
         </div>
         <button 
            onClick={onClear}
            className="text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
            title={t.clearConsole}
         >
            <Trash2 className="w-4 h-4" />
         </button>
      </div>
      
      <div className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-1">
        {logs.length === 0 && (
            <div className="text-gray-400 dark:text-gray-600 p-4 text-center italic">{t.unknownMessage} (Empty)</div>
        )}
        
        {logs.map((log, idx) => {
          const isExpanded = expanded.has(idx);
          const hasDetails = !!log.details || !!log.meta;

          return (
            <div 
                key={idx} 
                className={`group border border-transparent hover:bg-gray-100 dark:hover:bg-gray-900/50 rounded px-2 py-1 transition-all cursor-pointer relative ${
                    isExpanded ? 'bg-gray-100 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800' : ''
                }`}
                onClick={() => hasDetails && toggleExpand(idx)}
            >
                <div className="flex items-center gap-2 min-h-[24px]">
                    {/* Expand Icon */}
                    <div className="w-4 flex justify-center shrink-0">
                        {hasDetails && (
                            isExpanded 
                            ? <ChevronDown className="w-3 h-3 text-gray-400" /> 
                            : <ChevronRight className="w-3 h-3 text-gray-400 opacity-50 group-hover:opacity-100" />
                        )}
                    </div>

                    <span className="text-gray-400 dark:text-gray-600 min-w-[65px] shrink-0 select-none">{log.timestamp}</span>
                    
                    <span className={`flex items-center gap-1 uppercase font-bold text-[10px] min-w-[60px] shrink-0 select-none ${
                        log.type === 'error' ? 'text-red-600 dark:text-red-500' :
                        log.type === 'request' ? 'text-blue-600 dark:text-blue-500' :
                        log.type === 'response' ? 'text-green-600 dark:text-green-500' :
                        'text-gray-500 dark:text-gray-400'
                    }`}>
                        {log.direction === 'in' && <ArrowDown className="w-3 h-3" />}
                        {log.direction === 'out' && <ArrowUp className="w-3 h-3" />}
                        {log.type}
                    </span>
                    
                    <span className="text-gray-700 dark:text-gray-300 flex-1 break-all pr-8 line-clamp-1 group-hover:line-clamp-none">{log.summary}</span>

                    {/* Copy Button */}
                    <button
                        onClick={(e) => handleCopy(e, log, idx)}
                        className={`absolute right-2 top-1.5 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-opacity ${
                            copiedIndex === idx ? 'opacity-100 text-green-500' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        title="Copy full details (JSON)"
                    >
                        {copiedIndex === idx ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                </div>

                {isExpanded && (
                    <div className="mt-2 ml-6 animate-in fade-in duration-200 space-y-3 pb-2 cursor-text" onClick={e => e.stopPropagation()}>
                        {log.meta && (
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Context / Meta</div>
                                <pre className="text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-black/20 p-2 rounded overflow-x-auto whitespace-pre-wrap border border-gray-200 dark:border-gray-800/50">
                                    {JSON.stringify(log.meta, null, 2)}
                                </pre>
                            </div>
                        )}
                        {log.details && (
                            <div>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Payload</div>
                                <pre className="text-gray-600 dark:text-gray-300 bg-white dark:bg-black/40 p-2 rounded overflow-x-auto whitespace-pre-wrap border border-gray-200 dark:border-gray-800">
                                    {JSON.stringify(log.details, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};