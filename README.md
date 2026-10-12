# norden-data

nordencult のゲームデータのエディタ。拠点データ・騎士データ・セリフを編集し、ゲーム本体（nordencult）の `src/` に書き出す。React + TypeScript + Vite。
読み書きは開発サーバーの Vite プラグイン（[server/dataPlugin.ts](server/dataPlugin.ts)）が行うので、`npm run dev` で使う（ビルドはしない）。

nordencult のサブモジュール（`nordencult/norden-data`）として置き、親ディレクトリをゲーム本体として読み書きする。
別の場所に置くときは `NORDEN_ROOT=/path/to/nordencult npm run dev`。

```sh
npm install
npm run dev        # http://localhost:5180/
npm run typecheck
```

## 拠点データ（`#cities`）

左で拠点を選んで人口・農業・商業・生産・初期の所属などを入力し、「保存」でゲームの `src/data/cityData.json` に直接書く。
右の地図（`norden-strategy` の拠点の位置 `PLACES` と街道 `ROAD_LINKS` から描く簡易地図）の拠点をクリックしても選べる。
点の色は所属、大きさは人口。地図の右下は勢力ごとの拠点数・人口・生産の合計。

- 「生産」は以前の「軍事」（`military` → `production`）。ゲームでは 1 ターンに出せる兵が 生産 × 5
- 地図の描画（町・大都市の描き分けなど）は `norden-strategy` の `CITY_LIST` を使っていて、ここで変えた人口などは反映されない

## 騎士データ（`#characters`）

[nordencult-old の character-editor](https://github.com/sylx/nordencult-old/tree/main/tools/editor) を移したもの。
元データは [characters/characters.json](characters/characters.json)。「保存」はここに書き、「ゲームに書き出す」で保存してからゲームのデータを作る。

| 書き出し先（nordencult） | 内容 |
| --- | --- |
| `src/assets/character.webp` | 使っているセルだけを ID 順に横 5 人で並べ、半分（512×768）にした画像 |
| `src/data/characterData.json` | 能力・略歴など。画像の位置は `character.webp` 上のピクセル |
| `src/data/characterStart.json` | 初期配置（都市・勢力・領主） |
| `src/data/characterSprite.json` | `character.webp` とセルの大きさ（`CharacterImage` が使う） |

画像が未設定のキャラクターは書き出さない。

### 元画像

元画像（1 枚に 5 人 × 2 行または 3 行、1 人 1024×1536、間に 50px の余白）は大きいのでコミットしない。
[characters/sheets/](characters/sheets/) に置いて「画像を読み直す」を押す。行数は画像の大きさから決める（5×3 の 15 人、5×2 の 10 人のどちらも読める）。
今の騎士の `001.webp`・`002.webp` は nordencult-old の `tools/editor/uploads/` にある。

キャラクターを選び、元画像のセルをクリックして画像にする。顔の範囲は、枠をドラッグで動かし、外をクリックでそこを中心にし、ホイールで大きさを変える。

## セリフ（`#voiceLines`）

騎士が場面ごとに言うセリフ。ゲームの `src/data/voiceLines.json` を直接読み書きする（「保存」で書く）。
セリフを引く決まりはゲームの [src/data/voiceLines.ts](../src/data/voiceLines.ts)。

- 左で場面（`battle.attack` など）を選ぶ。場面の ID はゲームのコードが引く名前なので、使っているものは変えない。場面は足せる（汎用。戦闘以外の会話にも使う）
- 真ん中は口調（列）× 性格（行）のマトリックス。数字はセルのセリフの数、点はそのセルに当たる騎士がいること
- 右でセルのセリフを 1 行に 1 つ書く。下のプレビューで騎士を選ぶと、その騎士がこの場面で引くセルとセリフが出る

騎士は自分の口調の列から、「性格を問わない」行と自分の性格（最大 4 つ）の行を合わせて引く。その列にこの場面のセリフが 1 つも無ければ「共通」の列から同じように引く。
口調ごとの話し方は「性格を問わない」行に書き、性格の行にはその性格らしい言い回しを足していく。

戦闘（norden-battle）の場面は `battle.` で始まる。一斉攻撃の掛け合いは、攻撃する部隊の `battle.exchange_lead` に、加わる味方（2 部隊まで）がそれぞれ `battle.exchange_reply` で応じる。
