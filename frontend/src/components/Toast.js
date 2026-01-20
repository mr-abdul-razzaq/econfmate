import React, { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';

const Toast = () => {
    const { toasts, removeToast } = useToast();

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
            ))}
        </div>
    );
};

const ToastItem = ({ toast, onRemove }) => {
    const [isExiting, setIsExiting] = useState(false);
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        if (toast.duration > 0) {
            const startTime = Date.now();
            const interval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, 100 - (elapsed / toast.duration) * 100);
                setProgress(remaining);

                if (remaining <= 0) {
                    clearInterval(interval);
                }
            }, 50);

            return () => clearInterval(interval);
        }
    }, [toast.duration]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => onRemove(toast.id), 200);
    };

    const variants = {
        success: {
            bg: 'bg-gradient-to-r from-green-500 to-emerald-500',
            icon: '✓',
            iconBg: 'bg-green-600',
            progressBg: 'bg-green-300'
        },
        error: {
            bg: 'bg-gradient-to-r from-red-500 to-rose-500',
            icon: '✕',
            iconBg: 'bg-red-600',
            progressBg: 'bg-red-300'
        },
        warning: {
            bg: 'bg-gradient-to-r from-yellow-500 to-amber-500',
            icon: '⚠',
            iconBg: 'bg-yellow-600',
            progressBg: 'bg-yellow-300'
        },
        info: {
            bg: 'bg-gradient-to-r from-blue-500 to-indigo-500',
            icon: 'ℹ',
            iconBg: 'bg-blue-600',
            progressBg: 'bg-blue-300'
        }
    };

    const variant = variants[toast.type] || variants.info;

    return (
        <div
            className={`
        pointer-events-auto min-w-[320px] max-w-[450px] rounded-xl shadow-2xl overflow-hidden
        transform transition-all duration-300 ease-out
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
        ${variant.bg}
      `}
            style={{
                animation: isExiting ? 'none' : 'slideIn 0.3s ease-out'
            }}
        >
            <div className="flex items-start gap-3 p-4 text-white">
                {/* Icon */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full ${variant.iconBg} flex items-center justify-center text-white font-bold shadow-inner`}>
                    {variant.icon}
                </div>

                {/* Message */}
                <div className="flex-1 pt-1">
                    <p className="text-sm font-medium leading-relaxed break-words">
                        {toast.message}
                    </p>
                </div>

                {/* Close Button */}
                <button
                    onClick={handleClose}
                    className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                >
                    <span className="text-white text-sm">×</span>
                </button>
            </div>

            {/* Progress Bar */}
            {toast.duration > 0 && (
                <div className="h-1 bg-black/10">
                    <div
                        className={`h-full ${variant.progressBg} transition-all duration-100 ease-linear`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}

            <style jsx>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
        </div>
    );
};

export default Toast;
