import React, { useRef, useEffect } from 'react';
import { LogEntry, Language } from '../types';
import { ArrowDown, ArrowUp, Terminal, Trash2 } from 'lucide-react';
import { translations } from '../utils/i18n';

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  lang: Language;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, onClear, lang }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const t = translations[lang];

  useEffect(() => {
    if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-700 transition-colors duration-200">
      <div className="h-10 px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
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
        
        {logs.map((log, idx) => (
          <div key={idx} className="group border-b border-gray-200/50 dark:border-gray-800/50 pb-1 last:border-0 hover:bg-gray-100 dark:hover:bg-gray-900/50 rounded px-2 py-1 transition-colors">
            <div className="flex items-start gap-2">
                <span className="text-gray-500 dark:text-gray-600 min-w-[70px]">{log.timestamp}</span>
                <span className={`flex items-center gap-1 uppercase font-bold text-[10px] min-w-[60px] ${
                    log.type === 'error' ? 'text-red-600 dark:text-red-500' :
                    log.type === 'request' ? 'text-blue-600 dark:text-blue-500' :
                    log.type === 'response' ? 'text-green-600 dark:text-green-500' :
                    'text-gray-500 dark:text-gray-400'
                }`}>
                    {log.direction === 'in' && <ArrowDown className="w-3 h-3" />}
                    {log.direction === 'out' && <ArrowUp className="w-3 h-3" />}
                    {log.type}
                </span>
                <span className="text-gray-800 dark:text-gray-300 flex-1 break-all">{log.summary}</span>
            </div>
            {log.details && (
                <div className="mt-1 pl-[140px] hidden group-hover:block animate-in fade-in duration-200">
                    <pre className="text-gray-600 dark:text-gray-500 bg-gray-100 dark:bg-black/30 p-2 rounded overflow-x-auto whitespace-pre-wrap border border-gray-200 dark:border-gray-800">
                        {JSON.stringify(log.details, null, 2)}
                    </pre>
                </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
