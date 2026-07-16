'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import confetti from 'canvas-confetti';

export default function ScreenPage() {
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [displayNumber, setDisplayNumber] = useState<string | number>('ー');

  // 🌟【バグ3対策】画面切り替え時のタイマーリークを防ぐ useRef
  const rollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const fetchInitialState = async () => {
      const { data } = await supabase
        .from('game_state')
        .select('*')
        .eq('id', 1)
        .single();

      if (data) {
        setDrawnNumbers(data.drawn_numbers || []);
        setIsRolling(data.is_rolling || false);
        if (data.drawn_numbers && data.drawn_numbers.length > 0) {
          const lastNum = data.drawn_numbers[data.drawn_numbers.length - 1];
          setCurrentNumber(lastNum);
          setDisplayNumber(lastNum);
        }
      }
    };

    fetchInitialState();

    const stateChannel = supabase
      .channel('realtime_screen')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state', filter: 'id=eq.1' },
        (payload) => {
          const updated = payload.new as { drawn_numbers: number[]; is_rolling: boolean; session_id: string };
          
          setDrawnNumbers(updated.drawn_numbers || []);
          setIsRolling(updated.is_rolling);

          if (updated.is_rolling) {
            setCurrentNumber(null);
          } else {
            if (updated.drawn_numbers && updated.drawn_numbers.length > 0) {
              const nextNum = updated.drawn_numbers[updated.drawn_numbers.length - 1];
              setCurrentNumber(nextNum);
              setDisplayNumber(nextNum);
              
              // 確定をド派手に祝う紙吹雪！
              confetti({
                particleCount: 120,
                spread: 100,
                origin: { y: 0.55 }
              });
            } else {
              // 🌟【バグ1対応】管理者がリセットしたら自動でスクリーンも初期状態に戻る
              setCurrentNumber(null);
              setDisplayNumber('ー');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(stateChannel);
      // 🌟【バグ3対策】アンマウント時にインターバルを確実にクリア
      if (rollIntervalRef.current) {
        clearInterval(rollIntervalRef.current);
      }
    };
  }, []);

  // スロット回転中の高速数字切り替え演出
  useEffect(() => {
    if (isRolling) {
      rollIntervalRef.current = setInterval(() => {
        setDisplayNumber(Math.floor(Math.random() * 75) + 1);
      }, 40);
    } else {
      if (rollIntervalRef.current) {
        clearInterval(rollIntervalRef.current);
        rollIntervalRef.current = null;
      }
      if (currentNumber !== null) {
        setDisplayNumber(currentNumber);
      }
    }

    return () => {
      if (rollIntervalRef.current) {
        clearInterval(rollIntervalRef.current);
      }
    };
  }, [isRolling, currentNumber]);

  return (
    <main 
      style={{ backgroundColor: '#202666' }} 
      className="min-h-screen relative text-white p-8 flex flex-col justify-between font-sans select-none overflow-hidden"
    >
      
      {/* 背景のきらきら装飾 */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute top-10 left-10 w-3 h-3 bg-white rounded-full animate-ping [animation-duration:3s]" />
        <div className="absolute top-1/4 right-20 w-2 h-2 bg-yellow-300 rounded-full animate-pulse [animation-duration:2s]" />
        <div className="absolute bottom-1/3 left-12 w-1.5 h-1.5 bg-white rounded-full animate-pulse [animation-duration:4s]" />
        <div className="absolute bottom-12 right-1/4 w-3 h-3 bg-purple-300 rounded-full animate-ping [animation-duration:5s]" />
        <div className="absolute top-10 right-10 w-2 h-2 bg-white rounded-full animate-pulse [animation-duration:3.5s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-white/5 rounded-full blur-[150px] pointer-events-none" />
      </div>

      <div className="relative z-10 flex-1 flex flex-col justify-between h-full">
        {/* 1. ヘッダータイトル */}
        <header className="text-center py-2 relative">
          <h1 className="text-5xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500 drop-shadow-[0_4px_12px_rgba(250,204,21,0.3)] animate-pulse">
            KITFES BINGO 2026
          </h1>

          {/* 🌟【UX追加】75個すべて引き終えた時に、ヘッダーに重ねて「ゲーム終了」バナーを表示する */}
          {drawnNumbers.length >= 75 && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#202666]/90 backdrop-blur-md rounded-2xl border border-yellow-400/30 py-2 animate-fade-in shadow-2xl">
              <span className="text-3xl font-black tracking-widest text-yellow-400 animate-bounce">
                🎉 GAME FINISHED 🎉
              </span>
            </div>
          )}
        </header>

        {/* 2. メインの巨大デジタル抽選演出エリア */}
        <div className="flex-1 flex flex-col items-center justify-center my-4">
          <div className="relative flex items-center justify-center">
            {/* 背後でボワッと光るネオンライト */}
            <div className={`absolute w-80 h-80 rounded-full blur-[100px] transition-all duration-1000 ${
              isRolling 
                ? 'bg-amber-500/20 animate-ping' 
                : currentNumber !== null 
                  ? 'bg-yellow-400/30' 
                  : 'bg-slate-800/10'
            }`} />

            {/* メインの巨大な数字表示カード */}
            <div className={`w-96 h-96 rounded-[40px] flex flex-col items-center justify-center border-4 shadow-[0_0_50px_rgba(0,0,0,0.4)] transform transition-all duration-500 backdrop-blur-md ${
              isRolling 
                ? 'bg-black/30 border-amber-500 scale-105 animate-pulse' 
                : currentNumber !== null 
                  ? 'bg-gradient-to-b from-black/20 to-black/40 border-yellow-400 scale-100 shadow-[0_0_80px_rgba(250,204,21,0.25)]' 
                  : 'bg-black/10 border-white/10 scale-95'
            }`}>
              <p className="text-xs font-bold tracking-widest text-white/40 uppercase mb-2">
                {isRolling ? 'ROLLING...' : 'LATEST NUMBER'}
              </p>
              <span className={`text-[160px] font-black leading-none tracking-tight transition-all ${
                isRolling 
                  ? 'text-amber-400 scale-95' 
                  : currentNumber !== null 
                    ? 'text-yellow-400 animate-[bounce_0.5s_ease-out_1]' 
                    : 'text-white/20'
              }`}>
                {displayNumber}
              </span>
            </div>
          </div>
        </div>

        {/* 3. 出現済みの数字ボード（グリッド） */}
        <div className="w-full max-w-7xl mx-auto bg-black/20 border border-white/10 p-6 rounded-[32px] backdrop-blur-md">
          <div className="flex justify-between items-center mb-4 px-2">
            <h2 className="text-sm font-bold text-white/60 tracking-wider">
              BOARD / 出現済みの数字
            </h2>
            <span className="text-xs font-semibold bg-white/10 text-white/60 px-4 py-1.5 rounded-full">
              Drawn: {drawnNumbers.length} / 75
            </span>
          </div>

          {/* JIT記法で横15列を完全にレンダリング */}
          <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-2.5">
            {Array.from({ length: 75 }, (_, i) => i + 1).map((num) => {
              const isDrawn = drawnNumbers.includes(num);
              const isLatest = currentNumber === num && !isRolling;
              return (
                <div
                  key={num}
                  className={`aspect-square flex items-center justify-center rounded-xl text-lg font-black transition-all duration-500 ${
                    isLatest
                      ? 'bg-yellow-400 text-slate-950 scale-110 rotate-3 shadow-[0_0_15px_rgba(250,204,21,0.6)] z-10'
                      : isDrawn
                        ? 'bg-white/10 text-white border border-white/10 animate-scale-up'
                        : 'bg-black/20 text-white/10 border border-white/5'
                  }`}
                >
                  {num}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}