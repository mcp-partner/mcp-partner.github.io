import React from 'react';
import { McpTool, Language } from '../types';
import { Wrench, Search, Box } from 'lucide-react';
import { translations } from '../utils/i18n';

interface SidebarProps {
  tools: McpTool[];
  selectedTool: McpTool | null;
  onSelectTool: (tool: McpTool) => void;
  loading: boolean;
  lang: Language;
}

export const Sidebar: React.FC<SidebarProps> = ({ tools, selectedTool, onSelectTool, loading, lang }) => {
  const [filter, setFilter] = React.useState('');
  const t = translations[lang];

  const filteredTools = tools.filter(t => 
    t.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="w-full bg-gray-50 dark:bg-gray-850 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full transition-colors duration-200">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Box className="w-4 h-4" />
            {t.availableTools}
        </h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input 
            type="text" 
            placeholder={t.filterTools}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md py-2 pl-9 pr-3 text-sm text-gray-900 dark:text-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-600"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
             <div className="p-4 text-center text-gray-500 text-sm animate-pulse">{t.fetchingTools}</div>
        )}

        {!loading && filteredTools.length === 0 && (
            <div className="p-4 text-center text-gray-500 dark:text-gray-600 text-sm italic">
                {tools.length === 0 ? t.noTools : t.noMatchingTools}
            </div>
        )}

        {filteredTools.map((tool) => (
          <button
            key={tool.name}
            onClick={() => onSelectTool(tool)}
            className={`w-full text-left px-3 py-2.5 rounded-md flex items-start gap-3 transition-colors ${
              selectedTool?.name === tool.name
                ? 'bg-blue-50 dark:bg-blue-600/10 border border-blue-200 dark:border-blue-600/30 text-blue-700 dark:text-blue-200'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent'
            }`}
          >
            <Wrench className={`w-4 h-4 mt-1 ${selectedTool?.name === tool.name ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{tool.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-500 truncate">{tool.description || 'No description'}</div>
            </div>
          </button>
        ))}
      </div>
      
      <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-600 text-center">
        {tools.length} {t.toolsLoaded}
      </div>
    </div>
  );
};
