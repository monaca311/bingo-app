'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface BingoRecord {
  id: number;
  card_no: string;
  created_at: string;
}

type GameMode = 'digital' | 'card_only';

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [isPasswordError, setIsPasswordError] = useState(false);

  const [gameMode, setGameMode] = useState<GameMode>('card_only');
  const [isDistributing, setIsDistributing] = useState(true);
  const [drawnNumbers, setDrawnNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [records, setRecords] = useState<BingoRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const rollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const isAlreadyAuth = sessionStorage.getItem('admin-auth') === 'true';
    if (isAlreadyAuth) {
      setIsAuthenticated(true);
      fetchData();
    } else {
      setIsLoading(false);
    }

    return () => {
      if (rollIntervalRef.current) clearInterval(rollIntervalRef.current);
    };
  }, []);

  const fetchData = async () => {
    setIsLoading(true);

    const { data: stateData } = await supabase
      .from('game_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (stateData) {
      setGameMode((stateData.game_mode as GameMode) || 'card_only');
      setIsDistributing(stateData.is_distributing ?? true);
      setDrawnNumbers(stateData.drawn_numbers || []);
      if (stateData.drawn_numbers?.length > 0) {
        setCurrentNumber(stateData.drawn_numbers[stateData.drawn_numbers.length - 1]);
      }
    }

    const { data: recordsData } = await supabase
      .from('active_bingos')
      .select('*')
      .order('id', { ascending: true });

    if (recordsData) {
      setRecords(recordsData);
    }

    const channel = supabase
      .channel('realtime_admin_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_bingos' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setRecords((prev) => [...prev, payload.new as BingoRecord]);
            if (window.navigator.vibrate) window.navigator.vibrate([100, 50, 100]);
          } else if (payload.eventType === 'DELETE') {
            setRecords([]);
          }
        }
      )
      .subscribe();

    setIsLoading(false);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'kitfes2026';

    if (passwordInput === adminPassword) {
      sessionStorage.setItem('admin-auth', 'true');
      setIsAuthenticated(true);
      setIsPasswordError(false);
      fetchData();
    } else {
      setIsPasswordError(true);
    }
  };

  // モード切り替え
  const changeGameMode = async (mode: GameMode) => {
    const { error } = await supabase
      .from('game_state')
      .update({ game_mode: mode })
      .eq('id', 1);

    if (!error) {
      setGameMode(mode);
    }
  };

  // 配布受付トグル（確実に更新 & エラーハンドリング）
  const toggleDistribution = async () => {
    const nextState = !isDistributing;
    console.log('配布状態を切り替えます:', nextState);

    // 画面側を先行して切り替え（体感を良くする）
    setIsDistributing(nextState);

    const { data, error } = await supabase
      .from('game_state')
      .update({ is_distributing: nextState })
      .eq('id', 1)
      .select();

    if (error) {
      console.error('配布状態の更新エラー:', error);
      alert('データベースの更新に失敗しました: ' + error.message);
      // 失敗した場合は元の状態に戻す
      setIsDistributing(!nextState);
    } else {
      console.log('更新成功:', data);
    }
  };

  // デジタル抽選：数字を引く
  const drawNextNumber = async () => {
    if (drawnNumbers.length >= 75 || isRolling) return;

    const availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1)
      .filter((num) => !drawnNumbers.includes(num));

    if (availableNumbers.length === 0) return;

    setIsRolling(true);
    await supabase.from('game_state').update({ is_rolling: true }).eq('id', 1);

    const nextNum = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
    let duration = 0;

    rollIntervalRef.current = setInterval(() => {
      setCurrentNumber(Math.floor(Math.random() * 75) + 1);
      duration += 100;
      if (duration >= 2000) {
        if (rollIntervalRef.current) {
          clearInterval(rollIntervalRef.current);
          rollIntervalRef.current = null;
        }
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

    if (!error) {
      setDrawnNumbers(updatedNumbers);
      setCurrentNumber(nextNum);
    }
    setIsRolling(false);
  };

  // 全リセット
  const resetAll = async () => {
    if (!confirm('全ゲームデータを初期化して新しい回を開始しますか？')) return;

    const newSessionId = crypto.randomUUID();

    await supabase
      .from('game_state')
      .update({
        session_id: newSessionId,
        drawn_numbers: [],
        is_rolling: false,
        is_distributing: true,
      })
      .eq('id', 1);

    await supabase
      .from('active_bingos')
      .delete()
      .neq('id', 0);

    setDrawnNumbers([]);
    setCurrentNumber(null);
    setRecords([]);
    setIsDistributing(true);
    alert('初期化完了：新規ゲームが開始されました。');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
          <div>
            <span className="inline-block bg-amber-500/10 text-amber-500 text-xs px-3 py-1 rounded-full font-semibold mb-2 tracking-widest">
              ADMIN ONLY
            </span>
            <h1 className="text-xl font-bold text-white">KITFES 管理コンソール</h1>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4 text-left">
            <input
              type="password"
              placeholder="パスワードを入力"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-yellow-500 text-white rounded-xl px-4 py-3 text-sm focus:outline-none"
            />
            {isPasswordError && (
              <p className="text-red-500 text-xs mt-1">パスワードが間違っています</p>
            )}
            <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-950 font-bold py-3 rounded-xl text-sm">
              ログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6 flex flex-col items-center font-sans select-none">
      <header className="w-full max-w-md flex justify-between items-center mb-6">
        <h1 className="text-lg font-bold text-slate-400">KITFES 管理コンソール</h1>
        <button onClick={resetAll} className="px-3 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg text-xs font-semibold border border-red-500/30">
          全リセット
        </button>
      </header>

      {/* モード選択タブ */}
      <div className="w-full max-w-md grid grid-cols-2 gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 mb-6">
        <button
          onClick={() => changeGameMode('card_only')}
          className={`py-2.5 rounded-xl text-xs font-black transition-all ${
            gameMode === 'card_only'
              ? 'bg-yellow-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          🎲 ガラガラ（カード配布のみ）
        </button>
        <button
          onClick={() => changeGameMode('digital')}
          className={`py-2.5 rounded-xl text-xs font-black transition-all ${
            gameMode === 'digital'
              ? 'bg-yellow-500 text-slate-950 shadow-md'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          ⚡ アプリ完結（デジタル抽選）
        </button>
      </div>

      {/* 配布受付ステータス */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-4 flex justify-between items-center mb-6 relative z-10">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase">カード配布受付</p>
          <p className={`text-sm font-black ${isDistributing ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isDistributing ? '受付中 (QR有効)' : '締切済み (新規遮断)'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleDistribution}
          className={`px-4 py-2 rounded-xl font-black text-xs cursor-pointer active:scale-95 transition-all shadow-md ${
            isDistributing 
              ? 'bg-rose-600 hover:bg-rose-500 text-white' 
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {isDistributing ? '配布を締切る' : '配布を再開'}
        </button>
      </div>

      {/* デジタル抽選コンソール（デジタルモード時のみ表示） */}
      {gameMode === 'digital' && (
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col items-center mb-6 space-y-4 shadow-xl">
          <div className="text-center">
            <p className="text-slate-500 text-xs font-semibold uppercase">Current Number</p>
            <div className="text-7xl font-black text-yellow-400 my-2 h-20 flex items-center justify-center">
              {currentNumber !== null ? currentNumber : 'ー'}
            </div>
            <p className="text-slate-400 text-xs">{drawnNumbers.length} / 75個 抽選済み</p>
          </div>
          <button
            onClick={drawNextNumber}
            disabled={isRolling || drawnNumbers.length >= 75}
            className={`w-full py-4 rounded-xl font-black text-lg ${
              isRolling || drawnNumbers.length >= 75
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : 'bg-gradient-to-r from-yellow-500 to-amber-600 text-slate-950 active:scale-95'
            }`}
          >
            {isRolling ? 'ROLLING...' : drawnNumbers.length >= 75 ? '抽選終了' : '次の数字を引く'}
          </button>
        </div>
      )}

      {/* 一覧リスト */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <h2 className="text-sm font-bold text-slate-300 mb-3">
          {gameMode === 'digital' ? `当選ビンゴ通知 (${records.length})` : `発行済みカード (${records.length})`}
        </h2>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {records.length === 0 ? (
            <p className="text-slate-600 text-xs py-4 text-center">データはありません</p>
          ) : (
            records.map((r, idx) => (
              <div key={r.id} className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                <span className="font-mono font-bold text-yellow-400">
                  {gameMode === 'digital' ? `第${idx + 1}号: ${r.card_no}` : `DG-${r.id}`}
                </span>
                <span className="text-[10px] text-slate-500">
                  {new Date(r.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}