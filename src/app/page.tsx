'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import confetti from 'canvas-confetti';

type GameMode = 'digital' | 'card_only';

export default function BingoCardPage() {
  const [card, setCard] = useState<number[][] | null>(null);
  const [punched, setPunched] = useState<boolean[][]>([]);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [gameMode, setGameMode] = useState<GameMode>('card_only');
  const [cardId, setCardId] = useState<string>('');
  const [isDistributing, setIsDistributing] = useState<boolean>(true);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [isReach, setIsReach] = useState<boolean>(false);
  const [isBingo, setIsBingo] = useState<boolean>(false);
  const [showBingoModal, setShowBingoModal] = useState<boolean>(false);
  const [reachCells, setReachCells] = useState<Set<string>>(new Set());
  const [hasSentBingo, setHasSentBingo] = useState<boolean>(false);

  useEffect(() => {
    const initCard = async () => {
      const { data: stateData } = await supabase
        .from('game_state')
        .select('session_id, is_distributing, drawn_numbers, game_mode')
        .eq('id', 1)
        .single();

      const currentSessionId = stateData?.session_id || 'default';
      const distributing = stateData?.is_distributing ?? true;
      const mode = (stateData?.game_mode as GameMode) || 'card_only';
      
      setGameMode(mode);
      setIsDistributing(distributing);
      setDrawnNumbers(stateData?.drawn_numbers || []);

      const savedSessionId = localStorage.getItem('bingo-session-id');
      const savedCard = localStorage.getItem('bingo-card');
      const savedPunched = localStorage.getItem('bingo-punched');
      const savedId = localStorage.getItem('bingo-card-id');
      const savedHasSent = localStorage.getItem('bingo-has-sent') === 'true';

      setHasSentBingo(savedHasSent);

      if (savedSessionId === currentSessionId && savedCard && savedPunched && savedId) {
        setCard(JSON.parse(savedCard));
        const parsedPunched = JSON.parse(savedPunched);
        setPunched(parsedPunched);
        setCardId(savedId);
        checkGameState(parsedPunched, false, savedHasSent, mode, savedId);
        setIsLoading(false);
      } else {
        if (!distributing) {
          setIsClosed(true);
          setIsLoading(false);
          return;
        }
        await createNewCard(currentSessionId, mode);
        setIsLoading(false);
      }
    };

    initCard();

    const channel = supabase
      .channel('realtime_game_state_user')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state', filter: 'id=eq.1' },
        async (payload) => {
          const updated = payload.new as {
            session_id: string;
            is_distributing: boolean;
            drawn_numbers: number[];
            game_mode: GameMode;
          };

          setIsDistributing(updated.is_distributing);
          setDrawnNumbers(updated.drawn_numbers || []);
          setGameMode(updated.game_mode || 'card_only');

          const savedSessionId = localStorage.getItem('bingo-session-id');
          if (updated.session_id && savedSessionId !== updated.session_id) {
            localStorage.clear();
            setCardId('');
            setIsBingo(false);
            setIsReach(false);
            setHasSentBingo(false);
            setShowBingoModal(false);

            if (!updated.is_distributing) {
              setIsClosed(true);
              setCard(null);
            } else {
              setIsClosed(false);
              await createNewCard(updated.session_id, updated.game_mode);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const createNewCard = async (sessionId: string, currentMode: GameMode) => {
    try {
      const { getUniqueCard } = await import('../actions/getUniqueCard');
      const uniqueCard = await getUniqueCard();
      setCard(uniqueCard);

      const initialPunched = Array(5).fill(null).map(() => Array(5).fill(false));
      initialPunched[2][2] = true;
      setPunched(initialPunched);

      const { data, error } = await supabase
        .from('active_bingos')
        .insert([{ card_no: 'ISSUED' }])
        .select('id')
        .single();

      if (error || !data) throw new Error('IDの発行に失敗しました');

      const uniqueId = `DG-${data.id}`;
      setCardId(uniqueId);

      await supabase
        .from('active_bingos')
        .update({ card_no: uniqueId })
        .eq('id', data.id);

      localStorage.setItem('bingo-card', JSON.stringify(uniqueCard));
      localStorage.setItem('bingo-punched', JSON.stringify(initialPunched));
      localStorage.setItem('bingo-card-id', uniqueId);
      localStorage.setItem('bingo-session-id', sessionId);
    } catch (err) {
      console.error(err);
      alert('カードの発行に失敗しました。再読み込みしてください。');
    }
  };

  const handleCellClick = (row: number, col: number) => {
    if (!card || (row === 2 && col === 2)) return;

    const targetNumber = card[row][col];

    // デジタルモード時は抽選済み数字のみ穴あけ可能
    if (gameMode === 'digital' && !drawnNumbers.includes(targetNumber)) {
      return;
    }

    const newPunched = punched.map((r, ri) =>
      r.map((c, ci) => (ri === row && ci === col ? !c : c))
    );
    setPunched(newPunched);
    localStorage.setItem('bingo-punched', JSON.stringify(newPunched));

    checkGameState(newPunched, true, hasSentBingo, gameMode, cardId);
  };

  const checkGameState = (
    currentPunched: boolean[][],
    triggerEffects: boolean = false,
    alreadySent: boolean = false,
    mode: GameMode = gameMode,
    currentId: string = cardId
  ) => {
    let hasBingo = false;
    const newReachCells = new Set<string>();

    const lines: [number, number][][] = [];
    for (let r = 0; r < 5; r++) lines.push([[r, 0], [r, 1], [r, 2], [r, 3], [r, 4]]);
    for (let c = 0; c < 5; c++) lines.push([[0, c], [1, c], [2, c], [3, c], [4, c]]);
    lines.push([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);
    lines.push([[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]]);

    for (const line of lines) {
      const unpunched = line.filter(([r, c]) => !currentPunched[r][c]);
      if (unpunched.length === 0) hasBingo = true;
      if (unpunched.length === 1) {
        const [r, c] = unpunched[0];
        newReachCells.add(`${r}-${c}`);
      }
    }

    const wasReach = isReach;
    const wasBingo = isBingo;

    setIsBingo(hasBingo);

    if (hasBingo) {
      setReachCells(new Set());
      setIsReach(false);

      if (!alreadySent) {
        setHasSentBingo(true);
        localStorage.setItem('bingo-has-sent', 'true');

        if (triggerEffects && !wasBingo) {
          setShowBingoModal(true);
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }

        // デジタルモード時は管理画面へリアルタイム当選通知
        if (mode === 'digital' && currentId) {
          supabase
            .from('active_bingos')
            .insert([{ card_no: currentId }]);
        }
      }
    } else {
      setReachCells(newReachCells);
      const nowReach = newReachCells.size > 0;
      setIsReach(nowReach);

      if (triggerEffects && nowReach && !wasReach && window.navigator.vibrate) {
        window.navigator.vibrate([80, 50, 80]);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#202666] text-white flex items-center justify-center font-sans">
        <p className="text-xl font-bold animate-pulse text-yellow-400">カード読み込み中...</p>
      </div>
    );
  }

  if (isClosed && !card) {
    return (
      <main style={{ backgroundColor: '#202666' }} className="min-h-screen text-white p-6 flex flex-col items-center justify-center font-sans text-center">
        <div className="max-w-sm bg-black/40 border border-white/10 p-8 rounded-3xl backdrop-blur-md">
          <span className="text-4xl">🛑</span>
          <h1 className="text-2xl font-black mt-4 mb-2 text-rose-400">カード配布は終了しました</h1>
          <p className="text-xs text-white/60 leading-relaxed">
            抽選が開始されたため、新規のビンゴカード発行は締め切られました。
          </p>
        </div>
      </main>
    );
  }

  if (!card) return null;

  return (
    <main style={{ backgroundColor: '#202666' }} className="min-h-screen relative text-white p-4 flex flex-col items-center justify-center font-sans select-none overflow-hidden">
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute top-10 left-10 w-2 h-2 bg-white rounded-full animate-ping [animation-duration:3s]" />
        <div className="absolute top-1/4 right-12 w-1.5 h-1.5 bg-yellow-300 rounded-full animate-pulse [animation-duration:2s]" />
        <div className="absolute bottom-1/3 left-8 w-1 h-1 bg-white rounded-full animate-pulse [animation-duration:4s]" />
        <div className="absolute bottom-12 right-20 w-2 h-2 bg-purple-300 rounded-full animate-ping [animation-duration:5s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        <div className="mb-2 flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/10 px-4 py-1.5 rounded-full shadow-inner">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-[11px] font-semibold tracking-wider text-white/70">
            CARD ID: <span className="text-white font-mono text-[13px] font-black">{cardId}</span>
          </p>
        </div>

        <div className="w-full h-14 flex items-center justify-center mb-3">
          {isReach && !isBingo ? (
            <div className="bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 text-white border border-rose-400/30 px-8 py-2.5 rounded-2xl text-sm font-black tracking-[0.2em] shadow-[0_0_20px_rgba(244,63,94,0.6)] animate-bounce flex items-center gap-2">
              <span className="animate-pulse">🔥</span>
              <span>REACH !</span>
              <span className="animate-pulse">🔥</span>
            </div>
          ) : isBingo ? (
            <button 
              onClick={() => setShowBingoModal(true)}
              className="bg-gradient-to-r from-yellow-400 to-amber-500 text-slate-950 px-8 py-2.5 rounded-2xl text-sm font-black tracking-widest shadow-[0_0_20px_rgba(250,204,21,0.6)] animate-pulse flex items-center gap-2"
            >
              <span>🎉</span>
              <span>BINGO 達成中!</span>
            </button>
          ) : (
            <div className="h-full w-1" />
          )}
        </div>

        <div className="w-full bg-black/30 border border-white/10 p-5 rounded-[36px] shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-lg">
          <div className="grid grid-cols-5 gap-2.5 mb-3">
            {['B', 'I', 'N', 'G', 'O'].map((char) => (
              <div key={char} className="text-center font-black text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-white to-white/75">
                {char}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-2.5">
            {card.map((row, rIdx) =>
              row.map((num, cIdx) => {
                const isFree = rIdx === 2 && cIdx === 2;
                const isPunched = punched[rIdx]?.[cIdx];
                const isReachCell = reachCells.has(`${rIdx}-${cIdx}`);
                const isDrawn = gameMode === 'card_only' || drawnNumbers.includes(num);

                return (
                  <button
                    key={`${rIdx}-${cIdx}`}
                    onClick={() => handleCellClick(rIdx, cIdx)}
                    disabled={isFree || (gameMode === 'digital' && !isDrawn)}
                    className={`aspect-square relative rounded-2xl text-xl font-black flex items-center justify-center transition-all duration-300 overflow-hidden ${
                      isFree
                        ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-slate-950 shadow-[0_0_15px_rgba(250,204,21,0.4)]'
                        : isPunched
                          ? 'bg-black/40 text-white/20 shadow-[inset_0_5px_8px_rgba(0,0,0,0.8)] border border-black/50 scale-[0.93]'
                          : isReachCell
                            ? 'bg-gradient-to-b from-rose-600/15 to-red-600/10 text-rose-300 border border-rose-500/50 animate-neon-pulse hover:scale-105 active:scale-95'
                            : isDrawn
                              ? 'bg-white/10 text-white border border-white/10 hover:bg-white/20 active:scale-95'
                              : 'bg-black/20 text-white/20 border border-white/5 cursor-not-allowed'
                    }`}
                  >
                    {isFree && <span className="relative z-10 text-[13px] tracking-wider">FREE</span>}
                    {!isFree && (
                      <span className={`relative z-10 transition-transform duration-300 ${
                        isPunched 
                          ? 'scale-75 text-white/10 font-bold' 
                          : isReachCell 
                            ? 'text-rose-300 font-extrabold drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]' 
                            : ''
                      }`}>
                        {num}
                      </span>
                    )}
                    {isPunched && !isFree && (
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_30%,_rgba(0,0,0,0.4)_100%)] pointer-events-none" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <footer className="mt-6 text-[10px] tracking-widest text-white/40 font-medium">
          KITFES BINGO 2026
        </footer>
      </div>

      {showBingoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-yellow-500/30 w-full max-w-sm rounded-[32px] p-8 text-center shadow-[0_0_50px_rgba(250,204,21,0.2)] animate-scale-up space-y-6">
            <div className="space-y-2">
              <span className="text-4xl">🎉</span>
              <h2 className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">
                BINGO!!
              </h2>
              <p className="text-xs text-slate-400 font-medium">ビンゴ達成おめでとうございます！</p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl py-4 px-6 inline-block">
              <p className="text-[10px] font-bold text-slate-500 tracking-wider">当選者 ID</p>
              <p className="text-2xl font-mono font-black text-yellow-400 mt-1">{cardId}</p>
            </div>

            <div className="text-xs text-slate-400 leading-relaxed">
              この画面を開いたまま、ステージまたは受付スタッフへお越しください！
            </div>

            <button
              onClick={() => setShowBingoModal(false)}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-black py-3.5 rounded-xl text-sm transition-all"
            >
              カードに戻る
            </button>
          </div>
        </div>
      )}
    </main>
  );
}