# Suno Bulk Downloader

Sunoで作った曲を、チェックを入れて **ボタン1つでまとめて保存** できる Tampermonkey 用スクリプトです。
WAV / MP3 を選べて、「いいね」した曲だけを選ぶこともできます。ファイル名は曲名になります。

A Tampermonkey userscript that saves your Suno tracks in bulk — tick the tracks, click one button.
WAV or MP3, optional "liked tracks only", files named after each track.

---

## インストール / Install

1. Chrome に拡張機能 **[Tampermonkey](https://www.tampermonkey.net/)** を入れる(無料)
2. 下のリンクを開くと、Tampermonkey の **「インストール」画面** が出るので、そのまま押す

| 表示 | インストール |
|---|---|
| パネルが **日本語** | [suno-bulk-downloader.user.js](https://raw.githubusercontent.com/Cape-PC/suno-bulk-downloader/main/suno-bulk-downloader.user.js) |
| Panel in **English** | [suno-bulk-downloader-en.user.js](https://raw.githubusercontent.com/Cape-PC/suno-bulk-downloader/main/suno-bulk-downloader-en.user.js) |

どちらを入れても、Suno の画面が日本語でも英語でも動きます(違うのはパネルの文字だけです)。
Either one works whether your Suno site is shown in Japanese or English; only the panel text differs.

## 更新 / Updates

新しい版が出ると、Tampermonkey が自動で確認して「更新しますか?」と知らせます(初期設定では約1日おき)。
すぐ確認したいときは、Tampermonkey のアイコン → **ユーティリティ** → **ユーザースクリプトの更新を確認**。

Tampermonkey checks for new versions on its own and asks before updating.
To check right away: Tampermonkey icon → Utilities → Check for userscript updates.

### 以前、コードをコピペして入れた方 / If you installed by pasting the code

**一度だけ**、上のリンクから入れ直してください。名前が同じなので、古い版が上書きされます。
それ以降は自動更新になります。

Please install once from the link above — it replaces your old copy (same name), and updates are automatic from then on.

## 安全について / About safety

このスクリプトは、あなたがログインしている Suno のページの中で動きます。

- 動くのは `suno.com` だけです
- 通信先は Suno(`suno.com`、`cdn1.suno.ai`)だけです。パスワードやメールアドレスを入力させたり、外部のサーバーへ送ったりはしません
- WAV の取得では、画面の「ダウンロード」と同じ手順で Suno の API を呼びます。そのため、ログイン中の認証情報(短時間だけ有効なトークン)をページから受け取り、Suno の API へ送ります。それ以外の場所へ送ったり、保存したりはしません
- パネルの位置だけ、お使いのブラウザの中(localStorage)に保存します
- コードはすべてこのリポジトリで読めます。自動更新を使うと、今後の更新内容も信頼してもらうことになります。変更の内容は [CHANGELOG.md](CHANGELOG.md) に書きます

It runs only on `suno.com`, talks only to Suno (`suno.com`, `cdn1.suno.ai`), and never asks for or sends passwords or e-mail addresses.
For WAV it takes your logged-in session's short-lived token from the page and sends it to Suno's own API, the same way Suno's download button does; it does not store it or send it anywhere else.
Auto-update means you trust future changes too — every change is listed in [CHANGELOG.md](CHANGELOG.md).

## ご利用にあたって / Please note

- **自分のアカウントの曲を、自分で保存するための道具です。** 他人の曲の大量取得や、Suno の利用規約に反する使い方はしないでください
- 短時間に数百曲などを一気に処理すると、アカウントに負荷がかかる可能性があります。少しずつ使うのがおすすめです
- Suno の画面が変わると動かなくなることがあります。その場合は [Issues](https://github.com/Cape-PC/suno-bulk-downloader/issues) でお知らせください
- Sunoの公式ツールではありません / This is not an official Suno tool

Use it only for your own tracks, in line with Suno's terms. Heavy bulk runs can load your account — work through your library in batches.
