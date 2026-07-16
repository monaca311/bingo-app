'use server'

import { supabase } from '../lib/supabase';

// ランダムにビンゴカードを生成する関数 (B:1-15, I:16-30, N:31-45, G:46-60, O:61-75)
const generateRandomCard = (): number[][] => {
  const columns = [
    { min: 1, max: 15 },  // B
    { min: 16, max: 30 }, // I
    { min: 31, max: 45 }, // N
    { min: 46, max: 60 }, // G
    { min: 61, max: 75 }  // O
  ];

  const pattern: number[][] = [];

  columns.forEach((col, colIndex) => {
    const numbers: number[] = [];
    while (numbers.length < 5) {
      const rand = Math.floor(Math.random() * (col.max - col.min + 1)) + col.min;
      if (!numbers.includes(rand)) {
        numbers.push(rand);
      }
    }
    // 中央のマス(2,2)を 0 (FREE) にする
    if (colIndex === 2) {
      numbers[2] = 0;
    }
    pattern.push(numbers);
  });

  return pattern;
};

// 重複チェックを通過したカードを返すメイン処理
export async function getUniqueCard() {
  let uniqueCard: number[][] | null = null;
  let isDuplicate = true;
  let attempts = 0;

  while (isDuplicate && attempts < 50) {
    const candidateCard = generateRandomCard();

   // 【決定版】Supabaseのデータベース関数（RPC）を呼び出して重複チェックを行う
    const { data: isDuplicateResult, error } = await supabase
      .rpc('check_card_duplicate', {
        candidate_pattern: candidateCard // 引数名と値をオブジェクトで渡す
      });

    if (error) {
      console.error('【デバッグ用】重複チェックエラーの詳細:', error);
      // エラーメッセージを生でスローして画面に表示させる
      throw new Error(`Database query failed: ${error.message} (Code: ${error.code})`);
    }

    // 一致するデータがなければ（isDuplicateResultがfalseなら）、重複なしとして確定！
    if (isDuplicateResult === false) {
      uniqueCard = candidateCard;
      isDuplicate = false;
    }

    attempts++;
  }

  if (!uniqueCard) {
    throw new Error('重複しないカードの生成に失敗しました。制限回数を超過しました。');
  }

  return uniqueCard;
}