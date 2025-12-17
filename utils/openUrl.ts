/**
 * 检测是否运行在 Wails 环境中
 * 同时检查 window['wails'] 和 window.runtime.BrowserOpenURL 以确保兼容性
 */
export const isWails = (): boolean => {
    return typeof window !== 'undefined' && (
        (window['wails'] !== undefined) || 
        (window['runtime'] && window['runtime']['BrowserOpenURL'])
    );
};

/**
 * 打开外部链接的统一函数
 * 在 Wails 环境中使用 window.runtime.BrowserOpenURL
 * 在 Web 环境中不执行任何操作（依赖默认的 target="_blank" 行为）
 * @param url 要打开的链接
 * @returns 是否使用了 Wails 运行时打开链接（true 表示已处理，应阻止默认行为）
 */
export const openUrl = (url: string): boolean => {
    // 检测 Wails 运行时 API 是否可用
    const wailsRuntime = (window as any).runtime;
    if (typeof window !== 'undefined' && wailsRuntime && wailsRuntime['BrowserOpenURL']) {
        try {
            wailsRuntime.BrowserOpenURL(url);
            return true;
        } catch (error) {
            console.error('Failed to open URL via Wails runtime:', error);
            return false;
        }
    }
    return false;
};

/**
 * 强制打开链接（无论环境如何）
 * 在 Wails 环境中使用 window.runtime.BrowserOpenURL
 * 在 Web 环境中使用 window.open 并设置安全特性
 */
export const openUrlExternal = (url: string): void => {
    // 检测 Wails 运行时 API 是否可用
    const wailsRuntime = (window as any).runtime;
    if (typeof window !== 'undefined' && wailsRuntime && wailsRuntime['BrowserOpenURL']) {
        try {
            wailsRuntime.BrowserOpenURL(url);
            return;
        } catch (error) {
            console.error('Failed to open URL via Wails runtime:', error);
        }
    }
    
    // Web 环境或 Wails 失败后的降级方案
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newWindow) {
        console.warn('Popup blocked or window.open failed, falling back to location.href');
        window.location.href = url;
    }
};