'use client';

import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';

export default function BingoPage() {
  const [card, setCard] = useState<number[][]>([]);
  const [punched, setPunched] = useState<boolean[][]>(
    Array(5).fill(null).map(() => Array(5).fill(false))
  );
  const [isBingo, setIsBingo] = useState(false);
  const [reachCoords, setReachCoords] = useState<string[]>([]); // リーチの座標
  const [lastTap, setLastTap] = useState(0);
  const [resetCount, setResetCount] = useState(0); // リセット用のカウント

  useEffect(() => {
    const savedCard = localStorage.getItem('bingo-card');
    const savedPunched = localStorage.getItem('bingo-punched');

    if (savedCard && savedPunched) {
      const p = JSON.parse(savedPunched);
      setCard(JSON.parse(savedCard));
      setPunched(p);
      checkBingo(p);
    } else {
      const newCard = [0, 1, 2, 3, 4].map(i => {
        const min = i * 15 + 1;
        return Array.from({ length: 15 }, (_, j) => min + j)
          .sort(() => Math.random() - 0.5).slice(0, 5);
      });
      setCard(newCard);
      const initialPunched = Array(5).fill(null).map(() => Array(5).fill(false));
      initialPunched[2][2] = true; // FREE
      setPunched(initialPunched);
      localStorage.setItem('bingo-card', JSON.stringify(newCard));
      localStorage.setItem('bingo-punched', JSON.stringify(initialPunched));
    }
  }, []);

  // リーチ・ビンゴ判定（特定座標を光らせるロジック）
  const checkBingo = (currentPunched: boolean[][]) => {
    let bingoFound = false;
    const newReachCoords: string[] = [];

    const checkLine = (coords: {r: number, c: number}[]) => {
      const punchedInLine = coords.filter(pos => currentPunched[pos.r][pos.c]);
      if (punchedInLine.length === 5) bingoFound = true;
      if (punchedInLine.length === 4) {
        const missing = coords.find(pos => !currentPunched[pos.r][pos.c]);
        if (missing) newReachCoords.push(`${missing.r}-${missing.c}`);
      }
    };

    for (let i = 0; i < 5; i++) {
      checkLine([0, 1, 2, 3, 4].map(j => ({ r: i, c: j }))); // 横
      checkLine([0, 1, 2, 3, 4].map(j => ({ r: j, c: i }))); // 縦
    }
    checkLine([0, 1, 2, 3, 4].map(i => ({ r: i, c: i })));
    checkLine([0, 1, 2, 3, 4].map(i => ({ r: i, c: 4 - i })));

    if (bingoFound) {
      if (!isBingo) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        setIsBingo(true);
      }
      setReachCoords([]);
    } else {
      setReachCoords(newReachCoords);
    }
  };

  const handlePunch = (colIndex: number, rowIndex: number) => {
    if (punched[rowIndex][colIndex]) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      const next = [...punched.map(row => [...row])];
      next[rowIndex][colIndex] = true;
      setPunched(next);
      localStorage.setItem('bingo-punched', JSON.stringify(next));
      checkBingo(next);
      if (window.navigator.vibrate) window.navigator.vibrate([30, 10, 30]);
    }
    setLastTap(now);
  };

  const devReset = () => {
  const newCount = resetCount + 1;
  setResetCount(newCount);

  // 5回タップされたらリセット処理へ
  if (newCount >= 5) {
    if (confirm('【運営用】カードを初期化して新しく作り直しますか？')) {
      localStorage.clear();
      window.location.reload();
    }
    setResetCount(0); // キャンセルしてもカウントは戻しておく
  }

  // 3秒間タップがなかったらカウントをリセットする（おまけの安心機能）
  setTimeout(() => setResetCount(0), 3000);
};

  if (card.length === 0) return null;

  return (
    <main className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center font-sans select-none overflow-x-hidden">
      <div className="text-center mb-8">
        <h1 onClick={devReset} className="text-4xl font-black italic text-yellow-400 cursor-pointer">KITFES BINGO</h1>
        {isBingo && <p className="text-5xl font-black text-orange-500 animate-bounce mt-4">BINGO!!</p>}
      </div>
      
      {/* ビンゴカード */}
      <div className={`grid grid-cols-5 gap-2 bg-slate-800 p-4 rounded-2xl shadow-2xl border-4 transition-all
        ${isBingo ? 'border-orange-500' : reachCoords.length > 0 ? 'border-yellow-400' : 'border-slate-700'}`}>
        
        {['B', 'I', 'N', 'G', 'O'].map(h => (
          <div key={h} className="text-center font-black text-2xl text-slate-500 pb-2">{h}</div>
        ))}
        
        {punched.map((row, rowIndex) => (
          row.map((isPunched, colIndex) => {
            const isFree = rowIndex === 2 && colIndex === 2;
            const isTarget = reachCoords.includes(`${rowIndex}-${colIndex}`);
            
            return (
              <button
                key={`${rowIndex}-${colIndex}`}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => handlePunch(colIndex, rowIndex)}
                style={{ WebkitTouchCallout: 'none' }}
                className={`relative w-14 h-14 sm:w-20 sm:h-20 rounded-xl font-black text-xl transition-all duration-300
                  ${isPunched 
                    ? 'bg-slate-900 text-yellow-600 shadow-inner scale-95' 
                    : isTarget && !isBingo 
                      ? 'bg-yellow-400 text-slate-900 shadow-[0_0_20px_#facc15] animate-pulse scale-105 z-20' 
                      : 'bg-gradient-to-br from-slate-600 to-slate-700 text-white shadow-lg active:scale-90'}
                `}
              >
                {isPunched && !isFree && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-30">
                    <div className="w-12 h-12 bg-black rounded-full border-4 border-slate-800" />
                  </div>
                )}
                <span className="relative z-10">{isFree ? 'FREE' : card[colIndex][rowIndex]}</span>
              </button>
            );
          })
        ))}
      </div>

      <div className="mt-8 text-slate-500 text-[10px] text-center space-y-2">
        <p>【操作】素早く「2回タップ」で穴を開けます</p>
        {reachCoords.length > 0 && !isBingo && <p className="text-yellow-400 font-bold animate-pulse">あと少し！光っている数字を狙え！</p>}
      </div>
    </main>
  );
}