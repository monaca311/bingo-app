'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function BingoCardPage() {
  const [card, setCard] = useState<number[][] | null>(null);
  const [punched, setPunched] = useState<boolean[][]>([]);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [cardId, setCardId] = useState<string>('');
  const [hasSentBingo, setHasSentBingo] = useState<boolean>(false);

  // 1. 初期読み込みとリアルタイム監視
  useEffect(() => {
    const savedCard = localStorage.getItem('bingo-card');
    const savedPunched = localStorage.getItem('bingo-punched');
    const savedId = localStorage.getItem('bingo-card-id');

    if (savedId) {
      setCardId(savedId);
    } else {
      const newId = `DG-${Math.floor(100 + Math.random() * 900)}`;
      localStorage.setItem('bingo-card-id', newId);
      setCardId(newId);
    }

    if (savedCard && savedPunched) {
      setCard(JSON.parse(savedCard));
      setPunched(JSON.parse(savedPunched));
    } else {
      import('../actions/getUniqueCard')
        .then(({ getUniqueCard }) => getUniqueCard())
        .then((uniqueCard) => {
          setCard(uniqueCard);
          const initialPunched = Array(5).fill(null).map(() => Array(5).fill(false));
          initialPunched[2][2] = true; // FREE
          setPunched(initialPunched);

          localStorage.setItem('bingo-card', JSON.stringify(uniqueCard));
          localStorage.setItem('bingo-punched', JSON.stringify(initialPunched));
        })
        .catch((err) => {
          console.error("カード生成に失敗:", err);
          alert("カードの生成に失敗しました。ページをリロードしてください。");
        });
    }

    const fetchGameState = async () => {
      const { data } = await supabase
        .from('game_state')
        .select('drawn_numbers')
        .eq('id', 1)
        .single();
      if (data) {
        setDrawnNumbers(data.drawn_numbers || []);
      }
    };
    fetchGameState();

    const stateChannel = supabase
      .channel('realtime_game_state_user')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'game_state', filter: 'id=eq.1' },
        (payload) => {
          const updated = payload.new as { drawn_numbers: number[] };
          setDrawnNumbers(updated.drawn_numbers || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(stateChannel);
    };
  }, []);

  // 2. タップ処理（出ていない数字は完全にスルー）
  const handleCellClick = (row: number, col: number) => {
    if (!card) return;
    if (row === 2 && col === 2) return; // FREEはすでに開いているので無視

    const targetNumber = card[row][col];

    // 🌟【重要】出た数字にない場合は、アラートも出さずに完全に無反応（何もせずreturn）
    if (!drawnNumbers.includes(targetNumber)) {
      return;
    }

    const newPunched = punched.map((r, ri) =>
      r.map((c, ci) => (ri === row && ci === col ? !c : c))
    );
    setPunched(newPunched);
    localStorage.setItem('bingo-punched', JSON.stringify(newPunched));

    checkBingo(newPunched);
  };

  // 3. ビンゴ判定
  const checkBingo = async (currentPunched: boolean[][]) => {
    let isBingo = false;

    for (let r = 0; r < 5; r++) {
      if (currentPunched[r].every((val) => val)) isBingo = true;
    }
    for (let c = 0; c < 5; c++) {
      let colPunched = true;
      for (let r = 0; r < 5; r++) {
        if (!currentPunched[r][c]) colPunched = false;
      }
      if (colPunched) isBingo = true;
    }
    if (
      currentPunched[0][0] &&
      currentPunched[1][1] &&
      currentPunched[2][2] &&
      currentPunched[3][3] &&
      currentPunched[4][4]
    ) {
      isBingo = true;
    }
    if (
      currentPunched[0][4] &&
      currentPunched[1][3] &&
      currentPunched[2][2] &&
      currentPunched[3][1] &&
      currentPunched[4][0]
    ) {
      isBingo = true;
    }

    if (isBingo && !hasSentBingo) {
      setHasSentBingo(true);
      const currentId = localStorage.getItem('bingo-card-id') || cardId || 'No.Temp_User';

      const { error } = await supabase
        .from('active_bingos')
        .insert([{ card_no: currentId }]);

      if (error) {
        console.error('ビンゴ通知の送信に失敗:', error);
        setHasSentBingo(false);
      } else {
        alert(`ビンゴおめでとうございます！🎉 (ID: ${currentId} を管理者に送信しました)`);
      }
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
    // 🌟 確実な背景色：インラインスタイルで絶対カラーコード「#202666」を直指定
    <main 
      style={{ backgroundColor: '#202666' }} 
      className="min-h-screen relative text-white p-4 flex flex-col items-center justify-center font-sans select-none overflow-hidden"
    >
      
      {/* 🌟 背景のきらきら（星空・スパークル）の装飾 */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute top-10 left-10 w-2 h-2 bg-white rounded-full animate-ping [animation-duration:3s]" />
        <div className="absolute top-1/4 right-12 w-1.5 h-1.5 bg-yellow-300 rounded-full animate-pulse [animation-duration:2s]" />
        <div className="absolute bottom-1/3 left-8 w-1 h-1 bg-white rounded-full animate-pulse [animation-duration:4s]" />
        <div className="absolute bottom-12 right-20 w-2 h-2 bg-purple-300 rounded-full animate-ping [animation-duration:5s]" />
        {/* 背景の中央を少しだけグラデーションで美しく浮かせる */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-white/5 rounded-full blur-[120px] pointer-events-none" />
      </div>

      {/* コンテンツエリア */}
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        
        {/* 1. ID表示：サイズを小さく抑えたミニマルなプレート */}
        <div className="mb-4 flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/10 px-3.5 py-1 rounded-full shadow-inner">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-[11px] font-semibold tracking-wider text-white/70">
            CARD ID: <span className="text-white font-mono text-[12px]">{cardId}</span>
          </p>
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

                return (
                  <button
                    key={`${rIdx}-${cIdx}`}
                    onClick={() => handleCellClick(rIdx, cIdx)}
                    disabled={isFree}
                    className={`aspect-square relative rounded-2xl text-xl font-black flex items-center justify-center transition-all duration-300 overflow-hidden ${
                      isFree
                        ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-slate-950 shadow-[0_0_15px_rgba(250,204,21,0.4)]'
                        // 🌟 2. 穴あき（ペコッと凹んだ風）のスタイル
                        : isPunched
                          ? 'bg-black/40 text-white/20 shadow-[inset_0_5px_8px_rgba(0,0,0,0.8)] border border-black/50 scale-[0.93] pointer-events-auto'
                          : isAvailable
                            ? 'bg-white/10 text-yellow-300 border border-yellow-300/40 hover:scale-105 active:scale-95 shadow-[0_4px_12px_rgba(250,204,21,0.1)]'
                            // まだ出ていない数字（クリックしても完全無視）
                            : 'bg-black/20 text-white/20 border border-white/5 cursor-not-allowed'
                    }`}
                  >
                    {isFree && <span className="relative z-10 text-[13px] tracking-wider">FREE</span>}

                    {!isFree && (
                      <span className={`relative z-10 transition-transform duration-300 ${isPunched ? 'scale-75 text-white/10 font-bold' : ''}`}>
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
    </main>
  );
}