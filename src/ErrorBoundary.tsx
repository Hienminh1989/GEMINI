import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full text-center border border-slate-100">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              ⚠️
            </div>
            <h1 className="text-lg font-bold text-slate-800 mb-2">ĐÃ XẢY RA LỖI TẢI GIAO DIỆN</h1>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Trình duyệt trên thiết bị của bạn gặp sự cố khi dựng giao diện. Bạn vui lòng bấm nút tải lại bên dưới.
            </p>
            {this.state.error && (
              <pre className="text-[10px] text-red-600 bg-red-50 p-2.5 rounded-lg mb-4 text-left overflow-auto max-h-24 whitespace-pre-wrap font-mono">
                {this.state.error.message || this.state.error.toString()}
              </pre>
            )}
            <div className="space-y-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl font-bold text-sm shadow-md transition-all"
              >
                Tải lại ứng dụng
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.clear();
                    sessionStorage.clear();
                  } catch (e) {}
                  window.location.reload();
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 active:scale-98 text-slate-700 rounded-xl font-semibold text-xs transition-all"
              >
                Xóa bộ nhớ đệm & Tải lại
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
