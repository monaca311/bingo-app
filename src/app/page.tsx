'use client';

import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { evaluateBingoState } from '../utils/bingoUtils';
import { BingoBoard } from '../components/BingoBoard';
import { DevResetTrigger } from '../components/DevResetTrigger';
import { getUniqueCard } from '../actions/getUniqueCard';
import { supabase } from '../lib/supabase';

export default function BingoPage() {
  const [card, setCard] = useState<number[][]>([]);
  const [punched, setPunched] = useState<boolean[][]>(
    Array(5).fill(null).map(() => Array(5).fill(false))
  );
  const [isBingo, setIsBingo] = useState(false);
  const [reachCoords, setReachCoords] = useState<string[]>([]);
  const [lastTap, setLastTap] = useState(0);

  useEffect(() => {
  const savedCard = localStorage.getItem('bingo-card');
  const savedPunched = localStorage.getItem('bingo-punched');

  if (savedCard && savedPunched) {
    const p = JSON.parse(savedPunched);
    setCard(JSON.parse(savedCard));
    setPunched(p);
    triggerBingoCheck(p);
  } else {
      // サーバーサイドで紙カードと被らないカードを取得する
      getUniqueCard()
        .then((uniqueCard) => {
          setCard(uniqueCard);

          const initialPunched = Array(5).fill(null).map(() => Array(5).fill(false));
          initialPunched[2][2] = true; // FREE
          setPunched(initialPunched);

          // 🌟【追加】スマホ用のデジタルカードID（例: DG-382）をランダム生成して保存する
          const randomId = `DG-${Math.floor(100 + Math.random() * 900)}`;
          localStorage.setItem('bingo-card-id', randomId);

          localStorage.setItem('bingo-card', JSON.stringify(uniqueCard));
          localStorage.setItem('bingo-punched', JSON.stringify(initialPunched));
        })
        .catch((err) => {
          console.error("カード生成に失敗:", err);
          alert("通信エラーが発生しました。リロードしてください。");
        });
    }
}, []);

  // 【追加】すでにビンゴ通知を送信したかどうかを記録するフラグ（連打で何回も通知が送られないようにするため）
  const [hasSentBingo, setHasSentBingo] = useState(false);

  const triggerBingoCheck = async (currentPunched: boolean[][]) => {
    const { isBingo: bingoFound, reachCoords: newReachCoords } = evaluateBingoState(currentPunched);

    if (bingoFound) {
      if (!isBingo) {
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        setIsBingo(true);

        // 🌟【追加】ビンゴ通知をSupabaseに自動送信する！
        if (!hasSentBingo) {
          setHasSentBingo(true);
          
          const cardId = localStorage.getItem('bingo-card-id') || 'No.Temp_User';
          
          // 【デバッグ用ログ】
          console.log('ビンゴ検知！送信するカードID:', cardId);

          const { error } = await supabase
            .from('active_bingos')
            .insert([{ card_no: cardId }]);

          if (error) {
            console.error('ビンゴ通知の送信に失敗詳細:', error);
            alert('通知送信に失敗しました: ' + error.message);
          } else {
            console.log('ビンゴ通知の送信に成功しました！');
            alert(`ビンゴ通知を送信しました！ (ID: ${cardId})`);
          }
        }
      }
      setReachCoords([]);
    } else {
      setIsBingo(false);
      setReachCoords(newReachCoords);
      // ビンゴ状態でなくなったら送信フラグをリセット（トグルで穴を塞ぎ直した時用）
      setHasSentBingo(false);
    }
  };

  const handlePunch = (colIndex: number, rowIndex: number) => {
    const now = Date.now();
    if (now - lastTap < 300) {
      const next = [...punched.map(row => [...row])];
      next[rowIndex][colIndex] = !next[rowIndex][colIndex];

      setPunched(next);
      localStorage.setItem('bingo-punched', JSON.stringify(next));
      triggerBingoCheck(next);

      if (window.navigator.vibrate) {
        window.navigator.vibrate(next[rowIndex][colIndex] ? [30, 10, 30] : [10]);
      }
    }
    setLastTap(now);
  };

  const handleReset = () => {
    if (confirm('【運営】初期化して新しいカードを生成しますか？')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  if (card.length === 0) return null;

  return (
    <main className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center font-sans select-none overflow-x-hidden">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-black italic text-yellow-400 cursor-pointer">
          KITFES BINGO
        </h1>
        {isBingo && (
          <p className="text-5xl font-black text-orange-500 animate-bounce mt-4">
            BINGO!!
          </p>
        )}
      </div>

      <BingoBoard
        card={card}
        punched={punched}
        isBingo={isBingo}
        reachCoords={reachCoords}
        onPunch={handlePunch}
      />

      <DevResetTrigger onReset={handleReset} />
    </main>
  );
}