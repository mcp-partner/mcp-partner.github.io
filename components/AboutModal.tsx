import React from 'react';
import { X, ExternalLink, Github, Book } from 'lucide-react';
import { translations } from '../utils/i18n';
import { Language } from '../types';
import { APP_VERSION, REPO_URL } from '../constants';
import { openUrl } from '../utils/openUrl';

interface AboutModalProps {
    onClose: () => void;
    lang: Language;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose, lang }) => {
    const t = translations[lang];

    return (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div 
                className="bg-white dark:bg-gray-850 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header with Background Pattern */}
                <div className="relative bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-center overflow-hidden">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
                    
                    <button 
                        onClick={onClose}
                        className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-20 h-20 bg-white rounded-2xl shadow-lg p-2 mb-4 flex items-center justify-center transform transition-transform hover:scale-105 duration-300">
                             {/* Use relative path for icon.svg to support GH Pages subpath deployment */}
                             <img src="icon.svg" alt="MCP Partner" className="w-full h-full" />
                        </div>
                        <h2 className="text-2xl font-black text-white tracking-tight">MCP Partner</h2>
                        <div className="mt-1 flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-800/50 rounded-full border border-blue-400/30">
                            <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">{t.version} {APP_VERSION}</span>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col gap-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300 text-center leading-relaxed">
                        {t.aboutDesc}
                    </p>

                    <a 
                        href="docs.html" 
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => { if (openUrl('https://ericwyn.github.io/mcp-partner/docs.html')) e.preventDefault(); }}
                        className="flex items-center justify-center gap-2 w-full py-2.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-semibold rounded-xl transition-all group"
                    >
                        <Book className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        {t.readDocs}
                    </a>

                    <div className="border-t border-gray-100 dark:border-gray-700 pt-4 mt-2">
                        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                            <span>{t.createdBy} <a href="https://github.com/Ericwyn" target="_blank" onClick={(e) => { if (openUrl('https://github.com/Ericwyn')) e.preventDefault(); }} className="font-medium text-gray-900 dark:text-gray-200 hover:underline">@Ericwyn</a></span>
                            <a 
                                href={REPO_URL} 
                                target="_blank"
                                rel="noopener noreferrer" 
                                onClick={(e) => { if (openUrl(REPO_URL)) e.preventDefault(); }}
                                className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                            >
                                <Github className="w-3.5 h-3.5" />
                                {t.visitRepo}
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};