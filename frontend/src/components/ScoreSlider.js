import React, { useState, useRef, useEffect, useCallback } from 'react';

const ScoreSlider = ({
    value = 5,
    onChange,
    min = 1,
    max = 10,
    label = 'Score',
    showLabels = true
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [animatedValue, setAnimatedValue] = useState(value);
    const sliderRef = useRef(null);
    
    // Store latest values in refs to avoid stale closures
    const valueRef = useRef(value);
    const onChangeRef = useRef(onChange);
    
    useEffect(() => {
        valueRef.current = value;
        onChangeRef.current = onChange;
    }, [value, onChange]);

    // Animate value changes
    useEffect(() => {
        setAnimatedValue(value);
    }, [value]);

    const getColorForScore = (score) => {
        const normalized = (score - min) / (max - min);
        if (normalized <= 0.33) {
            return { from: '#ef4444', to: '#f97316' }; // red to orange
        } else if (normalized <= 0.66) {
            return { from: '#f97316', to: '#eab308' }; // orange to yellow
        } else {
            return { from: '#eab308', to: '#22c55e' }; // yellow to green
        }
    };

    const getGradientForValue = (val) => {
        const colors = getColorForScore(val);
        const percentage = ((val - min) / (max - min)) * 100;
        return `linear-gradient(90deg, ${colors.from} 0%, ${colors.to} ${percentage}%, #e5e7eb ${percentage}%)`;
    };

    const getScoreLabel = (score) => {
        if (score <= 3) return 'Poor';
        if (score <= 5) return 'Average';
        if (score <= 7) return 'Good';
        if (score <= 9) return 'Very Good';
        return 'Excellent';
    };

    const updateValue = useCallback((e) => {
        if (!sliderRef.current) return;

        const rect = sliderRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percentage = Math.max(0, Math.min(1, x / rect.width));
        const newValue = Math.round(min + percentage * (max - min));

        if (newValue !== valueRef.current && onChangeRef.current) {
            onChangeRef.current(newValue);
        }
    }, [min, max]);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        updateValue(e);
    };

    const handleTouchStart = (e) => {
        setIsDragging(true);
        updateValue(e.touches[0]);
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            updateValue(e);
        };

        const handleTouchMove = (e) => {
            updateValue(e.touches[0]);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchmove', handleTouchMove);
            document.addEventListener('touchend', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging, updateValue]);

    const thumbPosition = ((animatedValue - min) / (max - min)) * 100;
    const colors = getColorForScore(animatedValue);

    return (
        <div className="w-full">
            {/* Label */}
            {label && (
                <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium text-gray-700">
                        {label} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                        <span
                            className="text-xs font-medium px-2 py-1 rounded-full"
                            style={{
                                backgroundColor: `${colors.to}20`,
                                color: colors.to
                            }}
                        >
                            {getScoreLabel(animatedValue)}
                        </span>
                    </div>
                </div>
            )}

            {/* Score Display */}
            <div className="flex items-center gap-4 mb-3">
                <div
                    className="text-4xl font-bold transition-all duration-200"
                    style={{ color: colors.to }}
                >
                    {animatedValue}
                </div>
                <span className="text-gray-400 text-xl">/</span>
                <span className="text-gray-400 text-xl">{max}</span>
            </div>

            {/* Slider Track */}
            <div
                ref={sliderRef}
                className="relative h-3 rounded-full cursor-pointer select-none"
                style={{ background: getGradientForValue(animatedValue) }}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            >
                {/* Step Markers */}
                <div className="absolute inset-0 flex justify-between items-center px-0.5">
                    {Array.from({ length: max - min + 1 }, (_, i) => (
                        <div
                            key={i}
                            className={`w-1 h-1 rounded-full transition-all duration-200 ${i + min <= animatedValue ? 'bg-white/50' : 'bg-gray-400/30'
                                }`}
                        />
                    ))}
                </div>

                {/* Thumb */}
                <div
                    className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full shadow-lg border-2 border-white transition-all duration-100 ${isDragging ? 'scale-125 shadow-xl' : 'hover:scale-110'
                        }`}
                    style={{
                        left: `calc(${thumbPosition}% - 12px)`,
                        backgroundColor: colors.to,
                        boxShadow: isDragging ? `0 0 20px ${colors.to}50` : undefined
                    }}
                >
                    {/* Pulse Animation when dragging */}
                    {isDragging && (
                        <div
                            className="absolute inset-0 rounded-full animate-ping opacity-30"
                            style={{ backgroundColor: colors.to }}
                        />
                    )}
                </div>
            </div>

            {/* Min/Max Labels */}
            {showLabels && (
                <div className="flex justify-between mt-2 text-xs text-gray-500">
                    <span>Poor</span>
                    <span>Excellent</span>
                </div>
            )}
        </div>
    );
};

export default ScoreSlider;
