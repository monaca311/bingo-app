import React, { useState } from 'react';

interface DevResetTriggerProps {
  onReset: () => void;
}

export const DevResetTrigger: React.FC<DevResetTriggerProps> = ({ onReset }) => {
  const [resetCount, setResetCount] = useState(0);

  const handleDevReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newCount = resetCount + 1;
    setResetCount(newCount);

    if (newCount >= 5) {
      onReset();
      setResetCount(0);
    }
  };

  return (
    <div className="mt-12 text-slate-500 text-[10px] text-center space-y-2 opacity-50">
      <p>素早くダブルタップで穴を開けます。</p>
      <p>穴を開けた場所をダブルタップで穴を閉じます。</p>
      <p>
        ブラウザを閉じても継続できます
        <span
          onClick={handleDevReset}
          className="cursor-default active:bg-slate-700/50"
        >
          。
        </span>
      </p>
    </div>
  );
};