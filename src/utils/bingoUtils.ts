// リーチ・ビンゴ判定（特定座標を光らせるロジック）
export const evaluateBingoState = (currentPunched: boolean[][]) => {
  let bingoFound = false;
  const newReachCoords: string[] = [];

  const checkLine = (coords: { r: number; c: number }[]) => {
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

  return {
    isBingo: bingoFound,
    reachCoords: bingoFound ? [] : newReachCoords,
  };
};