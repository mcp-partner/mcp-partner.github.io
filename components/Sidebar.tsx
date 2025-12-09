

import React from 'react';
import { McpTool, McpResource, McpPrompt, Language } from '../types';
import { Wrench, Search, Box, Database, MessageSquare } from 'lucide-react';
import { translations } from '../utils/i18n';

interface SidebarProps {
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
  
  selectedItem: McpTool | McpResource | McpPrompt | null;
  onSelectItem: (item: McpTool | McpResource | McpPrompt) => void;
  
  loading: boolean;
  lang: Language;
  
  activeTab: 'tools' | 'resources' | 'prompts';
  setActiveTab: (tab: 'tools' | 'resources' | 'prompts') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
    tools, 
    resources, 
    prompts,
    selectedItem, 
    onSelectItem, 
    loading, 
    lang,
    activeTab,
    setActiveTab
}) => {
  const [filter, setFilter] = React.useState('');
  const t = translations[lang];

  let currentItems: (McpTool | McpResource | McpPrompt)[] = [];
  let noItemsMessage = '';
  
  if (activeTab === 'tools') {
      currentItems = tools;
      noItemsMessage = t.noTools;
  } else if (activeTab === 'resources') {
      currentItems = resources;
      noItemsMessage = t.noResources;
  } else {
      currentItems = prompts;
      noItemsMessage = t.noPrompts;
  }

  const filteredItems = currentItems.filter(item => 
    item.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="w-full h-full flex bg-gray-50 dark:bg-gray-850 border-r border-gray-200 dark:border-gray-700 transition-colors duration-200">
        
        {/* Vertical Navigation Bar */}
        <div className="w-10 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col items-center py-2 gap-2 shrink-0">
            <button 
                onClick={() => setActiveTab('tools')}
                className={`flex flex-col items-center gap-1.5 py-3 w-8 rounded-md transition-all ${
                    activeTab === 'tools' 
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 shadow-sm' 
                    : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-gray-400'
                }`}
                title={t.tools}
            >
                 <Wrench className="w-4 h-4" />
                 <span className="text-[10px] font-medium leading-none [writing-mode:vertical-rl] tracking-wide h-16 flex items-center justify-center">
                    {t.tools} ({tools.length})
                 </span>
            </button>

            <button 
                onClick={() => setActiveTab('resources')}
                className={`flex flex-col items-center gap-1.5 py-3 w-8 rounded-md transition-all ${
                    activeTab === 'resources' 
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 shadow-sm' 
                    : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-gray-400'
                }`}
                title={t.resources}
            >
                 <Database className="w-4 h-4" />
                 <span className="text-[10px] font-medium leading-none [writing-mode:vertical-rl] tracking-wide h-20 flex items-center justify-center">
                    {t.resources} ({resources.length})
                 </span>
            </button>

            <button 
                onClick={() => setActiveTab('prompts')}
                className={`flex flex-col items-center gap-1.5 py-3 w-8 rounded-md transition-all ${
                    activeTab === 'prompts' 
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 shadow-sm' 
                    : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-gray-400'
                }`}
                title={t.prompts}
            >
                 <MessageSquare className="w-4 h-4" />
                 <span className="text-[10px] font-medium leading-none [writing-mode:vertical-rl] tracking-wide h-20 flex items-center justify-center">
                    {t.prompts} ({prompts.length})
                 </span>
            </button>
        </div>

        {/* List Content */}
        <div className="flex-1 flex flex-col min-w-0">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    {activeTab === 'tools' && <Wrench className="w-4 h-4" />}
                    {activeTab === 'resources' && <Database className="w-4 h-4" />}
                    {activeTab === 'prompts' && <MessageSquare className="w-4 h-4" />}
                    
                    {activeTab === 'tools' && t.availableTools}
                    {activeTab === 'resources' && t.availableResources}
                    {activeTab === 'prompts' && t.availablePrompts}
                </h2>
                <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input 
                    type="text" 
                    placeholder={t.filter}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md py-2 pl-9 pr-3 text-sm text-gray-900 dark:text-gray-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-600"
                />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {loading && (
                    <div className="p-4 text-center text-gray-500 text-sm animate-pulse">{t.fetching}</div>
                )}

                {!loading && filteredItems.length === 0 && (
                    <div className="p-4 text-center text-gray-500 dark:text-gray-600 text-sm italic">
                        {currentItems.length === 0 ? noItemsMessage : t.noMatchingItems}
                    </div>
                )}

                {filteredItems.map((item) => (
                <button
                    key={item.name}
                    onClick={() => onSelectItem(item)}
                    className={`w-full text-left px-3 py-2.5 rounded-md flex items-start gap-3 transition-colors ${
                    selectedItem?.name === item.name
                        ? 'bg-blue-50 dark:bg-blue-600/10 border border-blue-200 dark:border-blue-600/30 text-blue-700 dark:text-blue-200'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200 border border-transparent'
                    }`}
                >
                    <div className={`mt-1 ${selectedItem?.name === item.name ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                        {activeTab === 'tools' && <Wrench className="w-4 h-4" />}
                        {activeTab === 'resources' && <Database className="w-4 h-4" />}
                        {activeTab === 'prompts' && <MessageSquare className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{item.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-500 truncate">{item.description || t.noDescription}</div>
                    </div>
                </button>
                ))}
            </div>
            
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-600 text-center">
                {currentItems.length} {t.itemsLoaded}
            </div>
        </div>
    </div>
  );
};