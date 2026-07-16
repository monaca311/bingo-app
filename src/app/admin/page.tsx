'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ビンゴ通知データの型定義
interface BingoNotification {
  id: number;
  card_no: string;
  created_at: string;
}

export default function AdminPage() {
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [bingoCards, setBingoCards] = useState<BingoNotification[]>([]);

  // 🌟【安全なパスワード管理】
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isPasswordError, setIsPasswordError] = useState(false);

  // 1. 初回のセッションチェック
  useEffect(() => {
    const isAlreadyAuth = sessionStorage.getItem('admin-auth') === 'true';
    if (isAlreadyAuth) {
      setIsAuthenticated(true);
      fetchInitialData();
    } else {
      // ログインしていない場合はローディングを外して入力フォームを出す
      setIsLoading(false);
    }
  }, []);

  // 2. 認証成功した後にSupabaseのデータ取得やリアルタイム接続を開始する
  const fetchInitialData = () => {
    setIsLoading(true);

    const fetchGameState = async () => {
      const { data, error } = await supabase
        .from('game_state')
        .select('*')
        .eq('id', 1)
        .single();

      if (error && error.code === 'PGRST116') {
        await supabase
          .from('game_state')
          .insert([{ id: 1, drawn_numbers: [], is_rolling: false }]);
      } else if (data) {
        setDrawnNumbers(data.drawn_numbers || []);
        if (data.drawn_numbers && data.drawn_numbers.length > 0) {
          setCurrentNumber(data.drawn_numbers[data.drawn_numbers.length - 1]);
        }
      }
      setIsLoading(false);
    };

    const fetchExistingBingos = async () => {
      const { data } = await supabase
        .from('active_bingos')
        .select('*')
        .order('created_at', { ascending: true });
      if (data) setBingoCards(data);
    };

    fetchGameState();
    fetchExistingBingos();

    const bingoChannel = supabase
      .channel('realtime_bingos')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'active_bingos' 
        },
        (payload) => {
          console.log('リアルタイムのペイロードを受信:', payload);

          if (payload.eventType === 'INSERT') {
            const newBingo = payload.new as BingoNotification;
            setBingoCards((prev) => [...prev, newBingo]);
            
            if (window.navigator.vibrate) {
              window.navigator.vibrate([100, 50, 100]);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('リアルタイム接続ステータス:', status);
      });

    return () => {
      supabase.removeChannel(bingoChannel);
    };
  };

  // 🌟 パスワードを送信した時の処理
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 🔑 ここで本番用のパスワードを設定します
    if (passwordInput === 'kitfes2026') {
      sessionStorage.setItem('admin-auth', 'true');
      setIsAuthenticated(true);
      setIsPasswordError(false);
      fetchInitialData(); // データを取得しにいく
    } else {
      setIsPasswordError(true);
    }
  };

  // 3. 新しい数字を引く処理
  const drawNextNumber = async () => {
    if (drawnNumbers.length >= 75 || isRolling) return;

    setIsRolling(true);
    await supabase.from('game_state').update({ is_rolling: true }).eq('id', 1);

    const availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1)
      .filter(num => !drawnNumbers.includes(num));

    if (availableNumbers.length === 0) return;

    const nextNum = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];

    let timer: NodeJS.Timeout;
    let duration = 0;
    timer = setInterval(() => {
      setCurrentNumber(Math.floor(Math.random() * 75) + 1);
      duration += 100;
      if (duration >= 2000) {
        clearInterval(timer);
        finalizeDraw(nextNum);
      }
    }, 100);
  };

  const finalizeDraw = async (nextNum: number) => {
    const updatedNumbers = [...drawnNumbers, nextNum];
    
    const { error } = await supabase
      .from('game_state')
      .update({ drawn_numbers: updatedNumbers, is_rolling: false })
      .eq('id', 1);

    if (error) {
      alert('データベースの更新に失敗しました: ' + error.message);
    } else {
      setDrawnNumbers(updatedNumbers);
      setCurrentNumber(nextNum);
    }
    setIsRolling(false);
  };

  // 4. ゲームリセット処理
  const resetGame = async () => {
    if (!confirm('本当に最初からやり直しますか？ビンゴ通知もすべてリセットされます。')) return;

    const { error: stateError } = await supabase
      .from('game_state')
      .update({ drawn_numbers: [], is_rolling: false })
      .eq('id', 1);

    const { error: bingoError } = await supabase
      .from('active_bingos')
      .delete()
      .neq('id', 0);

    if (stateError || bingoError) {
      alert('リセット処理中にエラーが発生しました');
    } else {
      setDrawnNumbers([]);
      setCurrentNumber(null);
      setBingoCards([]);
      alert('ゲームを完全に初期化しました！');
    }
  };

  // 🌟【ログインフォーム】未認証の場合に、オシャレなログイン画面を表示する
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div>
            <span className="inline-block bg-amber-500/10 text-amber-500 text-xs px-3 py-1 rounded-full font-semibold mb-2 tracking-widest">
              ADMIN ONLY
            </span>
            <h1 className="text-xl font-bold text-white">KITFES 管理コンソール</h1>
            <p className="text-xs text-slate-500 mt-1">
              これより先は管理者専用です。パスワードを入力してください。
            </p>
          </div>

          <form onSubmit={handlePasswordSubmit} className="space-y-4 text-left">
            <div>
              <input
                type="password"
                placeholder="パスワードを入力"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className={`w-full bg-slate-950 border text-white rounded-xl px-4 py-3 text-sm focus:outline-none transition-all ${
                  isPasswordError 
                    ? 'border-red-500 focus:ring-1 focus:ring-red-500' 
                    : 'border-slate-800 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500'
                }`}
              />
              {isPasswordError && (
                <p className="text-red-500 text-xs mt-1.5 ml-1 font-semibold">
                  パスワードが間違っています。
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold py-3 rounded-xl text-sm transform active:scale-98 transition-all"
            >
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 認証中かつSupabaseの接続を待っている間
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center font-sans">
        <p className="text-xl animate-pulse text-slate-400">Supabaseに接続中...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center font-sans select-none">
      <header className="w-full max-w-md flex justify-between items-center mb-10">
        <h1 className="text-xl font-bold text-slate-400">KITFES 管理コンソール</h1>
        <button 
          onClick={resetGame}
          className="px-3 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg text-xs font-semibold border border-red-500/30 transition-all"
        >
          全リセット
        </button>
      </header>

      {/* メイン抽選表示 */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center shadow-2xl space-y-6">
        <div className="text-center">
          <p className="text-slate-500 text-sm font-semibold uppercase tracking-wider">Current Number</p>
          <div className="text-8xl font-black text-yellow-400 my-4 h-24 flex items-center justify-center">
            {currentNumber !== null ? currentNumber : 'ー'}
          </div>
          <p className="text-slate-400 text-xs">
            {isRolling ? '数字を選出中...' : `現在: ${drawnNumbers.length} / 75個`}
          </p>
        </div>

        <button
          onClick={drawNextNumber}
          disabled={isRolling || drawnNumbers.length >= 75}
          className={`w-full py-5 rounded-2xl font-black text-xl transition-all duration-350 transform active:scale-95 shadow-lg ${
            isRolling || drawnNumbers.length >= 75
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700/50'
              : 'bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 hover:brightness-110 shadow-yellow-500/10 hover:shadow-yellow-500/20'
          }`}
        >
          {isRolling ? 'ROLLING...' : '次の数字を引く'}
        </button>
      </div>

      {/* リアルタイム・ビンゴ発生リスト */}
      <div className="w-full max-w-md mt-8 bg-slate-900 border border-red-950/30 rounded-3xl p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-bold text-red-400 flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
            リアルタイム・ビンゴ通知 ({bingoCards.length})
          </h2>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {bingoCards.length === 0 ? (
            <p className="text-slate-600 text-xs py-4 text-center">まだビンゴはいません。参加者を待ちましょう！</p>
          ) : (
            bingoCards.map((bingo, idx) => (
              <div 
                key={bingo.id} 
                className="flex justify-between items-center bg-slate-950/80 p-3 rounded-xl border border-red-950/40 animate-fade-in"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black bg-red-600/20 text-red-400 px-2 py-1 rounded">
                    第 {idx + 1} 号
                  </span>
                  <span className="font-bold text-slate-200">ID: {bingo.card_no}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {new Date(bingo.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 履歴一覧 */}
      <div className="w-full max-w-md mt-8">
        <h2 className="text-sm font-bold text-slate-400 mb-4">これまでの履歴 ({drawnNumbers.length})</h2>
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
          {drawnNumbers.length === 0 ? (
            <p className="text-slate-600 text-xs py-2 w-full text-center">まだ数字は引かれていません</p>
          ) : (
            [...drawnNumbers].reverse().map((num, i) => (
              <span 
                key={num} 
                className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-black ${
                  i === 0 
                    ? 'bg-yellow-400 text-slate-950 shadow-[0_0_10px_rgba(250,204,21,0.5)] scale-105' 
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}
              >
                {num}
              </span>
            ))
          )}
        </div>
      </div>
    </main>
  );
}