import React from 'react';

interface BingoBoardProps {
  card: number[][];
  punched: boolean[][];
  isBingo: boolean;
  reachCoords: string[];
  onPunch: (colIndex: number, rowIndex: number) => void;
}

export const BingoBoard: React.FC<BingoBoardProps> = ({
  card,
  punched,
  isBingo,
  reachCoords,
  onPunch,
}) => {
  return (
    <div
      className={`grid grid-cols-5 gap-2 bg-slate-800 p-4 rounded-2xl shadow-2xl border-4 transition-all ${
        isBingo
          ? 'border-orange-500'
          : reachCoords.length > 0
          ? 'border-yellow-400'
          : 'border-slate-700'
      }`}
    >
      {['B', 'I', 'N', 'G', 'O'].map(h => (
        <div key={h} className="text-center font-black text-2xl text-slate-500 pb-2">
          {h}
        </div>
      ))}

      {punched.map((row, rowIndex) =>
        row.map((isPunched, colIndex) => {
          const isFree = rowIndex === 2 && colIndex === 2;
          const isTarget = reachCoords.includes(`${rowIndex}-${colIndex}`);

          return (
            <button
              key={`${rowIndex}-${colIndex}`}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => onPunch(colIndex, rowIndex)}
              style={{ WebkitTouchCallout: 'none' }}
              className={`relative w-14 h-14 sm:w-20 sm:h-20 rounded-xl font-black text-xl transition-all duration-300 ${
                isPunched
                  ? 'bg-slate-900 text-yellow-600 shadow-inner scale-95'
                  : isTarget && !isBingo
                  ? 'bg-yellow-400 text-slate-900 shadow-[0_0_20px_#facc15] animate-pulse scale-105 z-20'
                  : 'bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-lg active:scale-90'
              }`}
            >
              {isPunched && !isFree && (
                <div className="absolute inset-0 flex items-center justify-center opacity-30">
                  <div className="w-12 h-12 bg-black rounded-full border-4 border-slate-800" />
                </div>
              )}
              <span className="relative z-10">
                {isFree ? 'FREE' : card[colIndex][rowIndex]}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
};