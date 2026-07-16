'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import confetti from 'canvas-confetti';

export default function BingoCardPage() {
  const [card, setCard] = useState<number[][] | null>(null);
  const [punched, setPunched] = useState<boolean[][]>([]);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [cardId, setCardId] = useState<string>('');
  const [hasSentBingo, setHasSentBingo] = useState<boolean>(false);
  
  const [isReach, setIsReach] = useState<boolean>(false);
  const [showBingoModal, setShowBingoModal] = useState<boolean>(false);
  const [reachCells, setReachCells] = useState<Set<string>>(new Set());

  // 1. 初期読み込み ＆ セッション同期 ＆ リアルタイム監視
  useEffect(() => {
    let savedId = localStorage.getItem('bingo-card-id');
    if (!savedId) {
      savedId = `DG-${Math.floor(100 + Math.random() * 900)}`;
      localStorage.setItem('bingo-card-id', savedId);
    }
    setCardId(savedId);

    const fetchGameStateAndSync = async () => {
      const { data } = await supabase
        .from('game_state')
        .select('drawn_numbers, session_id')
        .eq('id', 1)
        .single();

      if (data) {
        setDrawnNumbers(data.drawn_numbers || []);
        
        const currentSessionId = data.session_id;
        const savedSessionId = localStorage.getItem('bingo-session-id');

        if (savedSessionId !== currentSessionId) {
          localStorage.removeItem('bingo-card');
          localStorage.removeItem('bingo-punched');
          localStorage.removeItem('bingo-has-sent');
          localStorage.setItem('bingo-session-id', currentSessionId);
          await generateNewCard();
        } else {
          const savedCard = localStorage.getItem('bingo-card');
          const savedPunched = localStorage.getItem('bingo-punched');
          const savedHasSent = localStorage.getItem('bingo-has-sent') === 'true';

          setHasSentBingo(savedHasSent);

          if (savedCard && savedPunched) {
            const parsedCard = JSON.parse(savedCard);
            const parsedPunched = JSON.parse(savedPunched);
            setCard(parsedCard);
            setPunched(parsedPunched);
            checkReachAndBingoState(parsedPunched, false); // 初期ロード時はバイブなし
          } else {
            await generateNewCard();
          }
        }
      }
    };

    fetchGameStateAndSync();

    const stateChannel = supabase
      .channel('realtime_game_state_user')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state', filter: 'id=eq.1' },
        async (payload) => {
          const updated = payload.new as { drawn_numbers: number[]; session_id: string };
          setDrawnNumbers(updated.drawn_numbers || []);

          const savedSessionId = localStorage.getItem('bingo-session-id');
          if (updated.session_id && savedSessionId !== updated.session_id) {
            localStorage.removeItem('bingo-card');
            localStorage.removeItem('bingo-punched');
            localStorage.removeItem('bingo-has-sent');
            localStorage.setItem('bingo-session-id', updated.session_id);
            setHasSentBingo(false);
            setIsReach(false);
            setReachCells(new Set());
            setShowBingoModal(false);
            await generateNewCard();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(stateChannel);
    };
  }, []);

  const generateNewCard = async () => {
    try {
      const { getUniqueCard } = await import('../actions/getUniqueCard');
      const uniqueCard = await getUniqueCard();
      setCard(uniqueCard);

      const initialPunched = Array(5).fill(null).map(() => Array(5).fill(false));
      initialPunched[2][2] = true;
      setPunched(initialPunched);

      localStorage.setItem('bingo-card', JSON.stringify(uniqueCard));
      localStorage.setItem('bingo-punched', JSON.stringify(initialPunched));
    } catch (err) {
      console.error("カード生成に失敗:", err);
      alert("カードの生成に失敗しました。ページをリロードしてください。");
    }
  };

  // 2. タップ処理
  const handleCellClick = (row: number, col: number) => {
    if (!card) return;
    if (row === 2 && col === 2) return;

    const targetNumber = card[row][col];

    if (!drawnNumbers.includes(targetNumber)) {
      return;
    }

    const newPunched = punched.map((r, ri) =>
      r.map((c, ci) => (ri === row && ci === col ? !c : c))
    );
    setPunched(newPunched);
    localStorage.setItem('bingo-punched', JSON.stringify(newPunched));

    checkReachAndBingoState(newPunched, true); // タップ時はバイブ通知を許可
  };

  // 3. リーチ ＆ ビンゴの判定
  const checkReachAndBingoState = (currentPunched: boolean[][], triggerVibrate: boolean = false) => {
    let isBingo = false;
    const newReachCells = new Set<string>();

    const lines: [number, number][][] = [];

    // 横ライン5本
    for (let r = 0; r < 5; r++) {
      lines.push([[r, 0], [r, 1], [r, 2], [r, 3], [r, 4]]);
    }
    // 縦ライン5本
    for (let c = 0; c < 5; c++) {
      lines.push([[0, c], [1, c], [2, c], [3, c], [4, c]]);
    }
    // 斜め2本
    lines.push([[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]);
    lines.push([[0, 4], [1, 3], [2, 2], [3, 1], [4, 0]]);

    for (const line of lines) {
      const unpunchedCoordinates = line.filter(([r, c]) => !currentPunched[r][c]);
      
      if (unpunchedCoordinates.length === 0) {
        isBingo = true;
      }
      
      if (unpunchedCoordinates.length === 1) {
        const [reachRow, reachCol] = unpunchedCoordinates[0];
        newReachCells.add(`${reachRow}-${reachCol}`);
      }
    }

    const wasReachBefore = isReach;

    if (isBingo) {
      setReachCells(new Set());
      setIsReach(false);
    } else {
      setReachCells(newReachCells);
      const nowReach = newReachCells.size > 0;
      setIsReach(nowReach);

      // 🌟【UX追加】新しくリーチがかかった瞬間に、スマホを「トトッ」と可愛くバイブ振動させる
      if (triggerVibrate && nowReach && !wasReachBefore && window.navigator.vibrate) {
        window.navigator.vibrate([80, 50, 80]);
      }
    }

    if (isBingo && !hasSentBingo) {
      triggerBingoSuccess();
    }
  };

  const triggerBingoSuccess = async () => {
    setHasSentBingo(true);
    localStorage.setItem('bingo-has-sent', 'true');
    setShowBingoModal(true);

    const duration = 3 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());

    const currentId = localStorage.getItem('bingo-card-id') || cardId || 'No.Temp_User';
    const { error } = await supabase
      .from('active_bingos')
      .insert([{ card_no: currentId }]);

    if (error) {
      console.error('ビンゴ通知の送信に失敗:', error);
      setHasSentBingo(false);
    }
  };

  if (!card) {
    return (
      <div className="min-h-screen bg-[#202666] text-white flex items-center justify-center">
        <p className="text-xl font-bold animate-pulse text-yellow-400">カード生成中...</p>
      </div>
    );
  }

  return (
    <main 
      style={{ backgroundColor: '#202666' }} 
      className="min-h-screen relative text-white p-4 flex flex-col items-center justify-center font-sans select-none overflow-hidden"
    >
      {/* 背景のきらきら装飾 */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute top-10 left-10 w-2 h-2 bg-white rounded-full animate-ping [animation-duration:3s]" />
        <div className="absolute top-1/4 right-12 w-1.5 h-1.5 bg-yellow-300 rounded-full animate-pulse [animation-duration:2s]" />
        <div className="absolute bottom-1/3 left-8 w-1 h-1 bg-white rounded-full animate-pulse [animation-duration:4s]" />
        <div className="absolute bottom-12 right-20 w-2 h-2 bg-purple-300 rounded-full animate-ping [animation-duration:5s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        
        {/* 1. ID表示：少し下げて控えめに配置 */}
        <div className="mb-2 flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/10 px-3.5 py-1 rounded-full shadow-inner">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-[10px] font-semibold tracking-wider text-white/50">
            CARD ID: <span className="text-white font-mono text-[11px]">{cardId}</span>
          </p>
        </div>

        {/* 🌟 2. リーチ表示エリア：カードの真上で圧倒的に目立つように新設！ */}
        <div className="w-full h-14 flex items-center justify-center mb-3">
          {isReach && !hasSentBingo ? (
            <div className="bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 text-white border border-rose-400/30 px-8 py-2.5 rounded-2xl text-sm font-black tracking-[0.2em] shadow-[0_0_20px_rgba(244,63,94,0.6)] animate-bounce flex items-center gap-2">
              <span className="animate-pulse">🔥</span>
              <span>REACH !</span>
              <span className="animate-pulse">🔥</span>
            </div>
          ) : (
            // リーチしていない時は、高さを保ちつつ透明なプレースホルダーにしてレイアウトのガタつきを防ぐよ
            <div className="h-full w-1" />
          )}
        </div>

        {/* ビンゴカード本体 */}
        <div className="w-full bg-black/30 border border-white/10 p-5 rounded-[36px] shadow-[0_20px_50px_rgba(0,0,0,0.4)] backdrop-blur-lg">
          
          {/* B I N G O ヘッダー */}
          <div className="grid grid-cols-5 gap-2.5 mb-3">
            {['B', 'I', 'N', 'G', 'O'].map((char) => (
              <div key={char} className="text-center font-black text-xl tracking-wider text-transparent bg-clip-text bg-gradient-to-b from-white to-white/75">
                {char}
              </div>
            ))}
          </div>

          {/* 5x5 マス目 */}
          <div className="grid grid-cols-5 gap-2.5">
            {card.map((row, rIdx) =>
              row.map((num, cIdx) => {
                const isFree = rIdx === 2 && cIdx === 2;
                const isPunched = punched[rIdx]?.[cIdx];
                const isAvailable = isFree || drawnNumbers.includes(num);
                const isReachCell = reachCells.has(`${rIdx}-${cIdx}`);

                return (
                  <button
                    key={`${rIdx}-${cIdx}`}
                    onClick={() => handleCellClick(rIdx, cIdx)}
                    disabled={isFree}
                    className={`aspect-square relative rounded-2xl text-xl font-black flex items-center justify-center transition-all duration-300 overflow-hidden ${
                      isFree
                        ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-slate-950 shadow-[0_0_15px_rgba(250,204,21,0.4)]'
                        : isPunched
                          ? 'bg-black/40 text-white/20 shadow-[inset_0_5px_8px_rgba(0,0,0,0.8)] border border-black/50 scale-[0.93] pointer-events-auto'
                          : isAvailable
                            ? 'bg-white/10 text-yellow-300 border border-yellow-300/40 hover:scale-105 active:scale-95 shadow-[0_4px_12px_rgba(250,204,21,0.1)]'
                            // まだ引かれていなくて、かつ「リーチマス」なら赤ピンクの超点滅！
                            : isReachCell
                              ? 'bg-gradient-to-b from-rose-600/15 to-red-600/10 text-rose-400 border border-rose-500/50 animate-neon-pulse cursor-not-allowed shadow-[0_0_10px_rgba(244,63,94,0.15)]'
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

        {/* フッター */}
        <footer className="mt-6 text-[10px] tracking-widest text-white/40 font-medium">
          KITFES BINGO 2026
        </footer>
      </div>

      {/* ビンゴ達成モーダル */}
      {showBingoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-yellow-500/30 w-full max-w-sm rounded-[32px] p-8 text-center shadow-[0_0_50px_rgba(250,204,21,0.2)] animate-scale-up space-y-6">
            <div className="space-y-2">
              <span className="text-4xl">🎉</span>
              <h2 className="text-3xl font-black italic tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-amber-300 to-yellow-500">
                BINGO!!
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                ビンゴを達成しました！おめでとうございます！
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl py-4 px-6 inline-block">
              <p className="text-[10px] font-bold text-slate-500 tracking-wider">REGISTRATION ID</p>
              <p className="text-xl font-mono font-black text-white mt-1">{cardId}</p>
            </div>

            <div className="text-xs text-slate-500 leading-relaxed">
              あなたの当選情報は自動的に本部の管理者画面に送信されました。
              <br />
              景品の引き換えまでそのままお待ちください！
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