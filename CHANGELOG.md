# 変更履歴 / Changelog

新しい版を出すたびに、ここへ書きます。/ Every release is listed here.

## 9.2.0
- **自動更新に対応。** Tampermonkey が新しい版を確認して、更新を知らせるようになりました
- 更新の確認先と、サポートページ(Issues)をスクリプトのヘッダーに追加
- Added automatic update checks via Tampermonkey, plus home/support links in the script header

## 9.1.2
- WAV の認証トークン取得を3段構えにして、取得に失敗しにくくしました(Clerk を待つ → ページ側で取得 → `__session` Cookie)
- 失敗したときは、ログの末尾に `[診断: A:… B:… C:…]` を表示して、どこで止まったか分かるようにしました
- トークンの期限切れ(401)のときは、取り直して1回だけ再送します
- WAV token retrieval now falls back through three methods and reports diagnostics on failure; expired tokens (401) are refreshed and retried once

## 9.1.1
- Suno の画面が英語表示でも、曲名の判定が正しく動くよう英語のメニュー名を追加(日本語版・英語版とも)
- Added English menu labels so track names are detected correctly on an English Suno UI

## 9.1.0
- パネルをドラッグで移動でき、位置を覚えるようにしました(音量スライダーと重なる問題の対策)
- The panel can be dragged and remembers its position

## 9.0.0
- WAV / MP3 の切り替え、「いいねした曲だけ」の絞り込みに対応
- WAV and MP3 selection, and a "liked tracks only" filter
