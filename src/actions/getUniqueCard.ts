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

  // columns_data[0] = B列の5つの数字
  // columns_data[1] = I列の5つの数字 ... という形の、縦ベースの配列を作ります
  const columns_data: number[][] = [];

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
    columns_data.push(numbers);
  });

  // 🌟【最重要修正】表示（行ベース）に合わせて、縦と横をひっくり返す（転置）処理
  // columns_data[列][行] のデータを、[行][列] の二次元配列に変換します
  const transposedCard: number[][] = Array(5).fill(null).map(() => Array(5).fill(0));

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      transposedCard[r][c] = columns_data[c][r];
    }
  }

  return transposedCard;
};

// 重複チェックを通過したカードを返すメイン処理
export async function getUniqueCard() {
  let uniqueCard: number[][] | null = null;
  let isDuplicate = true;
  let attempts = 0;

  while (isDuplicate && attempts < 50) {
    const candidateCard = generateRandomCard();

    // Supabaseのデータベース関数（RPC）を呼び出して重複チェックを行う
    const { data: isDuplicateResult, error } = await supabase
      .rpc('check_card_duplicate', {
        candidate_pattern: candidateCard // 引数名と値をオブジェクトで渡す
      });

    if (error) {
      console.error('【デバッグ用】重複チェックエラーの詳細:', error);
      throw new Error(`Database query failed: ${error.message} (Code: ${error.code})`);
    }

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